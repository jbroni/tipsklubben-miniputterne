/**
 * Pure module building the form payload for submitting a group coupon to the
 * external Tips 13 form endpoint.
 *
 * No Prisma, fetch or environment access; callers supply all data.
 */

import { PICK_LABEL, PICK_ORDER, type PickValue } from "./picks";
import { getSystem, type SystemDefinition } from "./coupon-systems";
import {
  validateCoupon,
  type Coverage,
  type EditableRow,
} from "./group-coupon-editor";

/** Number of matches on a Tips-13 coupon. */
const SUBMISSION_MATCH_COUNT = 13;

/** Constant value of the INDDATER field. Encoded as Latin-1 on the wire. */
export const INDDATER_VALUE = "Inddatér Kupon";

/** Field name whose value is removed from the redacted body. */
const CODE_FIELD = "CODE";

/** Field name of the constant INDDATER field. */
const INDDATER_FIELD = "INDDATER";

/**
 * A single match row as needed for submission.
 */
export interface SubmissionRow {
  /** Match number (1..13) */
  matchNumber: number;
  /** Coverage level: single, half, or full */
  coverage: Coverage;
  /** Covered outcomes; order does not matter, output is in PICK_ORDER */
  outcomes: PickValue[];
  /** Base outcome for U-systems; ignored on single rows */
  baseOutcome: PickValue | null;
}

/**
 * A group coupon as needed for submission.
 */
export interface SubmissionCoupon {
  /** System code, e.g. "U8-3-100" */
  systemCode: string;
  /** Coupon status; only "final" coupons may be submitted */
  status: string;
  /** The coupon's match rows */
  rows: SubmissionRow[];
}

/**
 * Check whether a coupon may be submitted.
 *
 * Returns Danish validation messages; an empty array means the coupon is valid.
 */
export function validateForSubmission(coupon: SubmissionCoupon): string[] {
  const messages: string[] = [];

  if (coupon.status !== "final") {
    messages.push("Kuponen skal være endelig, før den kan indsendes.");
  }

  const matchNumbers = coupon.rows.map((row) => row.matchNumber).sort((a, b) => a - b);
  const expectedNumbers = Array.from(
    { length: SUBMISSION_MATCH_COUNT },
    (_, index) => index + 1
  );
  const hasExactNumbers =
    matchNumbers.length === SUBMISSION_MATCH_COUNT &&
    matchNumbers.every((matchNumber, index) => matchNumber === expectedNumbers[index]);
  if (!hasExactNumbers) {
    messages.push(
      `Kuponen skal have præcis ${SUBMISSION_MATCH_COUNT} kampe, nummereret 1 til ${SUBMISSION_MATCH_COUNT}.`
    );
  }

  const system = getSystem(coupon.systemCode);
  if (!system) {
    messages.push(`Ukendt system: ${coupon.systemCode}.`);
    return messages;
  }

  const editableRows: EditableRow[] = coupon.rows.map((row) => ({
    matchNumber: row.matchNumber,
    coverage: row.coverage,
    outcomes: row.outcomes,
    baseOutcome: row.baseOutcome,
    reasoning: "",
  }));
  for (const issue of validateCoupon(editableRows, system)) {
    messages.push(issue.message);
  }

  return messages;
}

/**
 * Build the ordered form fields for a coupon submission.
 *
 * Order: SYSTEM, KLUB, WEEK, then per match 1..13 O<n> (and U<n> for U-systems),
 * then CODE, then INDDATER.
 *
 * @throws Error if the system code is unknown, or a U-system multi-outcome row
 *   has no base outcome (run validateForSubmission first)
 */
export function buildSubmissionFields(
  coupon: SubmissionCoupon,
  week: number,
  klub: string,
  code: string
): [string, string][] {
  const system = getSystem(coupon.systemCode);
  if (!system) {
    throw new Error(`Unknown system code: ${coupon.systemCode}`);
  }

  const fields: [string, string][] = [
    ["SYSTEM", coupon.systemCode],
    ["KLUB", klub],
    ["WEEK", String(week)],
  ];

  const rows = coupon.rows.slice().sort((a, b) => a.matchNumber - b.matchNumber);
  for (const row of rows) {
    fields.push([`O${row.matchNumber}`, outcomeLabels(row.outcomes)]);
    if (system.requiresBaseRow) {
      fields.push([`U${row.matchNumber}`, baseLabel(row, system)]);
    }
  }

  fields.push(["CODE", code]);
  fields.push([INDDATER_FIELD, INDDATER_VALUE]);

  return fields;
}

