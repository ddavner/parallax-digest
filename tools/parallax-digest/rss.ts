// Pure helpers of the Parallax digest fetcher: RSS 2.0 → compact items, HTML → text.
// No XML library on purpose: the eleven feeds are plain RSS 2.0 and the cloud runner
// must work from a bare checkout (`npx tsx`, no install).

export interface RssItem {
  title: string;
  link: string;
  at: string | null; // ISO, null when pubDate is missing or unparsable
  lead: string; // description, else the first LEAD_CHARS of the body, tags stripped
  bodyChars: number; // length of content:encoded after stripping, 0 when absent
}

export const LEAD_CHARS = 300;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»",
  ndash: "–", mdash: "—", hellip: "…",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Tags out, entities decoded, whitespace collapsed. Scripts and styles go with their content. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (!m) return null;
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const title = htmlToText(tag(b, "title") ?? "");
    const link = (tag(b, "link") ?? tag(b, "guid") ?? "").trim();
    if (!title || !link.startsWith("http")) continue;
    const body = tag(b, "content:encoded");
    const bodyText = body ? htmlToText(body) : "";
    const desc = htmlToText(tag(b, "description") ?? "");
    const lead = (desc || bodyText).slice(0, LEAD_CHARS);
    items.push({ title, link, at: parseDate(tag(b, "pubDate") ?? tag(b, "dc:date")), lead, bodyChars: bodyText.length });
  }
  return items;
}

/** Items published inside the window; undated items are kept (a feed without pubDate is still news). */
export function inWindow(items: RssItem[], sinceIso: string): RssItem[] {
  const since = Date.parse(sinceIso);
  return items.filter((i) => i.at === null || Date.parse(i.at) >= since);
}
