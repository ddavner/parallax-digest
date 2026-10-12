// Parallax daily digest — the deterministic half.
//
//   npx tsx tools/parallax-digest/fetch.ts [--hours 24] [--out digest-input.json] [--archive items.json]
//       pulls every feed of sources.ts, keeps the window, writes one compact JSON
//       (titles + leads, no bodies) and prints a per-source table to stderr. With --archive,
//       the window is the union of the live fetch and the rolling archive (archive.ts).
//   npx tsx tools/parallax-digest/fetch.ts --accumulate items.json
//       the hourly job: folds one fetch of every feed into the rolling archive (36h).
//   npx tsx tools/parallax-digest/fetch.ts --article <url> [--jina]   (or --body <url>: the feed's own content:encoded)
//       prints the article text (≤ ARTICLE_CHARS) for one chosen link. A `leadOnly` source
//       (tass) refuses: its page is unreachable and Jina returns the wrong article.
//
// Zero dependencies beyond tsx so a bare checkout in a cloud runner can run it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isCore, SOURCES, type Source } from "./sources.ts";
import { htmlToText, inWindow, parseRss, type RssItem } from "./rss.ts";
import { mergeArchive, placedAt, type ArchiveItem } from "./archive.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const FEED_TIMEOUT_MS = 20_000;
const ARTICLE_TIMEOUT_MS = 30_000;
export const ARTICLE_CHARS = 6000;

export interface DigestItem {
  src: string;
  group: Source["group"];
  lang: Source["lang"];
  t: string;
  link: string;
  at: string | null;
  lead: string;
  body: boolean; // the feed carried a body (fetch.ts --article can fall back to it)
}

export interface DigestInput {
  generated_at: string;
  since: string;
  hours: number;
  sources: { slug: string; group: Source["group"]; ok: boolean; total: number; kept: number; error?: string }[];
  items: DigestItem[];
}

// r.jina.ai answers 403 to a browser User-Agent (measured 2026-10-12 from a Mac and from the cloud
// runner; curl's own UA got 200 on the same URL in the same minute), so the reader gets a plain one.
const JINA_UA = "parallax-digest/1.0 (+https://github.com/ddavner/parallax-digest)";

