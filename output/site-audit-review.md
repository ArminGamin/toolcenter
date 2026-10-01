# Kalėdų Kampelis site audit — 2026-10-01

Scope: the current `D:/jaukumas` checkout and storefront, plus public read-only checks against https://www.kaledukampelis.com. This is a broad functional and regression audit, not proof of every possible browser, integration, or purchase outcome. No application source, prices, provider settings, or deployment were changed during this audit. Earlier requested banner changes remain local.

## Test results

| Area | Result | Evidence / scope |
| --- | --- | --- |
| Existing automated tests | PASS: 26/26 | Customer email templates and escaping, cart capture/debounce/retry, reminders and paid-cart suppression, recovery-token integrity/expiry, webhook queue/idempotency, external delivery retry paths. External messaging mocked. |
| Production build and TypeScript | PASS | `npm run build` uses Webpack; pages and workflow artifacts build successfully. |
| Full lint command | FAIL: 68 errors, 9 warnings | Includes temporary QA scripts and generated workflow code. |
| Application-source lint | FAIL: 15 errors, 4 warnings | Separate `eslint src`, excluding generated `.well-known` files. Hook/ref issues in popups, cart, gallery, motion, intro, social proof, and legacy thank-you page; unused-variable/dependency warnings. These do not all imply customer-facing failures. |
| Catalog/search/customer/core guards | 7/9 assertions pass | All 53 product names searchable, accent-insensitive Lithuanian search, empty/unmatched searches, valid Lithuanian customer fields, required-field errors, normal CSRF matching, checkout rate limit. Two failures: company email rejected and malformed CSRF cookie throws. |
| Public pages | Local 86/86; live 81/86 | Homepage, all 53 local product routes, 10 collections, search states, informational/legal pages, quiz, wishlist/cart/checkout, thank-you/recovery pages, social landing pages, articles index, robots, sitemap, feed. Five clothing products are local-only. |
| Linked navigation | One broken internal target | `/dovanos` from the invalid recovery page. Normal shop navigation and collection links work. |
| Legacy redirects | PASS: 7/7 in each environment | `/apmokejimas` and six renamed product routes resolve to intended destinations. |
| Assets | PASS: 276 local; 200 actually referenced live assets | Live image source paths, JS/CSS/fonts checked; five optimized live images sampled, all 200 with image content types. Local unpublished catalog images were excluded from live visible-image findings. |
| Catalog references | PASS | Related-product slugs and local product/variant image paths all exist. |
| Product SEO | PASS: 53 local, 48 published live | Product offers schema, canonical path, and sitemap inclusion. Sitemap has 70 local / 65 live entries, no duplicates or checkout entries. Checkout/success/recovery are noindex. Product feeds contain 53 local / 48 live items. |
| Gift finder | 840 combinations evaluated | Every combination returns results and every first result is within budget. 59 combinations include a later recommendation above the chosen maximum. |
| API rejection paths | PASS: 10 ordinary negative requests | Missing CSRF, absent webhook signature, invalid/missing payment/recovery/unsubscribe identifiers rejected with 400/403/405. A separate malformed-cookie test returns 500. |
| Newsletter integration simulation | FAIL on provider rejection | Actual route with external boundaries mocked returns success for provider HTTP 400 and 500, and when no provider is configured. No subscriptions or Discord notifications created. |
| Browser shopping flow | Core paths PASS; four UI/content assertions fail | Desktop 1280×720, mobile 390×844, tablet 768×1024. Search/Escape, cookie rejection, gallery, variants, bundles, quantities, add-ons, wishlist persistence/removal, filters/sorting, menu, FAQ, checkout validation, gift field preservation, leave/continue dialogs, cart empty state. |
| Responsive/accessibility spot checks | Core layouts PASS | No horizontal overflow in checked mobile home/product/quiz/checkout or tablet collection/FAQ. Checkout fields have labels and autocomplete. Home/product images have alt attributes. FAQ lacks h1. This is not a complete WCAG audit. |
| Browser console | No errors observed in tested flow | Only Stripe's expected warning about live integration on local HTTP. Production uses HTTPS. |

