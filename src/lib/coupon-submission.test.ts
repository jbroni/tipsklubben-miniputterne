import { describe, it, expect } from "vitest";
import {
  buildSubmissionFields,
  encodeSubmissionBody,
  redactedSubmissionBody,
  submissionResponseText,
  validateForSubmission,
  type SubmissionCoupon,
  type SubmissionRow,
} from "./coupon-submission";
import type { PickValue } from "./picks";

const KLUB = "000000000000";
const CODE = "999999";
const WEEK = 46;

/** Build a row; coverage is derived from the number of outcomes. */
function makeRow(
  matchNumber: number,
  outcomes: PickValue[],
  baseOutcome: PickValue | null = null
): SubmissionRow {
  const coverage =
    outcomes.length === 3 ? "full" : outcomes.length === 2 ? "half" : "single";
  return { matchNumber, coverage, outcomes, baseOutcome };
}

/**
 * Complete U8-3-100 coupon: 8 full, 3 half, 2 single (13 matches).
 * Matches 1-8 full, 9-11 half, 12-13 single.
 */
function validUCoupon(): SubmissionCoupon {
  const rows: SubmissionRow[] = [];
  for (let n = 1; n <= 8; n++) {
    rows.push(makeRow(n, ["HOME", "DRAW", "AWAY"], "HOME"));
  }
  for (let n = 9; n <= 11; n++) {
    rows.push(makeRow(n, ["HOME", "AWAY"], "AWAY"));
  }
  for (let n = 12; n <= 13; n++) {
    rows.push(makeRow(n, ["DRAW"], null));
  }
  return { systemCode: "U8-3-100", status: "final", rows };
}

/** Complete R5-5-108 coupon: 5 full, 5 half, 3 single, no base outcomes. */
function validRCoupon(): SubmissionCoupon {
  const rows: SubmissionRow[] = [];
  for (let n = 1; n <= 5; n++) rows.push(makeRow(n, ["HOME", "DRAW", "AWAY"]));
  for (let n = 6; n <= 10; n++) rows.push(makeRow(n, ["HOME", "AWAY"]));
  for (let n = 11; n <= 13; n++) rows.push(makeRow(n, ["AWAY"]));
  return { systemCode: "R5-5-108", status: "final", rows };
}

/** Complete M0-7-128 coupon: 0 full, 7 half, 6 single, no base outcomes. */
function validMCoupon(): SubmissionCoupon {
  const rows: SubmissionRow[] = [];
  for (let n = 1; n <= 7; n++) rows.push(makeRow(n, ["DRAW", "AWAY"]));
  for (let n = 8; n <= 13; n++) rows.push(makeRow(n, ["HOME"]));
  return { systemCode: "M0-7-128", status: "final", rows };
}

function fieldsToObject(fields: [string, string][]): Record<string, string> {
  return Object.fromEntries(fields);
}

