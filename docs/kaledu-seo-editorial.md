# Kalėdų Kampelis editorial rules

Runtime: `server/kaledu-seo-editorial.ts`, version `kaledu-short-5` plus a hash of both rule files and the search plans. Applies to the Christmas profile only. Writer and editor instructions live in `server/seo-skills/kaledu-short-guide.md` and `server/seo-skills/kaledu-short-editor.md`, loaded at module startup and used for every real generation. Restart the bridge after editing these files. Their hash invalidates previous approvals when rules change.

The reusable Codex skill is `C:/Users/kajus/.codex/skills/kaledu-seo-writer/SKILL.md`. It guides future work on the same pipeline; application execution does not depend on Codex loading that skill.

## Research basis

Reviewed 2026-09-26. Practitioner advice informs editorial choices; it does not establish ranking guarantees.

| Primary source | Implemented rule |
| --- | --- |
| [Google: helpful, reliable content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | Answer the reader's task, add useful analysis, avoid fabricated experience, padding and artificial freshness. There is no Google-preferred word count. |
| [Google: generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content) | Check generated claims, metadata and relevance; scale does not replace quality. |
| [Backlinko: SEO content](https://backlinko.com/seo-content) | Match the content format to intent, use descriptive headings and natural keyword variations, add value beyond a product list. |
| [Ahrefs: information gain](https://ahrefs.com/blog/information-gain/) | Add concrete decision help and useful distinctions rather than paraphrasing other pages. We do not claim a confirmed Google information-gain score or invent original research. |
| [Google: title links](https://developers.google.com/search/docs/appearance/title-link) | Titles accurately describe the page without exaggerated claims or repeated keyword variants. Character bounds are house style, not guaranteed search-display limits. |
| [Google: link practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable) | Relevant crawlable internal links with clear labels; no SEO link-count quota. |

## Runtime workflow

1. **Brief:** `server/kaledu-seo-topics.ts` maps 18 seed clusters to distinct decision questions and required comparison criteria. New defaults use the questions; existing saved category seeds resolve at generation without overwriting settings. Known category/question aliases share a queue identity, including older published articles. Custom questions stay intact. Each writer and reviewer receives the plan, catalog facts and up to six relevant existing topics. Intent is explicitly an inference: no live SERP or keyword-volume connector is installed. This deduplicates known aliases, not arbitrary semantic paraphrases.
2. **Writer:** aim for 220–350 words, an answer-first introduction, exactly three sections, one or two relevant examples, a tradeoff and a practical next step. At most one optional FAQ that adds something new. Straightforward Lithuanian rather than elaborate idioms. The 160-word stub guard and 450-word ceiling control scope and local inference workload; neither is a ranking formula. Briefs contain at most three products and four specifications per product.
3. **Deterministic checks:** structure, incomplete stubs, excessive length, exact and near-duplicate paragraphs, repeated sentences, catalog link destinations and labels, cross-brand leakage, explicit unsupported testing/guarantee claims, numeric prices. Catalog eligibility is checked again at acceptance.
4. **Editorial review:** a separate low-temperature call checks intent, usefulness, factual support, Lithuanian, originality within the supplied text, title promises and link relevance. Every passing check requires a quote verified against the article. Missing checks, fabricated evidence, malformed responses or any `revise` result fail the attempt. This uses the writing model again; it is not an independent human review or an E-E-A-T score.
5. **Repair:** at most three writing attempts. A retry receives the failed draft plus specific corrections rather than starting blind. Failed output stays in profile QA diagnostics, never in publishable drafts.
6. **Review and acceptance:** passing drafts carry the model, checks, date and fingerprints of their text and source catalog. Edited text, changed catalog or old rule versions require regeneration. Manual review remains the default; the automated gate applies even when optional strict similarity checks are off or auto-publishing is enabled.

The store catalog supplies facts, not independently verified testing. Do not reuse ratings, sales claims or customer stories as proof. Material, size and care details may only be stated when present in the supplied specification. Missing details should be checked on the product page. For budget topics, check current prices and shipping before buying.

Product selection uses meaningful word prefixes, recipient tags and catalog style tags. Filler such as `pagal` must not match `pagalvės`. Reading, decoration and housewarming questions restrict candidates to relevant product families; an empty match fails clearly instead of inserting arbitrary products. Colleague/Secret Santa and unknown-taste topics exclude several personal, scented and alcohol product names as an editorial precaution. These heuristics are candidate selection, not proof of suitability. The writer still needs to justify every example. Stock and budget checks apply before ranking.

Briefs and related links ignore generic gift/Christmas/how-to wording. Only overlapping topics enter the brief, together with up to three existing section headings so the editor can check whether a proposed angle adds anything. This is a bounded lexical comparison, not a semantic duplication guarantee. All 18 plans were exercised against the real catalog after the selection change; this verifies candidates, not generated article fluency or ranking performance.

No fake authors, invented hands-on use, medical promises, fabricated statistics, forced keywords, mandatory FAQs, artificial date changes or traffic guarantees. Length limits are local rendering/context safeguards. Related-page and product decisions should support the reader's task.

## Evaluation

`npm test -- --run server/__tests__/kaledu-seo.test.ts` exercises meaningful good/bad fixtures, repair feedback, editorial failure, stale approvals, mocked streaming, profile isolation and publication failure recovery. Mocks validate orchestration, not model fluency.

`npx tsx scripts/kaledu-seo-canary.ts [installed-model-name]` runs a real model against a temporary copy of the catalog, with an isolated profile and publishing disabled. It stops after 15 minutes and prints the folder containing `result.json` and QA logs. `KALEDU_CANARY_CATALOG_ROOT` can select another local store checkout. Review the actual prose and factual support before choosing a model; a two-sentence smoke test is insufficient evidence for full-article quality.

The initial real `jobautomation/OpenEuroLLM-Lithuanian:latest` article on 2026-09-26 was rejected, not published. It used product slugs as labels, contained an unresolved budget placeholder and had awkward Lithuanian and weak gift relevance. That test led to generic-word filtering in catalog selection, conditional reading-use-case matches, canonical labels for known slug links, and explicit placeholder rejection. These fixes have regression tests; full-article fluency is still unverified with the revised rules. A short coherent sample is not a production-quality pass.

The 2026-09-27 short-guide test reached editorial review after length repairs and selected more relevant blanket/tea examples. It was still rejected: the editor flagged Lithuanian problems and gave a factual-evidence quote that did not occur in the article. The observed generation rate was about 8 tokens/second, versus about 3 in the earlier run; hardware load also differed, so this is not a controlled speed benchmark. No publishable draft resulted. Length feedback now includes the measured word count and specific ways to add useful detail. The latest length-feedback refinement has regression coverage but has not had another full model evaluation.

For reach, validate promising topics against current Lithuanian search results and Search Console data, review actual customer questions, then measure impressions, clicks and useful visits after publication. This writer does not currently fetch live SERPs, verify worldwide originality, or measure ranking outcomes.

## Search and AI discovery: checked 2026-09-27

The 18 plans cover Christmas selection, recipients, budgets, interests, Secret Santa, decorations and buying constraints. Each short guide answers one decision; it must add a useful criterion and limitation rather than merely enumerate products. Broad category terms remain a store-navigation intent; articles use specific questions and helpful product links. Keyword variations are natural language, not a quota. Do not generate a page for every wording variation or imply global reach from Lithuanian content.

| Primary source | Application |
| --- | --- |
| [Google generative AI optimization](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) | Helpful original content and ordinary search accessibility remain central. No special AI schema, forced tiny text chunks or llms.txt requirement. Short guides suit this task and model, not an AI-ranking formula. |
| [OpenAI publishers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) | Allow OAI-SearchBot for discovery of summaries/snippets; ChatGPT search referrals can carry utm_source=chatgpt.com. Access does not promise inclusion. |
| [Anthropic crawler documentation](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) | Claude-SearchBot supports search discovery and Claude-User retrieves pages for users. These are separate from training access. |

Live HTTP checks: `https://www.kaledukampelis.com/robots.txt` and `/sitemap.xml` returned 200. The wildcard robots rule permits public content; no special search-bot exclusion was present. This is a robots-policy check, not verification of crawler IP access through a firewall. `/straipsniai` returned **404**, and the sitemap contained no article routes. The local blog implementation therefore still needs deployment before articles can be discovered. No deployment or article publication was performed by this change.

Update 2026-09-28: the publishing setup request deployed the blog infrastructure. `/straipsniai` now returns 200 with the correct canonical and index URL in the live sitemap. See `docs/kaledu-seo.md` for the dedicated publishing checkout, automatic settings and verified Vercel/IndexNow results. Article language quality remains a separate evaluation; no generated article was published during that setup.

After reviewing actual Lithuanian copy and deploying: verify each article returns 200 with a self-canonical, visible server-rendered text, a crawlable link from the article index, accurate BlogPosting data and a sitemap entry. Check Search Console indexing and relevant Lithuanian queries; compare impressions, clicks and sales, plus AI referral traffic in existing analytics. Crawling permission, schema and prompt quality cannot guarantee rankings, AI citations, or mentions in chatbot answers that do not use web search. Do not report measured improvements before collecting them.
