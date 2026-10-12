// Feeds of the Parallax daily digest. Probed from the VPS 2026-10-11/12
// (docs/superpowers/specs/2026-10-12-parallax-edition-design.md has the table).
// RT and Sputnik are excluded by decision (EU sanctions), not by probe.

export type Group = "ru-state" | "ru-exile" | "ua";
export type Lang = "ru" | "uk" | "en";

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
];

export const GROUP_LABEL: Record<Group, { ru: string; uk: string }> = {
  "ru-state": { ru: "госСМИ РФ", uk: "держЗМІ РФ" },
  "ru-exile": { ru: "эмигрантские СМИ РФ", uk: "емігрантські ЗМІ РФ" },
  ua: { ru: "украинские СМИ", uk: "українські ЗМІ" },
};
