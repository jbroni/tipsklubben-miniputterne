import { prisma } from "@/lib/prisma";
import { isoWeekOf } from "@/lib/iso-week";
import {
  buildSubmissionFields,
  encodeSubmissionBody,
  redactedSubmissionBody,
  submissionResponseText,
  validateForSubmission,
  type SubmissionCoupon,
} from "@/lib/coupon-submission";
import type { Coverage } from "@/lib/group-coupon-editor";
import type { PickValue } from "@/lib/picks";
import type { GroupCoupon } from "@prisma/client";
import type { GroupCouponSubmissionStatus } from "@/types";
import type { ServiceResult } from "./result";

const DEFAULT_SUBMIT_URL = "https://bay.dyndns.dk/cgi-bin/KuponEval";
const SUBMIT_TIMEOUT_MS = 15000;
const MAX_REPLY_CHARS = 20000;
const MAX_ERROR_REPLY_CHARS = 300;
/** Stand-in for CODE when rebuilding the redacted body; CODE is removed from it anyway. */
const PLACEHOLDER_CODE = "PLACEHOLDER";

/**
 * Coupon shape needed for submission. Matches the GroupCoupon rows loaded with
 * their matches (and each match's Match relation) by Prisma.
 */
export type GroupCouponForSubmission = Pick<
  GroupCoupon,
  | "systemCode"
  | "status"
  | "submittedAt"
  | "submittedPayload"
  | "submissionHttpStatus"
  | "submissionResponse"
> & {
  matches: Array<{
    coverage: Coverage;
    outcomes: PickValue[];
    baseOutcome: PickValue | null;
    match: { matchNumber: number };
  }>;
};

/** Result of a successful submission. submittedAt is an ISO-8601 string. */
export interface GroupCouponSubmissionResult {
  week: number;
  submittedAt: string;
  submissionHttpStatus: number;
  submissionResponse: string;
}

/**
 * Read submission configuration from the environment at call time.
 * Never exposed to the client; NEXT_PUBLIC_* must not be used for these.
 */
function readSubmissionConfig(): { url: string; klub: string; code: string } {
  return {
    url: process.env.COUPON_SUBMIT_URL?.trim() || DEFAULT_SUBMIT_URL,
    klub: process.env.COUPON_SUBMIT_KLUB?.trim() ?? "",
    code: process.env.COUPON_SUBMIT_CODE?.trim() ?? "",
  };
}

function toSubmissionCoupon(coupon: GroupCouponForSubmission): SubmissionCoupon {
  return {
    systemCode: coupon.systemCode,
    status: coupon.status,
    rows: coupon.matches.map((m) => ({
      matchNumber: m.match.matchNumber,
      coverage: m.coverage,
      outcomes: m.outcomes,
      baseOutcome: m.baseOutcome,
    })),
  };
}

/** Remove every occurrence of the access code from text, so it never leaves the server. */
function scrubCode(text: string, code: string): string {
  return code ? text.split(code).join("***") : text;
}

/**
 * Log a failure with only the round, the error name and the cause code. The message,
 * request body, KLUB and CODE are deliberately never logged.
 */
function logSubmissionFailure(message: string, roundId: string, error: unknown): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : undefined;
  console.error(message, { roundId, name, code });
}

/** Read the reply as Latin-1 text, capped in length. An unreadable body yields "". */
async function readReply(response: Response): Promise<string> {
  try {
    const buffer = await response.arrayBuffer();
    return new TextDecoder("latin1").decode(buffer).slice(0, MAX_REPLY_CHARS);
  } catch {
    return "";
  }
}

/**
 * Whether the stored submission no longer matches the coupon as it would be sent now.
 * An invalid coupon (ignoring draft status) counts as stale.
 */
function isSubmissionStale(
  coupon: GroupCouponForSubmission,
  deadline: Date,
  klub: string
): boolean {
  if (!coupon.submittedPayload || !klub) {
    return false;
  }
  try {
    const submissionCoupon = toSubmissionCoupon(coupon);
    if (validateForSubmission({ ...submissionCoupon, status: "final" }).length > 0) {
      return true;
    }
    const fields = buildSubmissionFields(
      submissionCoupon,
      isoWeekOf(deadline),
      klub,
      PLACEHOLDER_CODE
    );
    return redactedSubmissionBody(fields) !== coupon.submittedPayload;
  } catch {
    return true;
  }
}