The immediately preceding pricing audit checked 53 products / 104 variants, **17,104 normal arithmetic scenarios** and **6,784 calls through real payment route code with Stripe mocked**. Ordinary prices, quantity discounts, delivery, gift, and add-on arithmetic match. All 48 published product prices matched local catalog prices. Those results are carried forward from the same code state; they were not needlessly rerun.

## Highest-priority findings

### 1. Payment controls can change the displayed amount while payment is running

The gift toggle stays enabled while the submit callback retains the old order model. Executing the actual callback with mocked Stripe confirmed a €29.39 intent after the displayed amount changed to €35.39. This is a reproducible race; it is not evidence that a customer has already been charged incorrectly. Lock amount-changing controls during payment and validate the final amount before confirmation.

Source: `D:/jaukumas/src/components/commerce/checkout-experience.tsx` (payment submit and `CheckoutShippingUpsells`). Evidence: [payment-change-audit.json](D:/toolsai/control-center/output/payment-change-audit.json).

### 2. Baskets over 30 lines can be undercharged

The client allows more lines, while server `parseLines()` silently keeps only the first 30. A 31-product basket showed €841.90 but server pricing included €826.00, a €15.90 difference. Reject excessive lines explicitly or enforce the same visible limit before checkout.

### 3. The checkout has no final displayed-total comparison

Server-side repricing is correct, but the payment request does not carry an expected displayed amount and the response does not return the priced amount for reconciliation. A stale page after a price change can reach payment with a different server total without acknowledgement. This is a missing safeguard, not a reproduced production price-update incident.

### 4. Legitimate email addresses prevent purchases

`D:/jaukumas/src/lib/security/email.ts` uses a provider-domain whitelist. The real customer validator rejects a syntactically valid company address such as `audit@example.lt`; newsletter uses the same rule. Accept valid email syntax rather than restricting customers to a short list of providers.

### 5. Newsletter signup can claim success without creating a subscription

`D:/jaukumas/src/app/api/newsletter/route.ts` ignores the provider response status. Simulated provider responses 400 and 500 both produce site HTTP 200 `{ok:true,mode:"klaviyo"}`. No configured provider also produces success with `mode:"logged"`. The UI promises “Esate prenumeratorius” for any successful HTTP response. Detect provider failures and define a truthful fallback. Production provider configuration and actual delivery were not inspected.

## Customer-facing and reliability findings

6. **Mobile cart hides shipping disclosure.** A mobile cart labelled €66.01 “Iš viso”; checkout added €2.99 delivery and showed €69.00. The desktop shipping note is absent on mobile. Checkout arithmetic is correct. See [mobile screenshot](D:/toolsai/control-center/output/site-mobile-cart.jpg).
7. **Shipping promises disagree.** Live metadata for `/tiktok`, `/dovanos/dovanos-jai`, and `/dovanos/dovanos-iki-50-euru` promises 1–2 working days, whereas current checkout/storefront says 4–6 days. `dovanos-jai` and `dovanos-poroms` descriptions promise free delivery from €49 instead of €80. Sources include `src/lib/data/collections.ts` and TikTok page metadata. These descriptions may appear in search/social previews.
8. **Gift finder exceeds selected budgets in some alternatives.** 59/840 combinations include over-budget results, though none ranks an over-budget item first. Browser reproduction: Jai → Iki 20 € → Romantiškas → Partneriui includes the €24.90 candle among six results. See [quiz screenshot](D:/toolsai/control-center/output/site-mobile-quiz.jpg).
9. **Invalid cart-recovery page has a broken escape link.** `src/app/checkout/recover/page.tsx:12` links to `/dovanos`, which returns 404 locally and live. Other shop links use `/dovanos/visos-dovanos`.
10. **Unknown product and collection URLs return HTTP 200 with not-found content.** Checked locally and live; ordinary unknown pages/articles return real 404. This is a soft-404 SEO/monitoring problem, not a purchasable phantom product.
11. **Malformed CSRF cookies cause API 500.** `src/lib/security/csrf.ts:17` decodes cookie values outside the try/catch. POSTing an empty newsletter payload with `kk_csrf=%ZZ` and the CSRF header returned 500 instead of a controlled rejection. No valid signup or delivery path was invoked.
12. **Success page can claim an email was sent without a payment.** Opening `/checkout/success` without identifiers displays completed payment steps and says a confirmation was sent. The paid checks correctly prevent purchase analytics and cart clearing; the problem is misleading UI copy/state. See [screenshot](D:/toolsai/control-center/output/site-success-without-payment.jpg).
13. **Malformed stored quantities differ between client/server.** Fractional stored quantity 1.5 showed €37.35 while the server floors it and priced €24.90. Normal UI controls use whole quantities; this is an edge case requiring consistent normalization.
14. **FAQ has no h1.** Its principal heading is an h2. Lower-priority accessibility/document structure issue.
15. **Lint remains red.** Source-only results are 15 errors and four warnings; full lint additionally includes generated/temporary files. Hook/ref findings deserve review and scoped regression tests before cleanup, rather than changing all of them blindly.

