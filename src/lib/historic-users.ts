/** Placeholder accounts created by the historic-season import; not real logins. */
export const HISTORIC_AUTH_PREFIX = "historic-";

export function isHistoricPlaceholder(authId: string): boolean {
  return authId.startsWith(HISTORIC_AUTH_PREFIX);
}
