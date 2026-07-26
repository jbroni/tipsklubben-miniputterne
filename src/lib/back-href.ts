/**
 * Resolve the "back" link href for the round detail page.
 *
 * Determines where the back button should navigate based on the referrer hint
 * and season status. The explicit `from` hint is necessary because /historik
 * lists the active season too, so isSeasonActive alone can't identify the origin.
 *
 * Precedence:
 * 1. from === "hjem"      → "/"
 * 2. from === "historik"  → "/historik/{seasonId}"
 * 3. !isSeasonActive      → "/historik/{seasonId}"
 * 4. otherwise            → "/rounds"
 */
export function resolveRoundBackHref(
  from: string | string[] | undefined,
  seasonId: string,
  isSeasonActive: boolean
): string {
  // Note: string[] case (duplicated query params) does not match any literal
  // and falls through to season-based logic
  if (from === "hjem") {
    return "/";
  }

  if (from === "historik" || !isSeasonActive) {
    return `/historik/${seasonId}`;
  }

  return "/rounds";
}
