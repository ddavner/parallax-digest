// node --import tsx --test tools/parallax-digest/archive_test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeArchive, type ArchiveItem } from "./archive.ts";

const item = (link: string, at: string | null, extra: Partial<ArchiveItem> = {}) => ({
  src: "tass", group: "ru-state", lang: "ru", t: link, link, at, lead: "", body: false, ...extra,
});

const NOW = "2026-10-12T18:00:00.000Z";

test("a new item is stamped with the time it was first seen", () => {
  const out = mergeArchive([], [item("a", "2026-10-12T17:00:00.000Z")], NOW, 36);
  assert.equal(out[0].seen, NOW);
});

test("the first copy wins: a refetch does not move `seen` and does not duplicate", () => {
  const prev = [{ ...item("a", "2026-10-12T10:00:00.000Z"), seen: "2026-10-12T10:05:00.000Z" }];
  const out = mergeArchive(prev, [item("a", "2026-10-12T10:00:00.000Z", { t: "edited" })], NOW, 36);
  assert.equal(out.length, 1);
  assert.equal(out[0].seen, "2026-10-12T10:05:00.000Z");
  assert.equal(out[0].t, "a");
});

test("a later copy fills a missing date and a missing body, nothing else", () => {
  const prev = [{ ...item("a", null), seen: "2026-10-12T10:05:00.000Z" }];
  const out = mergeArchive(prev, [item("a", "2026-10-12T09:59:00.000Z", { body: true })], NOW, 36);
  assert.equal(out[0].at, "2026-10-12T09:59:00.000Z");
  assert.equal(out[0].body, true);
});

test("items older than the window drop out; an undated one ages by `seen`", () => {
  const prev = [
    { ...item("old", "2026-10-10T00:00:00.000Z"), seen: "2026-10-10T00:05:00.000Z" },
    { ...item("undated-old", null), seen: "2026-10-10T00:05:00.000Z" },
    { ...item("undated-new", null), seen: "2026-10-12T12:00:00.000Z" },
  ];
  const out = mergeArchive(prev, [], NOW, 36);
  assert.deepEqual(out.map((i) => i.link), ["undated-new"]);
});

test("the morning survives the evening: 100-item feeds no longer lose the start of the day", () => {
  // 07:00 fetch sees the morning; 18:00 fetch sees only the evening (the feed rolled over).
  const morning = mergeArchive([], [item("m1", "2026-10-12T05:00:00.000Z"), item("m2", "2026-10-12T06:30:00.000Z")], "2026-10-12T07:00:00.000Z", 36);
  const evening = mergeArchive(morning, [item("e1", "2026-10-12T17:40:00.000Z")], NOW, 36);
  assert.deepEqual(evening.map((i) => i.link), ["e1", "m2", "m1"]);
});
