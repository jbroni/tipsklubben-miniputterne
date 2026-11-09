import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Coverage } from "@/lib/group-coupon-editor";
import type { PickValue } from "@/lib/picks";

const mocks = vi.hoisted(() => ({
  prisma: {
    round: {
      findUnique: vi.fn(),
    },
    groupCoupon: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

import { getSubmissionStatus, submitGroupCoupon } from "./group-coupon-submission";

const KLUB = "000000000000";
const CODE = "999999";
const URL = "https://example.test/submit";
const DEFAULT_URL = "https://bay.dyndns.dk/cgi-bin/KuponEval";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROUND_ID = "00000000-0000-4000-8000-000000000002";

/** Saturday 15:00 Europe/Copenhagen (CET) in ISO week 46 of 2026. */
const DEADLINE = new Date("2026-11-14T14:00:00Z");
/** Saturday of ISO week 47 of 2026. */
const DEADLINE_NEXT_WEEK = new Date("2026-11-21T14:00:00Z");

type Row = {
  matchNumber: number;
  coverage: Coverage;
  outcomes: PickValue[];
  baseOutcome: PickValue | null;
};

function makeRow(
  matchNumber: number,
  outcomes: PickValue[],
  baseOutcome: PickValue | null = null
): Row {
  const coverage: Coverage =
    outcomes.length === 3 ? "full" : outcomes.length === 2 ? "half" : "single";
  return { matchNumber, coverage, outcomes, baseOutcome };
}

/** Complete U8-3-100 rows: 8 full, 3 half, 2 single. */
function validRows(): Row[] {
  const rows: Row[] = [];
  for (let n = 1; n <= 8; n++) rows.push(makeRow(n, ["HOME", "DRAW", "AWAY"], "HOME"));
  for (let n = 9; n <= 11; n++) rows.push(makeRow(n, ["HOME", "AWAY"], "AWAY"));
  for (let n = 12; n <= 13; n++) rows.push(makeRow(n, ["DRAW"], null));
  return rows;
}

/** Coupon shaped like the Prisma query result used by the service. */
function dbCoupon(
  overrides: Partial<{
    status: "draft" | "final";
    rows: Row[];
    submittedAt: Date | null;
    submittedPayload: string | null;
    submissionHttpStatus: number | null;
    submissionResponse: string | null;
  }> = {}
) {
  const rows = overrides.rows ?? validRows();
  return {
    systemCode: "U8-3-100",
    status: overrides.status ?? ("final" as const),
    submittedAt: overrides.submittedAt ?? null,
    submittedPayload: overrides.submittedPayload ?? null,
    submissionHttpStatus: overrides.submissionHttpStatus ?? null,
    submissionResponse: overrides.submissionResponse ?? null,
    matches: rows.map((row) => ({
      coverage: row.coverage,
      outcomes: row.outcomes,
      baseOutcome: row.baseOutcome,
      match: { matchNumber: row.matchNumber },
    })),
  };
}

function fetchBody(fetchMock: ReturnType<typeof vi.fn>): string {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return String(init.body);
}

describe("group-coupon-submission service", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalUrl: string | undefined;

  beforeEach(() => {
    mocks.prisma.round.findUnique.mockReset();
    mocks.prisma.groupCoupon.findUnique.mockReset();
    mocks.prisma.groupCoupon.update.mockReset();

    mocks.prisma.round.findUnique.mockResolvedValue({ deadline: DEADLINE });
    mocks.prisma.groupCoupon.findUnique.mockResolvedValue(dbCoupon());
    mocks.prisma.groupCoupon.update.mockResolvedValue({});

    originalUrl = process.env.COUPON_SUBMIT_URL;
    vi.stubEnv("COUPON_SUBMIT_KLUB", KLUB);
    vi.stubEnv("COUPON_SUBMIT_CODE", CODE);
    vi.stubEnv("COUPON_SUBMIT_URL", URL);

    fetchMock = vi.fn(async () => new Response("Tak for din kupon", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (originalUrl === undefined) {
      delete process.env.COUPON_SUBMIT_URL;
    } else {
      process.env.COUPON_SUBMIT_URL = originalUrl;
    }
    vi.restoreAllMocks();
  });

  describe("submitGroupCoupon", () => {
    it("posts the coupon once to the configured URL and stores the result", async () => {
      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(URL);
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        "Content-Type": "application/x-www-form-urlencoded",
      });
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);

      const body = String(init.body);
      expect(body).toContain(`CODE=${CODE}`);
      expect(body.endsWith("INDDATER=Inddat%E9r+Kupon")).toBe(true);
      expect(body).toContain("WEEK=46");
      expect(body).toContain(`KLUB=${KLUB}`);

      expect(mocks.prisma.groupCoupon.update).toHaveBeenCalledTimes(1);
      const updateArgs = mocks.prisma.groupCoupon.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ roundId: ROUND_ID });
      expect(updateArgs.data.submittedById).toBe(USER_ID);
      expect(updateArgs.data.submittedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.submissionHttpStatus).toBe(200);
      expect(updateArgs.data.submissionResponse).toBe("Tak for din kupon");
      expect(updateArgs.data.submittedPayload).toBeTypeOf("string");
      expect(updateArgs.data.submittedPayload).not.toContain(CODE);
      expect(updateArgs.data.submittedPayload).not.toContain("CODE=");
      expect(updateArgs.data.submittedPayload).toContain("INDDATER=Inddat%E9r+Kupon");
    });

    it("returns week and submission details without the access code", async () => {
      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.week).toBe(46);
      expect(result.data.submissionHttpStatus).toBe(200);
      expect(result.data.submissionResponse).toBe("Tak for din kupon");
      expect(Number.isNaN(Date.parse(result.data.submittedAt))).toBe(false);
      expect(JSON.stringify(result)).not.toContain(CODE);
    });

    it("uses the default submission URL when COUPON_SUBMIT_URL is unset", async () => {
      delete process.env.COUPON_SUBMIT_URL;

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(true);
      expect(fetchMock.mock.calls[0][0]).toBe(DEFAULT_URL);
    });

    it("decodes the Latin-1 reply bytes, so 0xE9 becomes é", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(Uint8Array.from([0x54, 0x61, 0x6b, 0x20, 0xe9]), { status: 200 })
      );

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.submissionResponse).toBe("Tak é");
      expect(mocks.prisma.groupCoupon.update.mock.calls[0][0].data.submissionResponse).toBe(
        "Tak é"
      );
    });

    it("caps the stored reply at 20000 characters", async () => {
      fetchMock.mockResolvedValueOnce(new Response("a".repeat(25000), { status: 200 }));

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.submissionResponse).toHaveLength(20000);
      expect(mocks.prisma.groupCoupon.update.mock.calls[0][0].data.submissionResponse).toHaveLength(
        20000
      );
    });

    it("masks the access code if the reply echoes it, in storage and in the result", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(`Kvittering for kode ${CODE} modtaget`, { status: 200 })
      );

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.submissionResponse).toBe("Kvittering for kode *** modtaget");
      expect(result.data.submissionResponse).not.toContain(CODE);
      const stored = mocks.prisma.groupCoupon.update.mock.calls[0][0].data;
      expect(stored.submissionResponse).toBe("Kvittering for kode *** modtaget");
      expect(stored.submissionResponse).not.toContain(CODE);
    });

    it("returns ROUND_NOT_FOUND when the round does not exist", async () => {
      mocks.prisma.round.findUnique.mockResolvedValueOnce(null);

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result).toMatchObject({ ok: false, code: "ROUND_NOT_FOUND" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("returns VALIDATION when the round has no coupon", async () => {
      mocks.prisma.groupCoupon.findUnique.mockResolvedValueOnce(null);

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("returns VALIDATION for a draft coupon without sending it", async () => {
      mocks.prisma.groupCoupon.findUnique.mockResolvedValueOnce(dbCoupon({ status: "draft" }));

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("VALIDATION");
      expect(result.message).toContain("endelig");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("returns VALIDATION when KLUB is missing", async () => {
      vi.stubEnv("COUPON_SUBMIT_KLUB", "");

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("returns VALIDATION when CODE is missing", async () => {
      vi.stubEnv("COUPON_SUBMIT_CODE", "");

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("fails on a non-2xx reply without storing and without leaking the code", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(`<html>Serverfejl for ${CODE}</html>`, { status: 500 })
      );

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("VALIDATION");
      expect(result.message).toContain("500");
      expect(result.message).not.toContain(CODE);
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("fails on a network error without storing and without leaking the code", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).not.toContain(CODE);
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("fails on a timeout without storing and without leaking the code", async () => {
      const timeout = Object.assign(new Error("The operation timed out."), {
        name: "TimeoutError",
      });
      fetchMock.mockRejectedValueOnce(timeout);

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toContain("15 sekunder");
      expect(result.message).not.toContain(CODE);
      expect(mocks.prisma.groupCoupon.update).not.toHaveBeenCalled();
    });

    it("reports that the coupon was sent when a 2xx reply cannot be stored", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.prisma.groupCoupon.update.mockRejectedValueOnce(new Error("db down"));

      const result = await submitGroupCoupon(ROUND_ID, USER_ID);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toContain("sendt");
      expect(result.message).not.toContain(CODE);
    });
  });

  describe("getSubmissionStatus", () => {
    /** Submit a coupon and return the DB-shaped record as it would be stored afterwards. */
    async function submittedRecord(rows: Row[] = validRows()) {
      mocks.prisma.groupCoupon.findUnique.mockResolvedValueOnce(dbCoupon({ rows }));
      await submitGroupCoupon(ROUND_ID, USER_ID);
      const stored = mocks.prisma.groupCoupon.update.mock.calls.at(-1)![0].data;
      return dbCoupon({
        rows,
        submittedAt: stored.submittedAt,
        submittedPayload: stored.submittedPayload,
        submissionHttpStatus: stored.submissionHttpStatus,
        submissionResponse: stored.submissionResponse,
      });
    }

    it("reports never submitted with no submittedAt and not stale", () => {
      const status = getSubmissionStatus(dbCoupon(), DEADLINE);

      expect(status.submittedAt).toBeNull();
      expect(status.isStale).toBe(false);
      expect(status.week).toBe(46);
      expect(status.configured).toBe(true);
    });

    it("is not stale when the coupon matches the stored submission", async () => {
      const record = await submittedRecord();

      const status = getSubmissionStatus(record, DEADLINE);

      expect(status.isStale).toBe(false);
      expect(status.submittedAt).toBe(record.submittedAt!.toISOString());
      expect(status.submissionHttpStatus).toBe(200);
      expect(status.submissionResponse).toBe("Tak for din kupon");
    });

    it("is stale when a row has changed since submission", async () => {
      const record = await submittedRecord();
      // Change only the base outcome of a full row: coverage stays valid, the payload differs.
      const rows = validRows();
      rows[0] = makeRow(1, ["HOME", "DRAW", "AWAY"], "AWAY");

      const status = getSubmissionStatus(
        { ...record, matches: dbCoupon({ rows }).matches },
        DEADLINE
      );

      expect(status.isStale).toBe(true);
    });

    it("is stale when the deadline has moved to another ISO week", async () => {
      const record = await submittedRecord();

      const status = getSubmissionStatus(record, DEADLINE_NEXT_WEEK);

      expect(status.week).toBe(47);
      expect(status.isStale).toBe(true);
    });

    it("is not stale when the coupon is set back to draft with unchanged picks", async () => {
      const record = await submittedRecord();

      const status = getSubmissionStatus({ ...record, status: "draft" }, DEADLINE);

      expect(status.isStale).toBe(false);
    });

    it("is stale without throwing when the stored rows are incomplete", async () => {
      const record = await submittedRecord();
      const incomplete = { ...record, matches: record.matches.slice(0, 12) };

      let status: ReturnType<typeof getSubmissionStatus> | undefined;
      expect(() => {
        status = getSubmissionStatus(incomplete, DEADLINE);
      }).not.toThrow();
      expect(status!.isStale).toBe(true);
    });

    it("is stale without throwing when a stored row is invalid", async () => {
      const record = await submittedRecord();
      const broken = {
        ...record,
        matches: record.matches.map((m, index) =>
          index === 8 ? { ...m, baseOutcome: null } : m
        ),
      };

      let status: ReturnType<typeof getSubmissionStatus> | undefined;
      expect(() => {
        status = getSubmissionStatus(broken, DEADLINE);
      }).not.toThrow();
      expect(status!.isStale).toBe(true);
    });

    it("reports configured false when KLUB is missing", () => {
      vi.stubEnv("COUPON_SUBMIT_KLUB", "");

      expect(getSubmissionStatus(dbCoupon(), DEADLINE).configured).toBe(false);
    });

    it("reports configured false when CODE is missing", () => {
      vi.stubEnv("COUPON_SUBMIT_CODE", "");

      expect(getSubmissionStatus(dbCoupon(), DEADLINE).configured).toBe(false);
    });

    it("never includes the access code in the returned status", async () => {
      const record = await submittedRecord();

      const status = getSubmissionStatus(record, DEADLINE);

      expect(JSON.stringify(status)).not.toContain(CODE);
    });
  });
});
