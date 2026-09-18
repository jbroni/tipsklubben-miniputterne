import { parseAppZonedDateTime } from "@/lib/time";

/**
 * Calculate the Saturday of a given ISO week.
 * ISO week 1 is the week containing January 4 (Monday-based).
 * Returns the Saturday at 15:00 Europe/Copenhagen wall-clock time
 * (14:00 UTC in winter / CET, 13:00 UTC in summer / CEST).
 */
export function isoWeekSaturday(year: number, week: number): Date {
  // Find January 4 of the given year
  const jan4 = new Date(Date.UTC(year, 0, 4)); // Jan 4 at 00:00 UTC

  // Find the day of the week for Jan 4 (0 = Sunday, 1 = Monday, ...)
  const jan4DayOfWeek = jan4.getUTCDay();

  // Calculate days to subtract to get to the Monday of week 1
  // If Jan 4 is Sunday (0), go back 6 days to get Monday
  // If Jan 4 is Monday (1), go back 0 days
  // If Jan 4 is Tuesday (2), go back 1 day
  // ... etc
  const daysToMonday = jan4DayOfWeek === 0 ? 6 : jan4DayOfWeek - 1;

  // Get the Monday of week 1
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - daysToMonday);

  // Get the Monday of the target week
  const targetMonday = new Date(mondayOfWeek1);
  targetMonday.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7);

  // Get Saturday of that week (5 days after Monday)
  const saturday = new Date(targetMonday);
  saturday.setUTCDate(targetMonday.getUTCDate() + 5);

  // Build a naive wall-clock string for Saturday at 15:00 Copenhagen time,
  // then parse it to get the correct UTC instant accounting for DST
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoYear = saturday.getUTCFullYear();
  const isoMonth = pad(saturday.getUTCMonth() + 1);
  const isoDay = pad(saturday.getUTCDate());
  const isoString = `${isoYear}-${isoMonth}-${isoDay}T15:00`;

  return parseAppZonedDateTime(isoString);
}
