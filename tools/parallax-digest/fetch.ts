// Parallax daily digest — the deterministic half.
//
//   npx tsx tools/parallax-digest/fetch.ts [--hours 24] [--out digest-input.json]
//       pulls every feed of sources.ts, keeps the window, writes one compact JSON
//       (titles + leads, no bodies) and prints a per-source table to stderr.
//   npx tsx tools/parallax-digest/fetch.ts --article <url> [--jina]   (or --body <url>: the feed's own content:encoded)
//       prints the article text (≤ ARTICLE_CHARS) for one chosen link.
//
// Zero dependencies beyond tsx so a bare checkout in a cloud runner can run it.

import { writeFileSync } from "node:fs";
import { SOURCES, type Source } from "./sources.ts";
import { htmlToText, inWindow, parseRss, type RssItem } from "./rss.ts";

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
  sources: { slug: string; ok: boolean; total: number; kept: number; error?: string }[];
  items: DigestItem[];
}

async function get(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchFeed(s: Source, since: string): Promise<{ row: DigestInput["sources"][number]; items: RssItem[] }> {
  try {
    const all = parseRss(await get(s.feed, FEED_TIMEOUT_MS));
    const kept = inWindow(all, since);
    return { row: { slug: s.slug, ok: true, total: all.length, kept: kept.length }, items: kept };
  } catch (e) {
    return { row: { slug: s.slug, ok: false, total: 0, kept: 0, error: (e as Error).message }, items: [] };
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
  // Prefer the <article> element when the page has one; else the whole body.
  const art = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  const text = htmlToText(art);
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
    const viaJina = process.argv.includes("--jina") || !!src?.jina;
    process.stdout.write(await articleText(article, viaJina) + "\n");
    return;
  }
  const hours = Number(arg("--hours") ?? 24);
  const out = arg("--out") ?? "digest-input.json";
  const input = await buildInput(hours);
  writeFileSync(out, JSON.stringify(input));
  const w = (s: string, n: number) => s.padEnd(n);
  console.error(`${w("source", 18)}${w("ok", 4)}${w("total", 7)}kept  error`);
  for (const r of input.sources) console.error(`${w(r.slug, 18)}${w(r.ok ? "y" : "n", 4)}${w(String(r.total), 7)}${w(String(r.kept), 6)}${r.error ?? ""}`);
  console.error(`items=${input.items.length} window=${hours}h → ${out} (${(JSON.stringify(input).length / 1024).toFixed(0)} KB)`);
  if (input.sources.filter((r) => r.ok).length < 6) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) main().catch((e) => { console.error(e); process.exit(1); });
