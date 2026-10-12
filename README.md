# parallax-digest

Daily RU/UA press digest for the Parallax page: a zero-dependency RSS fetcher over eleven outlets
(Russian state, Russian exile, Ukrainian) and the brief a cloud routine follows to publish the page.
Mirror of `tools/parallax-digest/` in the NewsLI repository; edit there, sync here.

    npx -y tsx@4 tools/parallax-digest/fetch.ts --hours 24 --out digest-input.json
    node --import tsx --test tools/parallax-digest/rss_test.ts