async function get(url: string, timeoutMs: number): Promise<string> {
  const ua = url.startsWith("https://r.jina.ai/") ? JINA_UA : UA;
  const res = await fetch(url, { headers: { "user-agent": ua, accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchFeed(s: Source, since: string): Promise<{ row: DigestInput["sources"][number]; items: RssItem[] }> {
  try {
    const all = parseRss(await get(s.feed, FEED_TIMEOUT_MS));
    const kept = inWindow(all, since);
    return { row: { slug: s.slug, group: s.group, ok: true, total: all.length, kept: kept.length }, items: kept };
  } catch (e) {
    return { row: { slug: s.slug, group: s.group, ok: false, total: 0, kept: 0, error: (e as Error).message }, items: [] };
  }
}

export async function buildInput(hours: number): Promise<DigestInput> {
  const now = new Date();
  const since = new Date(now.getTime() - hours * 3600_000).toISOString();
  const results = await Promise.all(SOURCES.map((s) => fetchFeed(s, since)));
  const items: DigestItem[] = [];
  results.forEach((r, i) => {
    const s = SOURCES[i];
    for (const it of r.items) {
      items.push({ src: s.slug, group: s.group, lang: s.lang, t: it.title, link: it.link, at: it.at, lead: it.lead, body: it.bodyChars > 0 });
    }
  });
  items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return { generated_at: now.toISOString(), since, hours, sources: results.map((r) => r.row), items };
}

async function articleText(url: string, viaJina: boolean): Promise<string> {
  if (viaJina) {
    const md = await get(`https://r.jina.ai/${url}`, ARTICLE_TIMEOUT_MS);
    const i = md.indexOf("Markdown Content:");
    return (i >= 0 ? md.slice(i + 17) : md).trim().slice(0, ARTICLE_CHARS);
  }
  const html = await get(url, ARTICLE_TIMEOUT_MS);
  // Prefer the LONGEST <article> element: a page lists teasers as <article> too, and the first
  // one on meduza.io was a related-story card (measured 2026-10-12, 352 chars). Else the body.
  const articles = [...html.matchAll(/<article[\s\S]*?<\/article>/gi)].map((m) => htmlToText(m[0]));
  const longest = articles.sort((a, b) => b.length - a.length)[0];
  const text = longest && longest.length >= 600 ? longest : htmlToText(html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html);
  if (/just a moment|checking your browser|attention required/i.test(text.slice(0, 1200))) throw new Error("anti-bot interstitial");
  return text.slice(0, ARTICLE_CHARS);
}

/** The body a feed carries for one link (pravda: the page is a Cloudflare challenge, the feed is the only text). */
async function feedBody(link: string): Promise<string> {
  const src = SOURCES.find((s) => link.startsWith(new URL(s.feed).origin.replace("rss.", "www.")) || link.includes(s.slug));
  if (!src) throw new Error("link matches no source");
  const xml = await get(src.feed, FEED_TIMEOUT_MS);
  // Match the item's own <link>/<guid>, not any mention: a related-links block quotes sibling URLs.
  const block = xml.split(/<item(?:\s[^>]*)?>/i).find((b) => new RegExp(`<(link|guid)[^>]*>\\s*(<!\\[CDATA\\[)?\\s*${link.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\s*`).test(b));
  const body = block?.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)?.[1];
  if (!body) throw new Error("feed carries no body for this link (or the item aged out)");
  return htmlToText(body).slice(0, ARTICLE_CHARS);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const body = arg("--body");
  if (body) {
    process.stdout.write(await feedBody(body) + "\n");
    return;
  }
  const article = arg("--article");
  if (article) {
    const src = SOURCES.find((s) => article.startsWith(new URL(s.feed).origin.replace("rss.", "www.")) || article.includes(s.slug));
    if (src?.leadOnly && !process.argv.includes("--jina")) {
      throw new Error(`${src.slug}: only the RSS lead exists for this source (SPA behind a WAF; r.jina.ai returns a different article) — use the JSON lead`);
    }
    const viaJina = process.argv.includes("--jina");
    process.stdout.write(await articleText(article, viaJina) + "\n");
    return;
  }
  const w = (s: string, n: number) => s.padEnd(n);

  const accumulate = arg("--accumulate");
  if (accumulate) {
    // Hourly job: fold one fetch of every feed into the rolling archive file.
    const prev = readArchive(accumulate);
    const live = await buildInput(ARCHIVE_KEEP_HOURS);
    const items = mergeArchive(prev?.items ?? [], live.items, live.generated_at, ARCHIVE_KEEP_HOURS);
    const file: ArchiveFile = { updated_at: live.generated_at, keep_hours: ARCHIVE_KEEP_HOURS, sources: live.sources, items };
    writeFileSync(accumulate, JSON.stringify(file));
    const added = items.length - (prev?.items.filter((p) => items.some((i) => i.link === p.link)).length ?? 0);
    console.error(`${w("source", 18)}${w("ok", 4)}${w("feed", 6)}archive  oldest`);
    for (const r of live.sources) {
      const mine = items.filter((i) => i.src === r.slug);
      const oldest = mine.length ? placedAt(mine[mine.length - 1]).slice(0, 16) : "-";
      console.error(`${w(r.slug, 18)}${w(r.ok ? "y" : "n", 4)}${w(String(r.total), 6)}${w(String(mine.length), 9)}${oldest}${r.error ? "  " + r.error : ""}`);
    }
    console.error(`archive=${items.length} (+${added} new) keep=${ARCHIVE_KEEP_HOURS}h → ${accumulate} (${(JSON.stringify(file).length / 1024).toFixed(0)} KB)`);
    // Red only when the three sides are all dark: one dead feed must not stop the hourly fold.
    if (!live.sources.some((r) => r.ok && isCore(r.group))) process.exit(1);
    return;
  }

  const hours = Number(arg("--hours") ?? 24);
  const out = arg("--out") ?? "digest-input.json";
  const input = await buildInput(hours);
  const liveKept = new Map(input.sources.map((r) => [r.slug, r.kept]));
  const archivePath = arg("--archive");
  const archive = archivePath ? readArchive(archivePath) : null;
  if (archive) {
    // The archive holds the hours the 100-item feeds have already dropped; the live fetch holds
    // the last minutes the hourly job has not seen yet. Union by link, then cut to the window.
    const merged = mergeArchive(archive.items, input.items, input.generated_at, hours);
    // Every archive item was a DigestItem when it was written; `seen` rides along unused.
    input.items = merged.filter((i) => placedAt(i) >= input.since) as unknown as DigestItem[];
    for (const r of input.sources) r.kept = input.items.filter((i) => i.src === r.slug).length;
  }
  writeFileSync(out, JSON.stringify(input));
  console.error(`${w("source", 18)}${w("ok", 4)}${w("total", 7)}${w("live", 6)}${archive ? "day   " : ""}error`);
  for (const r of input.sources) {
    console.error(`${w(r.slug, 18)}${w(r.ok ? "y" : "n", 4)}${w(String(r.total), 7)}${w(String(liveKept.get(r.slug)), 6)}${archive ? w(String(r.kept), 6) : ""}${r.error ?? ""}`);
  }
  if (archivePath && !archive) console.error(`archive: ${archivePath} missing or unreadable — live feeds only, the big feeds cover only their last hours`);
  if (archive) {
    const ageH = (Date.parse(input.generated_at) - Date.parse(archive.updated_at)) / 3600_000;
    console.error(`archive: updated ${archive.updated_at} (${ageH.toFixed(1)}h ago)${ageH > 3 ? " — STALE, the hourly job has not run; coverage may have gaps" : ""}`);
  }
  console.error(`items=${input.items.length} window=${hours}h → ${out} (${(JSON.stringify(input).length / 1024).toFixed(0)} KB)`);
  // Only the three sides gate an issue; Israel and world are a strip that may come back thin.
  if (input.sources.filter((r) => r.ok && isCore(r.group)).length < 6) process.exit(1);
}

/** Hours the rolling archive keeps: a day for the issue plus slack for a late or skipped run. */
const ARCHIVE_KEEP_HOURS = 36;

interface ArchiveFile {
  updated_at: string;
  keep_hours: number;
  sources: DigestInput["sources"];
  items: ArchiveItem[];
}

function readArchive(path: string): ArchiveFile | null {
  if (!existsSync(path)) return null;
  try {
    const f = JSON.parse(readFileSync(path, "utf8")) as ArchiveFile;
    return Array.isArray(f.items) && typeof f.updated_at === "string" ? f : null;
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) main().catch((e) => { console.error(e); process.exit(1); });
