/**
 * Pure module for user display name disambiguation.
 *
 * Derives short display names from full displayName strings, with
 * automatic disambiguation when first names collide.
 */

export interface NamedUser {
  id: string;
  displayName: string;
}

/**
 * First whitespace-separated token of the trimmed name.
 *
 * Examples:
 *   "  Jesper Broni Andersen " -> "Jesper"
 *   "JBA" -> "JBA"
 *   "" or whitespace-only -> ""
 */
export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";

  const parts = trimmed.split(/\s+/);
  return parts[0];
}

/**
 * Map user id -> short display name, computed over the WHOLE set passed in.
 *
 * Returns first name if unique; otherwise first name + last initial (e.g., "Morten A.")
 * if that's unique and the name has 2+ tokens; otherwise the full trimmed displayName.
 * Users whose displayName is empty/whitespace map to "".
 */
export function buildShortNames(users: NamedUser[]): Map<string, string> {
  const result = new Map<string, string>();
  const parsed = users.map((user) => {
    const full = user.displayName.trim();
    if (!full) return { id: user.id, first: "", full: "", candidate: "" };
    const parts = full.split(/\s+/);
    const first = parts[0];
    const candidate = parts.length >= 2
      ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.`
      : full;
    return { id: user.id, first, full, candidate };
  });

  const firstNameCounts = new Map<string, number>();
  const candidateCounts = new Map<string, number>();
  for (const p of parsed) {
    const fKey = p.first.toLowerCase();
    const cKey = p.candidate.toLowerCase();
    firstNameCounts.set(fKey, (firstNameCounts.get(fKey) ?? 0) + 1);
    candidateCounts.set(cKey, (candidateCounts.get(cKey) ?? 0) + 1);
  }

  for (const p of parsed) {
    if (!p.full) {
      result.set(p.id, "");
    } else {
      const firstCount = firstNameCounts.get(p.first.toLowerCase()) ?? 0;
      if (firstCount === 1) {
        result.set(p.id, p.first);
      } else {
        const cCount = candidateCounts.get(p.candidate.toLowerCase()) ?? 0;
        result.set(p.id, cCount === 1 ? p.candidate : p.full);
      }
    }
  }

  return result;
}

/** Copy of `user` with its displayName replaced by the short name, if known. */
export function withShortName<T extends NamedUser>(
  user: T,
  shortNames: Map<string, string>
): T {
  return { ...user, displayName: shortNames.get(user.id) ?? user.displayName };
}

/** Three-letter code for tight spaces: "Jesper" -> "JES", "Morten A." -> "MOA", "JBA" -> "JBA". */
export function nameCode(shortName: string): string {
  const match = shortName.match(/^(\S+) (\S)\.$/);
  if (match) {
    const firstNamePart = match[1].slice(0, 2).toUpperCase();
    const initial = match[2].toUpperCase();
    return firstNamePart + initial;
  }
  return shortName.slice(0, 3).toUpperCase();
}
