import { describe, it, expect } from "vitest";
import { parseKeyFile, SystemKeyParseError } from "./format";

describe("parseKeyFile", () => {
  describe("happy path", () => {
    it("parses a simple valid key file with three rows", () => {
      const text = "1:\t1\tX\t2\n2:\tX\t2\t1\n3:\t2\t1\tX";
      const result = parseKeyFile(text);
      expect(result).toEqual(["1X2", "X21", "21X"]);
    });

    it("parses a key file with trailing newline", () => {
      const text = "1:\t1\tX\t2\n2:\tX\t2\t1\n3:\t2\t1\tX\n";
      const result = parseKeyFile(text);
      expect(result).toEqual(["1X2", "X21", "21X"]);
    });

    it("parses a key file without trailing newline", () => {
      const text = "1:\t1\tX\t2\n2:\tX\t2\t1\n3:\t2\t1\tX";
      const result = parseKeyFile(text);
      expect(result).toEqual(["1X2", "X21", "21X"]);
    });

    it("parses a single row file", () => {
      const text = "1:\t1\tX\t2";
      const result = parseKeyFile(text);
      expect(result).toEqual(["1X2"]);
    });

    it("handles rows with many glyphs", () => {
      const text = "1:\t1\tX\t2\t1\tX\t2\t1\tX\t2\t1\tX\t2";
      const result = parseKeyFile(text);
      expect(result).toEqual(["1X21X21X21X2"]);
    });

    it("handles rows with only 1 and X glyphs", () => {
      const text = "1:\t1\tX\n2:\tX\t1";
      const result = parseKeyFile(text);
      expect(result).toEqual(["1X", "X1"]);
    });
  });

  describe("error cases", () => {
    it("throws on empty input", () => {
      expect(() => parseKeyFile("")).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile("")).toThrow("File is empty");
    });

    it("throws on whitespace-only input", () => {
      expect(() => parseKeyFile("   \n  \n  ")).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile("   \n  \n  ")).toThrow("File is empty");
    });

    it("throws on missing index", () => {
      const text = "1:\t1\tX\t2\n3:\tX\t2\t1";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 2");
      expect(() => parseKeyFile(text)).toThrow("expected index 2");
    });

    it("throws on out-of-order indices", () => {
      const text = "2:\t1\tX\t2\n1:\tX\t2\t1";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 1");
      expect(() => parseKeyFile(text)).toThrow("expected index 1 but got 2");
    });

    it("throws on duplicate indices", () => {
      const text = "1:\t1\tX\t2\n1:\tX\t2\t1\n2:\t2\t1\tX";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 2");
      expect(() => parseKeyFile(text)).toThrow("expected index 2 but got 1");
    });

    it("throws on ragged row widths (fewer glyphs)", () => {
      const text = "1:\t1\tX\t2\n2:\tX\t2";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 2");
      expect(() => parseKeyFile(text)).toThrow("row width mismatch");
    });

    it("throws on ragged row widths (more glyphs)", () => {
      const text = "1:\t1\tX\n2:\tX\t2\t1";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 2");
      expect(() => parseKeyFile(text)).toThrow("row width mismatch");
    });

    it("throws on invalid glyph", () => {
      const text = "1:\t1\tX\t2\n2:\tQ\t2\t1";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 2");
      expect(() => parseKeyFile(text)).toThrow("invalid or missing glyphs");
    });

    it("throws on spaces instead of tabs", () => {
      const text = "1: 1 X 2";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 1");
    });

    it("throws on missing colon-tab separator", () => {
      const text = "1 1\tX\t2";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 1");
      expect(() => parseKeyFile(text)).toThrow("expected format");
    });

    it("throws on empty glyph section", () => {
      const text = "1:\t";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 1");
      expect(() => parseKeyFile(text)).toThrow("invalid or missing glyphs");
    });

    it("throws on no glyphs after colon-tab", () => {
      const text = "1:";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 1");
    });

    it("error message includes line number for invalid line", () => {
      const text = "1:\t1\tX\t2\n2:\t1\tX\t2\n3:\tZ";
      expect(() => parseKeyFile(text)).toThrow(SystemKeyParseError);
      expect(() => parseKeyFile(text)).toThrow("Line 3");
    });
  });
});
