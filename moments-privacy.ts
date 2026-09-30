export type MomentsHistory = "all" | "6months" | "month" | "3days";
export type MomentsSettings = {
  history: MomentsHistory;
  hideMyPostsFrom: string[];
  hideTheirPosts: string[];
  publicLastTen: boolean;
  coverUri: string;
};

export const defaultMomentsSettings: MomentsSettings = {
  history: "all", hideMyPostsFrom: [], hideTheirPosts: [], publicLastTen: false, coverUri: "",
};

export function momentsHistoryCutoff(history: MomentsHistory, now: number): number {
  if (history === "all") return -Infinity;
  if (history === "3days") return now - 3 * 86400000;
  const date = new Date(now);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - (history === "6months" ? 6 : 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

// The prototype and audience preview use the same rules. A production backend
// must enforce these rules before returning posts or media to another account.
export function momentsVisibleTo<T extends { createdAt: number; audience?: "friends" | "private" }>(
  posts: T[], settings: MomentsSettings, viewer: "owner" | "friend" | "public", viewerId = "", now = Date.now(),
): T[] {
  const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  if (viewer === "owner") return sorted;
  if (settings.hideMyPostsFrom.includes(viewerId)) return [];
  if (viewer === "public" && !settings.publicLastTen) return [];
  const cutoff = momentsHistoryCutoff(settings.history, now);
  const eligible = sorted.filter((post) => post.audience !== "private" && post.createdAt >= cutoff);
  return viewer === "public" ? eligible.slice(0, 10) : eligible;
}