describe("buildSubmissionFields (U-system)", () => {
  it("emits fields in order SYSTEM, KLUB, WEEK, O1,U1,...,O13,U13, CODE, INDDATER", () => {
    const fields = buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE);
    const names = fields.map(([name]) => name);

    const expected = ["SYSTEM", "KLUB", "WEEK"];
    for (let n = 1; n <= 13; n++) {
      expected.push(`O${n}`, `U${n}`);
    }
    expected.push("CODE", "INDDATER");

    expect(names).toEqual(expected);
  });

  it("writes the system code, klub, week, code and INDDATER constant values", () => {
    const fields = fieldsToObject(
      buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE)
    );
    expect(fields.SYSTEM).toBe("U8-3-100");
    expect(fields.KLUB).toBe(KLUB);
    expect(fields.WEEK).toBe("46");
    expect(fields.CODE).toBe(CODE);
    expect(fields.INDDATER).toBe("Inddatér Kupon");
  });

  it("writes U as NULL on single rows", () => {
    const fields = fieldsToObject(
      buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE)
    );
    expect(fields.U12).toBe("NULL");
    expect(fields.U13).toBe("NULL");
  });

  it("writes the base label on full and half rows", () => {
    const fields = fieldsToObject(
      buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE)
    );
    // Full row 1: base HOME -> "1"
    expect(fields.O1).toBe("1X2");
    expect(fields.U1).toBe("1");
    // Half row 9: outcomes HOME/AWAY, base AWAY -> "2"
    expect(fields.O9).toBe("12");
    expect(fields.U9).toBe("2");
  });

  it("normalises out-of-order outcomes to 1X, X2, 12 and 1X2", () => {
    const coupon = validUCoupon();
    coupon.rows[0] = makeRow(1, ["AWAY", "DRAW", "HOME"], "HOME"); // -> 1X2
    coupon.rows[1] = makeRow(2, ["AWAY", "HOME"], "AWAY"); // -> 12
    coupon.rows[2] = makeRow(3, ["DRAW", "HOME"], "HOME"); // -> 1X
    coupon.rows[3] = makeRow(4, ["AWAY", "DRAW"], "DRAW"); // -> X2

    const fields = fieldsToObject(buildSubmissionFields(coupon, WEEK, KLUB, CODE));
    expect(fields.O1).toBe("1X2");
    expect(fields.O2).toBe("12");
    expect(fields.O3).toBe("1X");
    expect(fields.O4).toBe("X2");
    expect(fields.U4).toBe("X");
  });

  it("emits rows by matchNumber even when rows are supplied unsorted", () => {
    const sorted = buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE);
    const reversedCoupon = validUCoupon();
    reversedCoupon.rows.reverse();
    const reversed = buildSubmissionFields(reversedCoupon, WEEK, KLUB, CODE);

    expect(reversed).toEqual(sorted);
    expect(reversed.map(([name]) => name)).toEqual(sorted.map(([name]) => name));
  });

  it("gives NULL for a single row even when a stray baseOutcome is set", () => {
    const coupon = validUCoupon();
    coupon.rows[11] = makeRow(12, ["DRAW"], "AWAY");
    const fields = fieldsToObject(buildSubmissionFields(coupon, WEEK, KLUB, CODE));
    expect(fields.U12).toBe("NULL");
  });

  it("throws for an unknown system code", () => {
    const coupon = { ...validUCoupon(), systemCode: "X1-1-1" };
    expect(() => buildSubmissionFields(coupon, WEEK, KLUB, CODE)).toThrow(
      "Unknown system code"
    );
  });

  it("throws when a half row in a U-system has no base outcome", () => {
    const coupon = validUCoupon();
    coupon.rows[8] = makeRow(9, ["HOME", "AWAY"], null);
    expect(() => buildSubmissionFields(coupon, WEEK, KLUB, CODE)).toThrow(
      "missing its base outcome"
    );
  });
});

describe("buildSubmissionFields (R- and M-systems)", () => {
  it("emits no U fields for an R-system coupon", () => {
    const names = buildSubmissionFields(validRCoupon(), WEEK, KLUB, CODE).map(
      ([name]) => name
    );
    expect(names.filter((name) => /^U\d+$/.test(name))).toEqual([]);
    expect(names).toHaveLength(3 + 13 + 2);
  });

  it("emits no U fields for an M-system coupon", () => {
    const names = buildSubmissionFields(validMCoupon(), WEEK, KLUB, CODE).map(
      ([name]) => name
    );
    expect(names.filter((name) => /^U\d+$/.test(name))).toEqual([]);
    expect(names).toHaveLength(3 + 13 + 2);
  });

  it("emits R-system half rows without a base outcome without throwing", () => {
    const fields = fieldsToObject(
      buildSubmissionFields(validRCoupon(), WEEK, KLUB, CODE)
    );
    expect(fields.SYSTEM).toBe("R5-5-108");
    expect(fields.O6).toBe("12");
  });
});

describe("encodeSubmissionBody", () => {
  it("ends with INDDATER=Inddat%E9r+Kupon", () => {
    const body = encodeSubmissionBody(
      buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE)
    );
    expect(body.endsWith("INDDATER=Inddat%E9r+Kupon")).toBe(true);
  });

  it("does not contain UTF-8 encoding of é", () => {
    const body = encodeSubmissionBody(
      buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE)
    );
    expect(body).not.toContain("%C3%A9");
  });

  it("starts with the expected leading fields and encodes U values", () => {
    const body = encodeSubmissionBody(
      buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE)
    );
    expect(
      body.startsWith("SYSTEM=U8-3-100&KLUB=000000000000&WEEK=46&O1=1X2&U1=1&")
    ).toBe(true);
    expect(body).toContain("&U12=NULL&O13=X&U13=NULL&CODE=999999&");
  });

  it("encodes the fields as name=value pairs joined by &, in field order", () => {
    const fields = buildSubmissionFields(validRCoupon(), WEEK, KLUB, CODE);
    const body = encodeSubmissionBody(fields);
    expect(body.split("&")).toHaveLength(fields.length);
  });
});

