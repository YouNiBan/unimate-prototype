export function activeMomentMention(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const match = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(before);
  return match ? { start: cursor - match[1].length - 1, end: cursor, query: match[1].toLowerCase() } : null;
}

export function hasMention(text: string, handle: string, includeAll = false) {
  const handles = Array.from(text.matchAll(/(?:^|[^\p{L}\p{N}_])(@[\p{L}\p{N}_-]+)/gu), (match) => match[1].toLowerCase());
  return handles.includes(handle.toLowerCase()) || (includeAll && handles.includes("@all"));
}

export function insertMomentMention(text: string, start: number, end: number, username: string) {
  const suffix = text.slice(end).replace(/^[\p{L}\p{N}_-]*/u, "");
  const prefix = text.slice(0, start) + username + " ";
  return { text: prefix + suffix, cursor: prefix.length };
}
