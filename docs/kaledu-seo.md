# Kalėdų Kampelis SEO writer

Select **Kalėdų Kampelis → SEO Blog** in Control Center. This profile uses the independent TypeScript writer in `server/kaledu-seo.ts`; it never calls Tavo Knyga's Python generator or reads its credentials.

- Settings: article count, topic list, installed Ollama model, strict QA, optional automatic publishing and Git push.
- Fresh-profile default: generate → review → Accept → save to the configured store checkout. Publishing settings can enable Git push on Accept or fully automatic publishing after QA.
- Drafts, settings and QA diagnostics stay under the profile's `seo-blog` directory. Fresh settings use `kaledu-settings.json` so old scaffold settings cannot silently enable publishing.
- Generation reads the store's current in-stock products and specifications, filters budget topics against catalog prices and supplies up to three relevant products. Short guides aim for 220–350 words, three focused sections and one or two product examples. A brief, writer, deterministic checks, and a separate editorial model call must all complete before saving a draft. See [editorial rules and sources](kaledu-seo-editorial.md).
- Mock mode creates clearly labelled previews which cannot be published.
- Failed generation keeps earlier completed drafts. Failed Git pushes keep drafts for retry; accepted files are not overwritten with different content.

Start Ollama locally before generating. A blank model setting prefers the installed Lithuanian model, excluding UGC, Tavo Knyga and vision models. GPU allocation is automatic, with a 4096-token context and separate compact writing/review skills. `KALEDU_SEO_OLLAMA_URL` can point to another Ollama server; the default is `http://127.0.0.1:11434`. Native Lithuanian fluency and sufficient memory matter; shorter output reduces work but cannot guarantee correct language.

The store supplies `/straipsniai`, `/straipsniai/[slug]`, canonical metadata, BlogPosting data, sitemap entries and a footer link. Git publishing requires a configured upstream and no unrelated uncommitted changes in its checkout. The publisher fast-forwards before checking the current catalog, commits only its article files and explicitly pushes HEAD to the upstream branch, even when local and upstream branch names differ.

IndexNow requires the matching key text file at the site root. After pushing, the writer waits up to three minutes for the article index, article pages and sitemap entries, then verifies the key and submits the index plus new article URLs. A timeout/submission failure leaves the Git publication intact and records a warning. This is a search notification, not guaranteed indexing. Successful HTTP/page checks are reported as live; a push alone stays deployment pending.

The `Sitemap URL ready: https://www.kaledukampelis.com/sitemap.xml` log and `run.sitemap` mirror Tavo Knyga's `ping_sitemap` hook. No Google indexing API or deprecated sitemap-ping endpoint is called.

## Configured publishing checkout

The Christmas profile can persist `siteRoot` in `kaledu-settings.json`. Its dedicated checkout is `D:/toolsai/.control-center-data/profiles/christmas-gifts/data/seo-blog/publisher-store`, on `main` of `ArminGamin/myshop3`. Vercel project `kaledukampelis` is connected to that repository and production branch. This checkout is independent of the ongoing edits in `D:/jaukumas`; generation uses its deployed catalog, and accepted articles are written under its `content/straipsniai` directory. Keep it clean and let the writer fast-forward it as needed. `KALEDU_SEO_SITE_ROOT` remains a higher-priority override for isolated tests.

Configured 2026-09-28: fully automatic publishing and Git push enabled, strict QA on, mock off, one article per run. The profile has its own generated IndexNow key, deployed as a public verification file. Control Center was restarted after confirming all hub modules were idle, and its live API reports the configured checkout and flags.

Production deployment `f7c2821` is READY. `/straipsniai` returns 200 with the canonical `https://www.kaledukampelis.com/straipsniai`, and that URL occurs in the live sitemap. The key file matches; the initial index-page notification returned IndexNow 202 (accepted, not confirmed indexed). No generated article was published during setup. The Vercel Turbopack build initially failed to resolve an internal Google-font module; the store build script now uses the supported `next build --webpack`, verified locally and in production. The same one-line build-script fix is present in the development store; its other ongoing edits were not deployed.

Tests use temporary profiles, fixture catalogs and local bare Git remotes, including differing branch names, failed-push recovery, IndexNow payloads and deployment readiness checks. No test publishes to the public store.
