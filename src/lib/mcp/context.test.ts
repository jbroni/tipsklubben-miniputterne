import { describe, it, expect } from "vitest";
import {
  getCaller,
  requireAdminCaller,
  textResult,
  errorResult,
  fromService,
  McpCaller,
} from "./context";
import type { ServiceResult } from "@/lib/services/result";

describe("getCaller", () => {
  describe("successful extraction", () => {
    it("extracts userId, role, displayName from ctx.http.authInfo.extra", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              role: "member",
              displayName: "Alice Smith",
            },
          },
        },
      };

      const caller = getCaller(ctx);
      expect(caller).toEqual({
        userId: "user-123",
        role: "member",
        displayName: "Alice Smith",
      });
    });

    it("requires values to be strings", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: 123,
              role: "admin",
              displayName: "Bob",
            },
          },
        },
      };

      expect(() => getCaller(ctx)).toThrow("Missing required auth fields");
    });
  });

  describe("error conditions", () => {
    it("throws when ctx is undefined", () => {
      expect(() => getCaller(undefined)).toThrow("Missing auth context");
    });

    it("throws when ctx.http is missing", () => {
      const ctx = {};
      expect(() => getCaller(ctx)).toThrow("Missing auth context");
    });

    it("throws when ctx.http.authInfo is missing", () => {
      const ctx = {
        http: {},
      };
      expect(() => getCaller(ctx)).toThrow("Missing auth context");
    });

    it("throws when ctx.http.authInfo.extra is missing", () => {
      const ctx = {
        http: {
          authInfo: {},
        },
      };
      expect(() => getCaller(ctx)).toThrow("Missing auth context");
    });

    it("throws when userId is missing from extra", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              role: "member",
              displayName: "Alice",
            },
          },
        },
      };
      expect(() => getCaller(ctx)).toThrow("Missing required auth fields");
    });

    it("throws when role is missing from extra", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              displayName: "Alice",
            },
          },
        },
      };
      expect(() => getCaller(ctx)).toThrow("Missing required auth fields");
    });

    it("throws when displayName is missing from extra", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              role: "member",
            },
          },
        },
      };
      expect(() => getCaller(ctx)).toThrow("Missing required auth fields");
    });

    it("throws when userId is falsy", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "",
              role: "member",
              displayName: "Alice",
            },
          },
        },
      };
      expect(() => getCaller(ctx)).toThrow("Missing required auth fields");
    });

    it("throws when role is falsy", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              role: "",
              displayName: "Alice",
            },
          },
        },
      };
      expect(() => getCaller(ctx)).toThrow("Missing required auth fields");
    });

    it("throws when displayName is falsy", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              role: "member",
              displayName: "",
            },
          },
        },
      };
      expect(() => getCaller(ctx)).toThrow("Missing required auth fields");
    });
  });
});

describe("requireAdminCaller", () => {
  describe("successful authorization", () => {
    it("returns caller when role is admin", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "admin-1",
              role: "admin",
              displayName: "Admin User",
            },
          },
        },
      };

      const caller = requireAdminCaller(ctx);
      expect(caller.role).toBe("admin");
      expect(caller.userId).toBe("admin-1");
    });
  });

  describe("authorization failures", () => {
    it("throws when role is member", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              role: "member",
              displayName: "Alice",
            },
          },
        },
      };

      expect(() => requireAdminCaller(ctx)).toThrow("Admin role required");
    });

    it("throws when role is unknown", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              role: "moderator",
              displayName: "Bob",
            },
          },
        },
      };

      expect(() => requireAdminCaller(ctx)).toThrow("Admin role required");
    });

    it("throws when missing auth context", () => {
      expect(() => requireAdminCaller(undefined)).toThrow(
        "Missing auth context"
      );
    });
  });

  describe("authorization is the boundary", () => {
    it("role comparison is strict (case-sensitive)", () => {
      const ctx = {
        http: {
          authInfo: {
            extra: {
              userId: "user-123",
              role: "Admin",
              displayName: "Test",
            },
          },
        },
      };

      expect(() => requireAdminCaller(ctx)).toThrow("Admin role required");
    });
  });
});

