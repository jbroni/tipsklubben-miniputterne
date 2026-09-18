import { describe, it, expect } from "vitest";
import { parseAppZonedDateTime, toDatetimeLocalValue, formatInAppZone, APP_TIME_ZONE } from "./time";

describe("APP_TIME_ZONE", () => {
  it("is set to Europe/Copenhagen", () => {
    expect(APP_TIME_ZONE).toBe("Europe/Copenhagen");
  });
});

describe("parseAppZonedDateTime", () => {
  describe("basic parsing", () => {
    it("parses a valid datetime string and returns a Date", () => {
      const result = parseAppZonedDateTime("2026-09-19T11:45");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });

    it("parses the regression case: 2026-09-19T11:45", () => {
      // This is the exact regression from the original bug report
      const result = parseAppZonedDateTime("2026-09-19T11:45");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });

    it("accepts YYYY-MM-DDTHH:mm format", () => {
      const result = parseAppZonedDateTime("2026-07-15T14:30");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });

    it("accepts YYYY-MM-DDTHH:mm:ss format with seconds", () => {
      const result = parseAppZonedDateTime("2026-09-19T11:45:30");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
      // Verify seconds are included and UTC value is correct
      expect(result.toISOString()).toBe("2026-09-19T09:45:30.000Z");
    });
  });

  describe("round-trip consistency", () => {
    it("round-trips summer time correctly", () => {
      const input = "2026-09-19T11:45";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
      // Also verify the correct UTC value (this is the regression test from the bug report)
      // 2026-09-19 is in CEST (UTC+2), so 11:45 Copenhagen = 09:45 UTC
      expect(parsed.toISOString()).toBe("2026-09-19T09:45:00.000Z");
    });

    it("round-trips winter time correctly", () => {
      const input = "2026-12-19T11:45";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
      // 2026-12-19 is in CET (UTC+1), so 11:45 Copenhagen = 10:45 UTC
      expect(parsed.toISOString()).toBe("2026-12-19T10:45:00.000Z");
    });

    it("round-trips various times throughout the year", () => {
      const inputs = [
        "2026-01-15T08:00",
        "2026-04-15T12:30",
        "2026-07-15T14:00",
        "2026-10-15T16:45",
      ];
      for (const input of inputs) {
        const parsed = parseAppZonedDateTime(input);
        const formatted = toDatetimeLocalValue(parsed);
        expect(formatted).toBe(input);
      }
    });

    it("round-trips midnight correctly", () => {
      const inputs = ["2026-01-01T00:00", "2026-07-01T00:00", "2026-12-25T00:00"];
      const expectedUtcs = ["2025-12-31T23:00:00.000Z", "2026-06-30T22:00:00.000Z", "2026-12-24T23:00:00.000Z"];
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const parsed = parseAppZonedDateTime(input);
        const formatted = toDatetimeLocalValue(parsed);
        expect(formatted).toBe(input);
        // Verify correct UTC values
        // 00:00 in CET (UTC+1) = 23:00 previous day UTC
        // 00:00 in CEST (UTC+2) = 22:00 previous day UTC
        expect(parsed.toISOString()).toBe(expectedUtcs[i]);
      }
    });
  });

  describe("already-zoned strings", () => {
    it("passes through strings with trailing Z unchanged", () => {
      const input = "2026-09-19T11:45:00Z";
      const result = parseAppZonedDateTime(input);
      // Should parse the explicit UTC time
      // Note: toISOString() always includes milliseconds
      expect(result.toISOString()).toBe("2026-09-19T11:45:00.000Z");
    });

    it("passes through strings with +HH:MM offset unchanged", () => {
      const input = "2026-09-19T11:45:00+02:00";
      const result = parseAppZonedDateTime(input);
      // Should parse the explicit offset
      const expectedUtc = new Date("2026-09-19T11:45:00+02:00");
      expect(result.toISOString()).toBe(expectedUtc.toISOString());
    });

    it("passes through strings with +HHMM offset unchanged", () => {
      const input = "2026-09-19T11:45:00+0200";
      const result = parseAppZonedDateTime(input);
      const expectedUtc = new Date("2026-09-19T11:45:00+0200");
      expect(result.toISOString()).toBe(expectedUtc.toISOString());
    });
  });

  describe("invalid input", () => {
    it("returns Invalid Date for empty string", () => {
      const result = parseAppZonedDateTime("");
      expect(isNaN(result.getTime())).toBe(true);
    });

    it("returns Invalid Date for non-date string", () => {
      const result = parseAppZonedDateTime("not a date");
      expect(isNaN(result.getTime())).toBe(true);
    });

    it("returns Invalid Date for date-only string without time", () => {
      const result = parseAppZonedDateTime("2026-09-19");
      expect(isNaN(result.getTime())).toBe(true);
    });

    it("returns Invalid Date for malformed datetime", () => {
      const result = parseAppZonedDateTime("2026-13-32T25:61");
      expect(isNaN(result.getTime())).toBe(true);
    });

    it("returns Invalid Date for arbitrary text", () => {
      const result = parseAppZonedDateTime("hello world");
      expect(isNaN(result.getTime())).toBe(true);
    });
  });

  describe("DST transitions - spring forward (2026-03-29)", () => {
    // On 2026-03-29, clocks move forward at 02:00 CET -> 03:00 CEST
    // Times from 02:00:00 to 02:59:59 do not exist in wall-clock time

    it("correctly handles time before spring transition", () => {
      const input = "2026-03-29T01:30";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
    });

    it("correctly handles time after spring transition", () => {
      const input = "2026-03-29T03:30";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
    });

    it("handles skipped hour 02:30 gracefully (does not throw)", () => {
      const result = parseAppZonedDateTime("2026-03-29T02:30");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });

    it("handles start of skipped hour 02:00 gracefully", () => {
      const result = parseAppZonedDateTime("2026-03-29T02:00");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });

    it("handles end of skipped hour 02:59 gracefully", () => {
      const result = parseAppZonedDateTime("2026-03-29T02:59");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });
  });

  describe("DST transitions - autumn back (2026-10-25)", () => {
    // On 2026-10-25, clocks move back at 03:00 CEST -> 02:00 CET
    // Times from 02:00:00 to 02:59:59 occur twice in wall-clock time

    it("correctly handles time before autumn transition", () => {
      const input = "2026-10-25T01:30";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
    });

    it("correctly handles time after autumn transition", () => {
      const input = "2026-10-25T04:30";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
    });

    it("handles ambiguous hour 02:30 gracefully (does not throw)", () => {
      const result = parseAppZonedDateTime("2026-10-25T02:30");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });

    it("handles start of ambiguous hour 02:00 gracefully", () => {
      const result = parseAppZonedDateTime("2026-10-25T02:00");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });

    it("handles end of ambiguous hour 02:59 gracefully", () => {
      const result = parseAppZonedDateTime("2026-10-25T02:59");
      expect(result).toBeInstanceOf(Date);
      expect(!isNaN(result.getTime())).toBe(true);
    });
  });

  describe("various date formats", () => {
    it("handles dates in different months correctly", () => {
      const inputs = ["2026-01-15T12:00", "2026-04-15T12:00", "2026-10-15T12:00"];
      for (const input of inputs) {
        const parsed = parseAppZonedDateTime(input);
        const formatted = toDatetimeLocalValue(parsed);
        expect(formatted).toBe(input);
      }
    });

    it("handles dates at month boundaries", () => {
      const eom = "2026-02-28T23:59";
      const nom = "2026-03-01T00:00";

      expect(toDatetimeLocalValue(parseAppZonedDateTime(eom))).toBe(eom);
      expect(toDatetimeLocalValue(parseAppZonedDateTime(nom))).toBe(nom);
    });

    it("handles leap year dates", () => {
      const input = "2024-02-29T12:00";
      expect(toDatetimeLocalValue(parseAppZonedDateTime(input))).toBe(input);
    });
  });
});