## Deployment differences, not confirmed shopping failures

Five local products are absent from the deployed catalog and its feed/sitemap:

- `megztinis-kasdienis-siltis`
- `dzemperis-siltas-uztrauktukas`
- `kardiganas-atviras-siltis`
- `pizama-vakaro-komplektas`
- `golfas-aukstas-kaklas`

Live catalog links do not advertise these five products. The live site's older image filenames also differ from the local revised image set; the 200 assets actually referenced live all passed. This should be treated as publication state, not hundreds of broken visible images.

## Proposed order for discussion

1. Address payment races, final amount reconciliation, line limits, quantity normalization, and valid customer email acceptance.
2. Correct newsletter success handling, shipping disclosure/promises, and unpaid confirmation state.
3. Repair quiz budgets, recovery navigation, soft 404s, and source lint/accessibility findings.
4. Review which local catalog changes should be published, then validate integrations in an isolated Stripe test environment before a release.

## Unverified boundaries

No real payment, PaymentIntent, hosted checkout session, refund, customer email, newsletter signup, Discord message, or deployment was performed. The dangerous real Discord test script was intentionally excluded. Stripe Elements loaded its card and Revolut Pay form; no card or valid email was entered. Tests do not establish live settlement, 3-D Secure, wallet availability on supported devices, live webhook delivery, provider account configuration, fulfilment, stock/supplier accuracy, deliverability, commercial margins, or every browser/device combination. No load test, penetration test, or complete content/legal/accessibility audit was performed.

## Reproducible evidence

- [Build log](D:/toolsai/control-center/output/site-build.log), [existing test log](D:/toolsai/control-center/output/site-tests.log), [lint log](D:/toolsai/control-center/output/site-lint.log), [source lint JSON](D:/toolsai/control-center/output/site-source-lint.json)
- [Functional audit](D:/toolsai/control-center/output/site-functional-audit.json), [integration audit](D:/toolsai/control-center/output/site-integration-audit.json), [SEO audit](D:/toolsai/control-center/output/site-seo-audit.json), [browser audit](D:/toolsai/control-center/output/site-browser-audit.json)
- [Prior pricing report](D:/toolsai/control-center/output/store-price-review.md), [pricing evidence](D:/toolsai/control-center/output/store-price-audit.json), [payment race evidence](D:/toolsai/control-center/output/payment-change-audit.json)
- Scripts: `site-functional-audit.cjs`, `site-integration-audit.cjs`, `site-seo-audit.cjs`, `check-store-prices.cjs`, and `check-payment-change.cjs` in `D:/toolsai/control-center/output`.