/**
 * Encode fields as an application/x-www-form-urlencoded body.
 *
 * Values are percent-encoded with encodeURIComponent, except INDDATER, which is
 * Latin-1 encoded (the receiving site is legacy).
 */
export function encodeSubmissionBody(fields: [string, string][]): string {
  return fields
    .map(([name, value]) => {
      const encodedValue =
        name === INDDATER_FIELD ? encodeLatin1Form(value) : encodeURIComponent(value);
      return `${name}=${encodedValue}`;
    })
    .join("&");
}

/**
 * Encode fields exactly as encodeSubmissionBody does, but with the CODE field
 * removed. This is the form stored with a submission and used for staleness checks.
 */
export function redactedSubmissionBody(fields: [string, string][]): string {
  return encodeSubmissionBody(fields.filter(([name]) => name !== CODE_FIELD));
}

/**
 * Concatenate outcome glyphs in PICK_ORDER, e.g. ["AWAY", "HOME"] -> "12".
 */
function outcomeLabels(outcomes: PickValue[]): string {
  return PICK_ORDER.filter((outcome) => outcomes.includes(outcome))
    .map((outcome) => PICK_LABEL[outcome])
    .join("");
}

/**
 * U-field value: the base outcome label on multi-outcome rows, "NULL" on single rows.
 */
function baseLabel(row: SubmissionRow, system: SystemDefinition): string {
  if (row.coverage === "single") {
    return "NULL";
  }
  if (!row.baseOutcome) {
    throw new Error(
      `Match ${row.matchNumber} in system ${system.code} is missing its base outcome`
    );
  }
  return PICK_LABEL[row.baseOutcome];
}

/**
 * Form-encode a string as Latin-1: unreserved ASCII is kept, spaces become "+",
 * other characters become %XX of their Latin-1 code.
 */
function encodeLatin1Form(value: string): string {
  return Array.from(value)
    .map((char) => {
      if (char === " ") {
        return "+";
      }
      if (/^[A-Za-z0-9]$/.test(char)) {
        return char;
      }
      const code = char.codePointAt(0) ?? 0;
      if (code > 0xff) {
        throw new Error(`Character not encodable as Latin-1: ${char}`);
      }
      return `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

/**
 * Turn the HTML reply from the submission endpoint into plain text.
 *
 * Removes script and style blocks (including an unterminated one at the end),
 * strips remaining tags and collapses whitespace. The result is plain text
 * only; callers must render it as text, never as HTML.
 */
export function submissionResponseText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(script|style)\b[\s\S]*$/i, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(ENTITY_PATTERN, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
}

/** Named entities decoded in the reply. Matched case-sensitively. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aelig: "æ",
  oslash: "ø",
  aring: "å",
  AElig: "Æ",
  Oslash: "Ø",
  Aring: "Å",
  eacute: "é",
};

/**
 * Matches one entity: decimal (&#123;), hex (&#x7B;) or named (&amp;).
 * Replacing in a single pass decodes each entity exactly once, so "&amp;lt;"
 * becomes "&lt;" and "&#38;lt;" becomes "&lt;", never "<".
 */
const ENTITY_PATTERN = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+));/g;

/**
 * Decode one entity match. Invalid code points (zero, surrogates, above U+10FFFF)
 * and unknown names are left as written.
 */
function decodeEntity(
  match: string,
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined
): string {
  if (name !== undefined) {
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
      ? NAMED_ENTITIES[name]
      : match;
  }
  const codePoint = decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex ?? "", 16);
  if (
    !Number.isFinite(codePoint) ||
    codePoint === 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return match;
  }
  return String.fromCodePoint(codePoint);
}