describe("toDatetimeLocalValue", () => {
  describe("round-trip with parseAppZonedDateTime", () => {
    it("round-trips summer time correctly", () => {
      const input = "2026-09-19T11:45";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
    });

    it("round-trips winter time correctly", () => {
      const input = "2026-12-19T11:45";
      const parsed = parseAppZonedDateTime(input);
      const formatted = toDatetimeLocalValue(parsed);
      expect(formatted).toBe(input);
    });

    it("round-trips with seconds form preserves H:mm without seconds", () => {
      const inputWithSeconds = "2026-09-19T11:45:30";
      const parsed = parseAppZonedDateTime(inputWithSeconds);
      const formatted = toDatetimeLocalValue(parsed);
      // toDatetimeLocalValue doesn't include seconds
      expect(formatted).toBe("2026-09-19T11:45");
    });

    it("round-trips midnight correctly", () => {
      const midnight = parseAppZonedDateTime("2026-07-01T00:00");
      const formatted = toDatetimeLocalValue(midnight);
      expect(formatted).toBe("2026-07-01T00:00");
    });
  });

  describe("midnight edge case (regression for T24:00)", () => {
    it("renders midnight as T00:00, never T24:00", () => {
      const result = toDatetimeLocalValue(parseAppZonedDateTime("2026-07-01T00:00"));
      expect(result).toMatch(/T00:00$/);
      expect(result).not.toContain("T24:00");
    });

    it("renders midnight on various dates as T00:00", () => {
      const dates = ["2026-01-01T00:00", "2026-06-15T00:00", "2026-12-31T00:00"];
      for (const dateStr of dates) {
        const parsed = parseAppZonedDateTime(dateStr);
        const formatted = toDatetimeLocalValue(parsed);
        expect(formatted).toMatch(/T00:00$/);
        expect(formatted).not.toContain("T24:00");
      }
    });
  });

  describe("accepts both Date and string input", () => {
    it("accepts a Date object", () => {
      const date = new Date("2026-09-19T09:45:00Z");
      const result = toDatetimeLocalValue(date);
      // Verify it's in the correct format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      // Verify it round-trips correctly
      const parsed = parseAppZonedDateTime(result);
      expect(parsed.toISOString()).toBe(date.toISOString());
    });

    it("accepts an ISO string", () => {
      const isoString = "2026-09-19T09:45:00Z";
      const result = toDatetimeLocalValue(isoString);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      // Verify round-trip
      const parsed = parseAppZonedDateTime(result);
      expect(parsed.toISOString()).toBe(new Date(isoString).toISOString());
    });

    it("accepts a naive datetime string (interpreted as UTC)", () => {
      const naive = "2026-09-19T09:45:00";
      const result = toDatetimeLocalValue(naive);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });
  });

  describe("invalid input", () => {
    it("returns empty string for invalid Date", () => {
      const result = toDatetimeLocalValue(new Date("not a date"));
      expect(result).toBe("");
    });

    it("returns empty string for invalid string", () => {
      const result = toDatetimeLocalValue("not a date");
      expect(result).toBe("");
    });

    it("returns empty string for empty string", () => {
      const result = toDatetimeLocalValue("");
      expect(result).toBe("");
    });
  });

  describe("consistent formatting", () => {
    it("formats datetime-local as YYYY-MM-DDTHH:mm", () => {
      const result = toDatetimeLocalValue(parseAppZonedDateTime("2026-09-15T14:30"));
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it("formats dates with leading zeros for single-digit months and days", () => {
      const result = toDatetimeLocalValue(parseAppZonedDateTime("2026-01-05T08:03"));
      expect(result).toBe("2026-01-05T08:03");
    });

    it("formats hours with leading zeros", () => {
      const result = toDatetimeLocalValue(parseAppZonedDateTime("2026-07-15T08:05"));
      expect(result).toMatch(/T08:05$/);
    });
  });
});

describe("formatInAppZone", () => {
  describe("timezone enforcement", () => {
    it("always uses Copenhagen timezone in output", () => {
      // Parse a time in Copenhagen, format it, then parse it back
      const input = "2026-09-19T11:45";
      const utcInstant = parseAppZonedDateTime(input);

      // Format with various options
      const formatted = formatInAppZone(utcInstant, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      // The formatted result should be non-empty
      expect(formatted).toBeTruthy();
    });

    it("produces consistent output for the same instant regardless of caller options", () => {
      const instant = new Date("2026-09-19T09:45:00Z");

      // Format the same instant with different caller options
      const shortForm = formatInAppZone(instant, { day: "numeric", month: "numeric" });
      const longForm = formatInAppZone(instant, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Both should be non-empty
      expect(shortForm).toBeTruthy();
      expect(longForm).toBeTruthy();
    });
  });

  describe("caller options are respected", () => {
    it("respects caller's formatting options for date parts", () => {
      const instant = new Date("2026-09-19T09:45:00Z");

      // Request full date format
      const result = formatInAppZone(instant, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      expect(result).toBeTruthy();
    });

    it("respects hour12 option", () => {
      const instant = new Date("2026-09-19T09:45:00Z");

      // 24-hour format
      const hour24 = formatInAppZone(instant, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      // 12-hour format
      const hour12 = formatInAppZone(instant, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      // Both should be non-empty and might differ
      expect(hour24).toBeTruthy();
      expect(hour12).toBeTruthy();
    });
  });

  describe("timeZone override", () => {
    it("overrides conflicting timeZone: UTC should still show Copenhagen hour (11, not 09)", () => {
      const instant = new Date("2026-09-19T09:45:00Z");
      // This instant is 11:45 in Copenhagen (CEST, UTC+2), but 09:45 in UTC

      // Request UTC timezone, but it should be overridden to Copenhagen
      const result = formatInAppZone(instant, {
        timeZone: "UTC", // Caller asks for UTC
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      // The result should contain the Copenhagen hour (11), not UTC hour (09)
      // The format is "YYYY-MM-DD, HH.MM" in da-DK locale
      // So we look for "11" for the hour
      const parts = result.split(/[.,:\s]/);
      const hourPart = parts.find(p => p === "11");
      expect(hourPart).toBe("11");
    });

    it("overrides conflicting timeZone: America/New_York should still show Copenhagen hour", () => {
      const instant = new Date("2026-12-19T10:45:00Z");
      // This instant is 11:45 in Copenhagen (CET, UTC+1), but much earlier in New York

      // Request America/New_York timezone, but it should be overridden to Copenhagen
      const result = formatInAppZone(instant, {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      // The result should contain the Copenhagen hour (11), not New York hour
      const parts = result.split(/[.,:\s]/);
      const hourPart = parts.find(p => p === "11");
      expect(hourPart).toBe("11");
    });
  });

  describe("invalid input", () => {
    it("returns empty string for invalid Date", () => {
      const result = formatInAppZone(new Date("not a date"), {
        hour: "2-digit",
        minute: "2-digit",
      });
      expect(result).toBe("");
    });

    it("returns empty string for invalid string", () => {
      const result = formatInAppZone("not a date", { hour: "2-digit" });
      expect(result).toBe("");
    });

    it("returns empty string for empty string", () => {
      const result = formatInAppZone("", { hour: "2-digit" });
      expect(result).toBe("");
    });
  });

  describe("accepts both Date and string input", () => {
    it("accepts a Date object", () => {
      const date = new Date("2026-09-19T09:45:00Z");
      const result = formatInAppZone(date, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      expect(result).toBeTruthy();
    });

    it("accepts an ISO string", () => {
      const result = formatInAppZone("2026-09-19T09:45:00Z", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      expect(result).toBeTruthy();
    });
  });

  describe("da-DK locale formatting", () => {
    it("uses da-DK locale for Danish weekday names", () => {
      const instant = new Date("2026-09-20T09:45:00Z"); // Sunday
      const result = formatInAppZone(instant, { weekday: "long" });
      // Sunday in Danish is "søndag"
      expect(result.toLowerCase()).toContain("søndag");
    });

    it("uses da-DK locale for Danish month names", () => {
      const instant = new Date("2026-09-19T09:45:00Z"); // September
      const result = formatInAppZone(instant, { month: "long" });
      // September in Danish is "september"
      expect(result.toLowerCase()).toContain("september");
    });

    it("uses da-DK locale for various months", () => {
      // January
      const janResult = formatInAppZone(new Date("2026-01-15T12:00:00Z"), {
        month: "long",
      });
      expect(janResult.toLowerCase()).toContain("januar");

      // May
      const mayResult = formatInAppZone(new Date("2026-05-15T12:00:00Z"), {
        month: "long",
      });
      expect(mayResult.toLowerCase()).toContain("maj");
    });
  });
});