/**
 * Submission status for the builder: stored result, staleness and configuration.
 * Intended for admins and the round's delegate only; the caller enforces that.
 */
export function getSubmissionStatus(
  coupon: GroupCouponForSubmission,
  deadline: Date
): GroupCouponSubmissionStatus {
  const config = readSubmissionConfig();
  return {
    week: isoWeekOf(deadline),
    submittedAt: coupon.submittedAt?.toISOString() ?? null,
    submissionHttpStatus: coupon.submissionHttpStatus,
    submissionResponse: coupon.submissionResponse,
    isStale: isSubmissionStale(coupon, deadline, config.klub),
    configured: Boolean(config.klub && config.code),
  };
}

/**
 * Submit the saved final coupon of a round to the official tournament site.
 *
 * On a 2xx reply the coupon record is updated with the submission result. On any
 * other outcome (non-2xx, network error, timeout) the stored record is left unchanged.
 * Neither the access code nor the request body appears in any returned message.
 */
export async function submitGroupCoupon(
  roundId: string,
  userId: string
): Promise<ServiceResult<GroupCouponSubmissionResult>> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { deadline: true },
  });
  if (!round) {
    return { ok: false, code: "ROUND_NOT_FOUND", message: "Runde ikke fundet" };
  }

  const coupon = await prisma.groupCoupon.findUnique({
    where: { roundId },
    include: { matches: { include: { match: true } } },
  });
  if (!coupon) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Der er ingen gemt fælleskupon for denne runde.",
    };
  }

  const submissionCoupon = toSubmissionCoupon(coupon);
  const issues = validateForSubmission(submissionCoupon);
  if (issues.length > 0) {
    return {
      ok: false,
      code: "VALIDATION",
      message: ["Kuponen kan ikke indsendes:", ...issues].join("\n"),
    };
  }

  const config = readSubmissionConfig();
  if (!config.klub || !config.code) {
    return {
      ok: false,
      code: "VALIDATION",
      message:
        "Indsendelse til turneringen er ikke sat op på serveren (COUPON_SUBMIT_KLUB og COUPON_SUBMIT_CODE mangler). Kuponen er ikke sendt.",
    };
  }

  const week = isoWeekOf(round.deadline);

  let fields: [string, string][];
  let body: string;
  try {
    fields = buildSubmissionFields(submissionCoupon, week, config.klub, config.code);
    body = encodeSubmissionBody(fields);
  } catch {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Kuponen kunne ikke klargøres til indsendelse. Kuponen er ikke sendt.",
    };
  }

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
  } catch (error) {
    logSubmissionFailure("Coupon submission request failed", roundId, error);
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      code: "VALIDATION",
      message: timedOut
        ? "Turneringssiden svarede ikke inden for 15 sekunder. Der er ikke et klart svar, så kuponen er ikke markeret som indsendt. Tjek turneringssiden, før du prøver igen."
        : "Kunne ikke nå turneringssiden. Kuponen er ikke markeret som indsendt.",
    };
  }

  const replyText = scrubCode(await readReply(response), config.code);

  if (!response.ok) {
    const snippet = submissionResponseText(replyText).slice(0, MAX_ERROR_REPLY_CHARS);
    return {
      ok: false,
      code: "VALIDATION",
      message:
        `Turneringssiden svarede med HTTP ${response.status}. Kuponen er ikke markeret som indsendt.` +
        (snippet ? `\nSvar: ${snippet}` : ""),
    };
  }

  const submittedAt = new Date();
  try {
    await prisma.groupCoupon.update({
      where: { roundId },
      data: {
        submittedAt,
        submittedById: userId,
        submittedPayload: redactedSubmissionBody(fields),
        submissionHttpStatus: response.status,
        submissionResponse: replyText,
      },
    });
  } catch (error) {
    // The site accepted the coupon, but the record could not be stored.
    logSubmissionFailure(
      "Coupon accepted by submission site, but status could not be saved",
      roundId,
      error
    );
    return {
      ok: false,
      code: "VALIDATION",
      message:
        "Kuponen blev sendt til turneringssiden, men status kunne ikke gemmes. Tjek svaret på turneringssiden og kontakt en admin.",
    };
  }

  return {
    ok: true,
    data: {
      week,
      submittedAt: submittedAt.toISOString(),
      submissionHttpStatus: response.status,
      submissionResponse: replyText,
    },
  };
}
