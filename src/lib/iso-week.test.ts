import { describe, it, expect } from "vitest";
import { isoWeekSaturday } from "./iso-week";
import { formatInAppZone } from "./time";

describe("isoWeekSaturday", () => {
  describe("basic functionality", () => {
    it("returns a Date object", () => {
      const result = isoWeekSaturday(2024, 1);
      expect(result).toBeInstanceOf(Date);
    });

    it("returns Saturday (getUTCDay() === 6)", () => {
      const result = isoWeekSaturday(2024, 1);
      expect(result.getUTCDay()).toBe(6);
    });

    it("sets Copenhagen wall-clock time to 15:00 (regardless of DST)", () => {
      // Test a winter week (UTC offset = +1)
      const winterWeek = isoWeekSaturday(2024, 1); // January 6
      const winterHour = parseInt(
        formatInAppZone(winterWeek, { hour: "2-digit", hourCycle: "h23" })
      );
      expect(winterHour).toBe(15);
      expect(winterWeek.getUTCMinutes()).toBe(0);
      expect(winterWeek.getUTCSeconds()).toBe(0);
      expect(winterWeek.getUTCMilliseconds()).toBe(0);

      // Test a summer week (UTC offset = +2)
      const summerWeek = isoWeekSaturday(2024, 26); // June 29
      const summerHour = parseInt(
        formatInAppZone(summerWeek, { hour: "2-digit", hourCycle: "h23" })
      );
      expect(summerHour).toBe(15);
      expect(summerWeek.getUTCMinutes()).toBe(0);
      expect(summerWeek.getUTCSeconds()).toBe(0);
      expect(summerWeek.getUTCMilliseconds()).toBe(0);
    });
  });

  describe("ISO week 1 calculation", () => {
    it("returns correct Saturday for 2024 week 1", () => {
      // ISO week 1 of 2024 contains January 4, 2024
      // January 4, 2024 is a Thursday
      // Monday of week 1 is January 1, 2024
      // Saturday of week 1 is January 6, 2024
      const result = isoWeekSaturday(2024, 1);
      expect(result.getUTCFullYear()).toBe(2024);
      expect(result.getUTCMonth()).toBe(0); // January
      expect(result.getUTCDate()).toBe(6);
    });

    it("returns correct Saturday for 2023 week 1", () => {
      // January 4, 2023 is a Wednesday
      // Monday of week 1 is January 2, 2023
      // Saturday of week 1 is January 7, 2023
      const result = isoWeekSaturday(2023, 1);
      expect(result.getUTCFullYear()).toBe(2023);
      expect(result.getUTCMonth()).toBe(0);
      expect(result.getUTCDate()).toBe(7);
    });

    it("returns correct Saturday for 2025 week 1", () => {
      // January 4, 2025 is a Saturday
      // Monday of week 1 is December 30, 2024
      // Saturday of week 1 is January 4, 2025
      const result = isoWeekSaturday(2025, 1);
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(0);
      expect(result.getUTCDate()).toBe(4);
    });
  });

  describe("mid-year weeks", () => {
    it("returns correct Saturday for 2024 week 26", () => {
      // Week 26 should be roughly mid-year
      const result = isoWeekSaturday(2024, 26);
      expect(result.getUTCDay()).toBe(6); // Verify it's a Saturday
      // Week 26 Monday is June 24, 2024, so Saturday is June 29, 2024
      expect(result.getUTCMonth()).toBe(5); // June (0-indexed)
      expect(result.getUTCDate()).toBe(29);
    });

    it("returns correct Saturday for 2024 week 37", () => {
      // This is week 37, mentioned in the brief as the data source
      const result = isoWeekSaturday(2024, 37);
      expect(result.getUTCDay()).toBe(6);
      // Week 37 should be in September
      expect(result.getUTCMonth()).toBe(8); // September
    });
  });

  describe("late-year weeks", () => {
    it("returns correct Saturday for 2024 week 52", () => {
      const result = isoWeekSaturday(2024, 52);
      expect(result.getUTCDay()).toBe(6);
      // Week 52 should be in December
      expect(result.getUTCMonth()).toBe(11); // December
      expect(result.getUTCDate()).toBe(28);
    });

    it("returns correct Saturday for 2023 week 52", () => {
      const result = isoWeekSaturday(2023, 52);
      expect(result.getUTCDay()).toBe(6);
      expect(result.getUTCMonth()).toBe(11); // December
      expect(result.getUTCDate()).toBe(30);
    });
  });

  describe("year boundary handling", () => {
    it("handles week at end of year correctly for 2024", () => {
      const result = isoWeekSaturday(2024, 52);
      expect(result.getUTCFullYear()).toBe(2024);
    });

    it("handles week 1 at start of year", () => {
      const result = isoWeekSaturday(2025, 1);
      expect(result.getUTCFullYear()).toBe(2025);
    });
  });

  describe("sequential weeks", () => {
    it("returns Saturdays that are 7 days apart for consecutive weeks", () => {
      const week10 = isoWeekSaturday(2024, 10);
      const week11 = isoWeekSaturday(2024, 11);

      const daysDiff = (week11.getTime() - week10.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBe(7);
    });

    it("returns Saturdays that are 7 days apart across year boundary", () => {
      const week52of2024 = isoWeekSaturday(2024, 52);
      const week1of2025 = isoWeekSaturday(2025, 1);

      const daysDiff = (week1of2025.getTime() - week52of2024.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBe(7);
    });
  });

  describe("various years", () => {
    it("handles leap years correctly (2024)", () => {
      const result = isoWeekSaturday(2024, 10);
      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCDay()).toBe(6);
    });

    it("handles non-leap years correctly (2023)", () => {
      const result = isoWeekSaturday(2023, 10);
      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCDay()).toBe(6);
    });

    it("handles year 2000 correctly (leap year, century mark)", () => {
      const result = isoWeekSaturday(2000, 1);
      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCDay()).toBe(6);
      expect(result.getUTCFullYear()).toBe(2000);
    });

    it("handles year 2050 correctly", () => {
      const result = isoWeekSaturday(2050, 26);
      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCDay()).toBe(6);
      expect(result.getUTCFullYear()).toBe(2050);
    });
  });

  describe("edge cases", () => {
    it("handles week 1 for year when Jan 4 is Sunday", () => {
      // This tests the edge case when jan4DayOfWeek is 0 (Sunday)
      const result = isoWeekSaturday(2017, 1);
      expect(result.getUTCDay()).toBe(6);
      // January 4, 2017 is a Wednesday, so week 1 Monday is Jan 2, Saturday is Jan 7
      expect(result.getUTCDate()).toBe(7);
    });

    it("handles week 1 for year when Jan 4 is Sunday", () => {
      // January 4, 2009 is a Sunday; Monday of ISO week 1 is Dec 29, 2008, Saturday is Jan 3, 2009
      const result = isoWeekSaturday(2009, 1);
      expect(result.getUTCDay()).toBe(6);
      expect(result.getUTCDate()).toBe(3);
    });
  });

  describe("consistency", () => {
    it("returns same result for same input", () => {
      const result1 = isoWeekSaturday(2024, 15);
      const result2 = isoWeekSaturday(2024, 15);

      expect(result1.getUTCFullYear()).toBe(result2.getUTCFullYear());
      expect(result1.getUTCMonth()).toBe(result2.getUTCMonth());
      expect(result1.getUTCDate()).toBe(result2.getUTCDate());

      // Check that the Copenhagen wall-clock hour is consistent
      const hour1 = parseInt(
        formatInAppZone(result1, { hour: "2-digit", hourCycle: "h23" })
      );
      const hour2 = parseInt(
        formatInAppZone(result2, { hour: "2-digit", hourCycle: "h23" })
      );
      expect(hour1).toBe(15);
      expect(hour2).toBe(15);
    });
  });

  describe("known ISO week dates", () => {
    it("returns correct date for 2024 week 1 (Jan 6, 2024)", () => {
      const result = isoWeekSaturday(2024, 1);
      // January 6, 2024 is the Saturday of ISO week 1
      // In winter (CET), 15:00 Copenhagen = 14:00 UTC
      expect(result.toISOString()).toContain("2024-01-06T14:00:00");
    });

    it("returns correct date for 2024 week 20 (May 18, 2024)", () => {
      const result = isoWeekSaturday(2024, 20);
      expect(result.getUTCFullYear()).toBe(2024);
      expect(result.getUTCMonth()).toBe(4); // May
      expect(result.getUTCDate()).toBe(18);
    });

    it("returns correct UTC time for winter week (2024 week 1)", () => {
      const result = isoWeekSaturday(2024, 1);
      // January 6, 2024 is a Saturday
      expect(result.getUTCDay()).toBe(6);
      // Winter (CET = UTC+1): 15:00 CET = 14:00 UTC
      expect(result.toISOString()).toContain("2024-01-06T14:00:00");
      expect(result.getUTCHours()).toBe(14);
      expect(result.getUTCMinutes()).toBe(0);

      // Verify Copenhagen wall-clock hour is 15:00
      const copenhagenHour = parseInt(
        formatInAppZone(result, { hour: "2-digit", hourCycle: "h23" })
      );
      expect(copenhagenHour).toBe(15);
    });

    it("returns correct UTC time for summer week (2024 week 26)", () => {
      const result = isoWeekSaturday(2024, 26);
      // June 29, 2024 is a Saturday
      expect(result.getUTCDay()).toBe(6);
      // Summer (CEST = UTC+2): 15:00 CEST = 13:00 UTC
      expect(result.toISOString()).toContain("2024-06-29T13:00:00");
      expect(result.getUTCHours()).toBe(13);
      expect(result.getUTCMinutes()).toBe(0);

      // Verify Copenhagen wall-clock hour is 15:00
      const copenhagenHour = parseInt(
        formatInAppZone(result, { hour: "2-digit", hourCycle: "h23" })
      );
      expect(copenhagenHour).toBe(15);
    });
  });
});