describe("redactedSubmissionBody", () => {
  it("contains no CODE field and no code value", () => {
    const fields = buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE);
    const redacted = redactedSubmissionBody(fields);
    expect(redacted.split("&").some((pair) => pair.startsWith("CODE="))).toBe(false);
    expect(redacted).not.toContain("999999");
  });

  it("is otherwise identical to the encoded body with the CODE pair removed", () => {
    const fields = buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE);
    const encoded = encodeSubmissionBody(fields);
    const expected = encoded
      .split("&")
      .filter((pair) => !pair.startsWith("CODE="))
      .join("&");
    expect(redactedSubmissionBody(fields)).toBe(expected);
  });

  it("still ends with the INDDATER pair", () => {
    const fields = buildSubmissionFields(validUCoupon(), WEEK, KLUB, CODE);
    expect(redactedSubmissionBody(fields).endsWith("INDDATER=Inddat%E9r+Kupon")).toBe(
      true
    );
  });
});

describe("validateForSubmission", () => {
  it("returns no issues for a complete final U-system coupon", () => {
    expect(validateForSubmission(validUCoupon())).toEqual([]);
  });

  it("returns no issues for complete final R- and M-system coupons", () => {
    expect(validateForSubmission(validRCoupon())).toEqual([]);
    expect(validateForSubmission(validMCoupon())).toEqual([]);
  });

  it("reports an issue for a draft coupon", () => {
    const coupon = { ...validUCoupon(), status: "draft" };
    const issues = validateForSubmission(coupon);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("endelig");
  });

  it("reports an issue for a coupon with only 12 rows", () => {
    const coupon = validUCoupon();
    coupon.rows = coupon.rows.slice(0, 12);
    const issues = validateForSubmission(coupon);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((message) => message.includes("13 kampe"))).toBe(true);
  });

  it("reports an issue for a duplicate matchNumber", () => {
    const coupon = validUCoupon();
    coupon.rows[12] = { ...coupon.rows[12], matchNumber: 12 };
    const issues = validateForSubmission(coupon);
    expect(issues.some((message) => message.includes("13 kampe"))).toBe(true);
  });

  it("reports an issue for an unknown system", () => {
    const coupon = { ...validUCoupon(), systemCode: "X1-1-1" };
    const issues = validateForSubmission(coupon);
    expect(issues.some((message) => message.includes("Ukendt system"))).toBe(true);
  });

  it("reports an issue when the coverage budget does not match the system", () => {
    const coupon = validUCoupon();
    // Turn one full row into a single row: 7 full / 3 half / 3 single instead of 8/3/2
    coupon.rows[0] = makeRow(1, ["HOME"], null);
    const issues = validateForSubmission(coupon);
    expect(issues.some((message) => message.includes("kræver"))).toBe(true);
  });

  it("reports an issue for a U-system half row missing its base outcome", () => {
    const coupon = validUCoupon();
    coupon.rows[8] = makeRow(9, ["HOME", "AWAY"], null);
    const issues = validateForSubmission(coupon);
    expect(
      issues.some((message) => message.includes("Kamp 9") && message.includes("udgangstegn"))
    ).toBe(true);
  });
});

describe("submissionResponseText", () => {
  it("returns plain text unchanged", () => {
    expect(submissionResponseText("Tak for din kupon")).toBe("Tak for din kupon");
  });

  it("strips tags and collapses whitespace", () => {
    expect(submissionResponseText("<p>Tak\n\n  <b>for</b>   kupon</p>")).toBe(
      "Tak for kupon"
    );
  });

  it("removes script and style blocks with their content", () => {
    const html =
      "<style>p { color: red; }</style>Hej<script>alert('x')</script> verden";
    expect(submissionResponseText(html)).toBe("Hej verden");
  });

  it("removes an unterminated script block at the end", () => {
    expect(submissionResponseText("Kvittering <script>alert(1)")).toBe("Kvittering");
  });

  it("returns an empty string for an empty reply", () => {
    expect(submissionResponseText("")).toBe("");
  });
});
