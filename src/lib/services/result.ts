/**
 * Result type for service layer functions.
 *
 * Discriminated union that allows both HTTP routes and MCP tools to map
 * failures to their own surface without throwing exceptions.
 */

export type ServiceErrorCode =
  | "ROUND_NOT_FOUND"
  | "ROUND_CLOSED"
  | "DEADLINE_PASSED"
  | "BAD_PICK_COUNT"
  | "DUPLICATE_MATCH"
  | "UNKNOWN_MATCH"
  | "BAD_PICK_VALUE"
  | "COUPON_EXISTS"
  | "INVALID_FEDT"
  | "ROUND_EXISTS"
  | "NO_MATCHES_TO_RESOLVE"
  | "VALIDATION"
  | "USER_NOT_FOUND"
  | "INVALID_MERGE"
  | "MERGE_COLLISION";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ServiceErrorCode; message: string };

/**
 * Maps service error codes to HTTP status codes.
 * This ensures consistent status mapping across all API routes.
 */
export const codeToStatus: Record<ServiceErrorCode, number> = {
  ROUND_NOT_FOUND: 404,
  ROUND_EXISTS: 409,
  ROUND_CLOSED: 400,
  DEADLINE_PASSED: 400,
  BAD_PICK_COUNT: 400,
  DUPLICATE_MATCH: 400,
  UNKNOWN_MATCH: 400,
  BAD_PICK_VALUE: 400,
  COUPON_EXISTS: 400,
  INVALID_FEDT: 400,
  NO_MATCHES_TO_RESOLVE: 400,
  VALIDATION: 400,
  USER_NOT_FOUND: 404,
  INVALID_MERGE: 400,
  MERGE_COLLISION: 409,
};
