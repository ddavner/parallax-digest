// node --import tsx --test tools/parallax-digest/rss_test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, inWindow, parseRss, LEAD_CHARS } from "./rss.ts";

const TASS = `<rss><channel><item><title>В Николаеве произошел взрыв</title><link><![CDATA[https://tass.ru/proisshestviya/28203953]]></link><guid><![CDATA[https://tass.ru/proisshestviya/28203953]]></guid><pubDate>Sun, 11 Oct 2026 23:55:49 +0300</pubDate><description>В Николаевской области Украины действует режим воздушной тревоги</description><category>Происшествия</category></item></channel></rss>`;

const PRAVDA = `<rss><channel><item><title><![CDATA[Зеленський: &laquo;енергетичне перемир&#39;я&raquo;]]></title><link>https://www.pravda.com.ua/news/2026/10/11/8057502/</link><pubDate>Sun, 11 Oct 2026 23:36:00 +0300</pubDate><content:encoded><![CDATA[<p>Перший абзац.</p><p>Другий <b>абзац</b> &mdash; з тегами.</p><script>x()</script>]]></content:encoded></item><item><title>No link</title><pubDate>Sun, 11 Oct 2026 23:36:00 +0300</pubDate></item></channel></rss>`;

test("TASS: link in CDATA, description becomes the lead, no body", () => {
  const [it] = parseRss(TASS);
  assert.equal(it.link, "https://tass.ru/proisshestviya/28203953");
  assert.equal(it.at, "2026-10-11T20:55:49.000Z");
  assert.equal(it.lead, "В Николаевской области Украины действует режим воздушной тревоги");
  assert.equal(it.bodyChars, 0);
});

test("Pravda: entities decoded, body stripped of tags and scripts, linkless item dropped", () => {
  const items = parseRss(PRAVDA);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Зеленський: «енергетичне перемир'я»");
  assert.equal(items[0].lead, "Перший абзац.\nДругий абзац — з тегами.");
  assert.ok(items[0].bodyChars > 0);
});

test("lead is capped", () => {
  const long = `<rss><item><title>t</title><link>http://x</link><description>${"ж".repeat(1000)}</description></item></rss>`;
  assert.equal(parseRss(long)[0].lead.length, LEAD_CHARS);
});

test("window keeps undated items and drops old ones", () => {
  const items = [
    { title: "old", link: "http://a", at: "2026-10-10T00:00:00.000Z", lead: "", bodyChars: 0 },
    { title: "new", link: "http://b", at: "2026-10-11T12:00:00.000Z", lead: "", bodyChars: 0 },
    { title: "undated", link: "http://c", at: null, lead: "", bodyChars: 0 },
  ];
  assert.deepEqual(inWindow(items, "2026-10-11T00:00:00.000Z").map((i) => i.title), ["new", "undated"]);
});

test("htmlToText: Cloudflare shell text survives for the interstitial check", () => {
  assert.match(htmlToText("<html><title>Just a moment...</title><body><div>Checking your browser</div></body></html>"), /Just a moment/);
});
