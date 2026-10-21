/** Format handles without changing legacy account identifiers. */
export function displayUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}
export function validUsername(value: string): boolean {
  const username=displayUsername(value);
  return /^[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/.test(username) && !username.includes('..');
}
export function matchesPerson(query: string, name: string, username: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return false;
  if (term.startsWith('@')) return term.length > 1 && displayUsername(username).includes(term.slice(1));
  return displayUsername(username).includes(term) || name.toLowerCase().includes(term);
}