describe("textResult", () => {
  it("returns text content with JSON-stringified data", () => {
    const data = { id: "test", value: 42 };
    const result = textResult(data);

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect((result.content[0] as any).text).toBe(JSON.stringify(data, null, 2));
  });

  it("formats with indentation (2 spaces)", () => {
    const data = { a: 1, b: 2 };
    const result = textResult(data);
    const text = (result.content[0] as any).text;

    expect(text).toContain("\n");
    expect(text).toContain("  ");
  });

  it("does not set isError flag", () => {
    const result = textResult({ data: "test" });
    expect(result.isError).toBeUndefined();
  });

  it("works with nested structures", () => {
    const data = { user: { id: "123", name: "Alice" }, items: [1, 2, 3] };
    const result = textResult(data);
    const parsed = JSON.parse((result.content[0] as any).text);

    expect(parsed).toEqual(data);
  });

  it("works with null", () => {
    const result = textResult(null);
    expect((result.content[0] as any).text).toBe("null");
  });

  it("works with arrays", () => {
    const data = [1, 2, 3];
    const result = textResult(data);
    const parsed = JSON.parse((result.content[0] as any).text);

    expect(parsed).toEqual(data);
  });
});

describe("errorResult", () => {
  it("returns error content with message", () => {
    const result = errorResult("Something went wrong");

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect((result.content[0] as any).text).toBe("Something went wrong");
  });

  it("sets isError flag to true", () => {
    const result = errorResult("Error message");
    expect(result.isError).toBe(true);
  });

  it("passes message through verbatim", () => {
    const message = "DUPLICATE_MATCH: Duplicate match IDs in picks";
    const result = errorResult(message);

    expect((result.content[0] as any).text).toBe(message);
  });
});

describe("fromService", () => {
  describe("success results", () => {
    it("converts ok: true result to textResult", () => {
      const serviceResult: ServiceResult<{ id: string }> = {
        ok: true,
        data: { id: "test-123" },
      };

      const result = fromService(serviceResult);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse((result.content[0] as any).text);
      expect(parsed).toEqual({ id: "test-123" });
    });

    it("works with complex data structures", () => {
      const serviceResult: ServiceResult<any> = {
        ok: true,
        data: {
          predictions: [{ id: "p1", pick: "HOME" }],
          fedt: 50,
          fedtLabel: "Balanced",
        },
      };

      const result = fromService(serviceResult);
      const parsed = JSON.parse((result.content[0] as any).text);

      expect(parsed.predictions).toHaveLength(1);
      expect(parsed.fedt).toBe(50);
    });
  });

  describe("error results", () => {
    it("converts ok: false result to errorResult", () => {
      const serviceResult: ServiceResult<never> = {
        ok: false,
        code: "ROUND_NOT_FOUND",
        message: "Round not found",
      };

      const result = fromService(serviceResult);

      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe("ROUND_NOT_FOUND: Round not found");
    });

    it("includes both code and message in error text", () => {
      const serviceResult: ServiceResult<never> = {
        ok: false,
        code: "DEADLINE_PASSED",
        message: "The submission deadline has passed",
      };

      const result = fromService(serviceResult);
      const text = (result.content[0] as any).text;

      expect(text).toContain("DEADLINE_PASSED");
      expect(text).toContain("The submission deadline has passed");
    });

    it("handles multiple error codes correctly", () => {
      const codes: Array<{ code: string; message: string }> = [
        { code: "ROUND_CLOSED", message: "Round is closed" },
        { code: "BAD_PICK_COUNT", message: "Must be exactly 13 picks" },
        { code: "DUPLICATE_MATCH", message: "Duplicate match IDs" },
      ];

      codes.forEach(({ code, message }) => {
        const serviceResult: ServiceResult<never> = {
          ok: false,
          code: code as any,
          message,
        };

        const result = fromService(serviceResult);
        expect((result.content[0] as any).text).toBe(`${code}: ${message}`);
      });
    });
  });
});
