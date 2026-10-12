// Rolling archive of feed items. The big feeds (tass, ria, rg, unian) hold only their last 100
// items — 3 to 5 hours — so a once-a-day read saw state media for the last few hours only
// (issue 3, 2026-10-12: rg from ~17:00, tass/ria from ~18:20 Jerusalem time). An hourly job
// merges every fetch into this archive; the daily run reads a full day out of it.
// Pure functions only: the I/O lives in fetch.ts.

export interface ArchiveItem {
  src: string;
  group: string;
  lang: string;
  t: string;
  link: string;
  at: string | null;
  lead: string;
  body: boolean;
  /** ISO time this item was first seen by any fetch; the age of an undated item. */
  seen: string;
}

/** The time an item is placed at: its own publication time, else when we first saw it. */
export const placedAt = (i: { at: string | null; seen?: string }): string => i.at ?? i.seen ?? "";

/**
 * Merge freshly fetched items into the archive. An item is identified by its link; the first
 * copy wins (it carries the earliest `seen`), except that a later copy may fill a missing `at`
 * or a missing body flag. Items placed before `now - keepHours` are dropped. Newest first.
 */
export function mergeArchive<T extends Omit<ArchiveItem, "seen">>(
  prev: ArchiveItem[],
  fresh: T[],
  nowIso: string,
  keepHours: number,
): ArchiveItem[] {
  const byLink = new Map<string, ArchiveItem>();
  for (const p of prev) if (!byLink.has(p.link)) byLink.set(p.link, { ...p });
  for (const f of fresh) {
    const old = byLink.get(f.link);
    if (!old) {
      byLink.set(f.link, { ...f, seen: nowIso });
      continue;
    }
    if (!old.at && f.at) old.at = f.at;
    if (!old.body && f.body) old.body = true;
  }
  const cutoff = Date.parse(nowIso) - keepHours * 3600_000;
  return [...byLink.values()]
    .filter((i) => {
      const t = Date.parse(placedAt(i));
      return Number.isFinite(t) ? t >= cutoff : true;
    })
    .sort((a, b) => placedAt(b).localeCompare(placedAt(a)));
}
