/**
 * Time zone utilities for consistently handling Copenhagen wall-clock time.
 * All deadline and kickoff times are stored as UTC instants but represent
 * Copenhagen wall-clock times (CET +1 in winter, CEST +2 in summer).
 */

export const APP_TIME_ZONE = "Europe/Copenhagen";

/**
 * Parse a date-time string as Copenhagen wall-clock time and return the
 * corresponding UTC instant. Strings that already carry an explicit offset
 * or "Z" are parsed as-is. Returns an Invalid Date for unparseable input.
 *
 * Implementation uses a two-pass offset correction to handle DST correctly:
 * 1. Parse naive string as UTC
 * 2. Look up the zone offset at that UTC instant
 * 3. Subtract the offset to get the "real" UTC time
 * 4. Verify the offset at the corrected time (handles boundary cases)
 *
 * For the ambiguous hour when DST ends (clocks go back), we pick the later UTC time
 * (i.e., wall-clock time is interpreted in the post-transition zone).
 * For the skipped hour in spring (clocks go forward), we do not throw; the wall-clock
 * time is treated as being in the post-transition zone.
 */
export function parseAppZonedDateTime(input: string): Date {
  // Detect if the string already has a zone indicator (Z or ±HH:MM / ±HHMM)
  if (/Z$/.test(input) || /[+-]\d{2}:?\d{2}$/.test(input)) {
    // Already zoned; parse as-is
    const d = new Date(input);
    return isNaN(d.getTime()) ? new Date(NaN) : d;
  }

  // Accept YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, or with optional fractional seconds
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(input)) {
    return new Date(NaN);
  }

  // First pass: treat the naive string as UTC to get an initial instant
  const initialUtc = new Date(input + "Z");
  if (isNaN(initialUtc.getTime())) {
    return new Date(NaN);
  }

  // Look up the offset in the target zone at this UTC instant
  const offset1 = getUTCOffsetMinutes(initialUtc);

  // Subtract the offset to get the "real" UTC instant
  const realUtc = new Date(initialUtc.getTime() - offset1 * 60000);

  // Second pass: verify the offset at the corrected instant
  // (handles DST boundaries where the offset might differ)
  const offset2 = getUTCOffsetMinutes(realUtc);

  // If the offset changed, adjust once more
  if (offset1 !== offset2) {
    return new Date(initialUtc.getTime() - offset2 * 60000);
  }

  return realUtc;
}

/**
 * Get the UTC offset in minutes for the app time zone at a given instant.
 * Positive values indicate east of UTC (e.g., CET is +60).
 */
function getUTCOffsetMinutes(utcInstant: Date): number {
  // Create a formatter that shows the date in the target zone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(utcInstant);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }

  // Reconstruct the local time
  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10) - 1; // JS months are 0-indexed
  const day = parseInt(partMap.day, 10);
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);

  // Create a Date from these components (in UTC)
  const localAsUtc = new Date(Date.UTC(year, month, day, hour, minute, second));

  // The difference is the offset (local is ahead of UTC for zones east of UTC)
  const offsetMs = localAsUtc.getTime() - utcInstant.getTime();
  return Math.round(offsetMs / 60000);
}

/**
 * Format an instant as "YYYY-MM-DDTHH:mm" Copenhagen wall clock,
 * suitable for <input type="datetime-local">.
 */
export function toDatetimeLocalValue(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) {
    return "";
  }

  // Format in the app zone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }

  return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}`;
}

/**
 * Format an instant with da-DK locale, forcing timeZone: APP_TIME_ZONE.
 */
export function formatInAppZone(
  value: Date | string,
  options: Intl.DateTimeFormatOptions
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("da-DK", {
    ...options,
    timeZone: APP_TIME_ZONE,
  }).format(date);
}
