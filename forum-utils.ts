export function extractForumHashtags(text: string): string[] {
  const tags = [...text.normalize("NFKC").matchAll(/(?:^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function forumMatchesSearch(query: string, text: string, tags: string[]): boolean {
  const normalized = query.normalize("NFKC").toLowerCase().trim();
  const queryTags = extractForumHashtags(normalized);
  const availableTags = new Set(tags.map((tag) => tag.normalize("NFKC").toLowerCase()));
  if (!queryTags.every((tag) => availableTags.has(tag))) return false;
  const words = normalized.replace(/#[\p{L}\p{N}_]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  const searchable = `${text} ${tags.join(" ")}`.normalize("NFKC").toLowerCase();
  return words.every((word) => searchable.includes(word));
}

export function formatForumDate(value: string, language: string, includeTime = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return language === "EN" ? "Date unavailable" : language === "简体" ? "日期暂不可用" : "日期暫不可用";
  return new Intl.DateTimeFormat(language === "EN" ? "en-GB" : language === "简体" ? "zh-CN" : "zh-TW", {
    timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" as const } : {}),
  }).format(date);
}
