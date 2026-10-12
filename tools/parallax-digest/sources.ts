// Feeds of the Parallax daily digest. Core groups probed from the VPS 2026-10-11/12
// (docs/superpowers/specs/2026-10-12-parallax-edition-design.md has the table); the two
// outside groups (il, world) probed from a residential IL line 2026-10-12.
// RT and Sputnik are excluded by decision (EU sanctions), not by probe.

/** The three sides of the conflict. Only these gate a run: fewer than 6 of them up = no issue. */
export type CoreGroup = "ru-state" | "ru-exile" | "ua";
/** Outside views, shown as a strip under an event and never judged with a verdict. */
export type SideGroup = "il" | "world";
export type Group = CoreGroup | SideGroup;
export type Lang = "ru" | "uk" | "en" | "he";

export const CORE_GROUPS: readonly CoreGroup[] = ["ru-state", "ru-exile", "ua"];
export const isCore = (g: Group): g is CoreGroup => (CORE_GROUPS as readonly string[]).includes(g);

export interface Source {
  slug: string;
  group: Group;
  lang: Lang;
  feed: string;
  /** Only the RSS lead exists: the article page is an SPA shell behind a WAF from every IP tried
   *  (VPS, residential Mac, cloud runner), and r.jina.ai renders the page's sidebar longread —
   *  a DIFFERENT article — in place of the news (measured 2026-10-12). `--article` refuses. */
  leadOnly?: boolean;
  /** The article page is behind a Cloudflare challenge (Jina blocked too); only the feed body exists. */
  feedBodyOnly?: boolean;
}

export const SOURCES: Source[] = [
  { slug: "tass", group: "ru-state", lang: "ru", feed: "https://tass.ru/rss/v2.xml", leadOnly: true },
  { slug: "ria", group: "ru-state", lang: "ru", feed: "https://ria.ru/export/rss2/archive/index.xml" },
  { slug: "rg", group: "ru-state", lang: "ru", feed: "https://rg.ru/xml/index.xml" },
  { slug: "meduza", group: "ru-exile", lang: "ru", feed: "https://meduza.io/rss/all" },
  { slug: "novayagazeta-eu", group: "ru-exile", lang: "ru", feed: "https://novayagazeta.eu/feed/rss" },
  { slug: "tvrain", group: "ru-exile", lang: "ru", feed: "https://tvrain.tv/export/rss/news.xml" },
  { slug: "pravda", group: "ua", lang: "uk", feed: "https://www.pravda.com.ua/rss/view_news/", feedBodyOnly: true },
  { slug: "unian", group: "ua", lang: "uk", feed: "https://rss.unian.net/site/news_ukr.rss" },
  { slug: "ukrinform", group: "ua", lang: "uk", feed: "https://www.ukrinform.ua/rss/block-lastnews" },
  { slug: "zn", group: "ua", lang: "uk", feed: "https://zn.ua/rss/full.rss" },
  { slug: "kyivindependent", group: "ua", lang: "en", feed: "https://kyivindependent.com/news-archive/rss/" },

  // Israel: the same feed URLs NewsLI ingests (supabase/functions/swift-endpoint/fetch-news.ts).
  { slug: "vesti", group: "il", lang: "ru", feed: "https://www.vesty.co.il/3rdparty/mobile/rss/vesty/13148/" },
  { slug: "cursor", group: "il", lang: "ru", feed: "https://cursorinfo.co.il/feed/" },
  { slug: "ynet", group: "il", lang: "he", feed: "https://www.ynet.co.il/Integration/StoryRss2.xml" },
  { slug: "jpost", group: "il", lang: "en", feed: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx" },
  { slug: "timesofisrael", group: "il", lang: "en", feed: "https://www.timesofisrael.com/feed/" },

  // World. Al Jazeera is blocked by Israeli ISPs (DNS answers with a foreign certificate), so it
  // was never probed from here; the cloud runner is outside Israel. A failed side feed only
  // thins the strip, it never stops an issue.
  { slug: "bbc", group: "world", lang: "en", feed: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { slug: "guardian", group: "world", lang: "en", feed: "https://www.theguardian.com/world/rss" },
  { slug: "nyt", group: "world", lang: "en", feed: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { slug: "dw", group: "world", lang: "en", feed: "https://rss.dw.com/rdf/rss-en-world" },
  { slug: "france24", group: "world", lang: "en", feed: "https://www.france24.com/en/rss" },
  { slug: "aljazeera", group: "world", lang: "en", feed: "https://www.aljazeera.com/xml/rss/all.xml" },
];

export const GROUP_LABEL: Record<Group, { ru: string; uk: string }> = {
  "ru-state": { ru: "госСМИ РФ", uk: "держЗМІ РФ" },
  "ru-exile": { ru: "эмигрантские СМИ РФ", uk: "емігрантські ЗМІ РФ" },
  ua: { ru: "украинские СМИ", uk: "українські ЗМІ" },
  il: { ru: "Израиль", uk: "Ізраїль" },
  world: { ru: "мир", uk: "світ" },
};
