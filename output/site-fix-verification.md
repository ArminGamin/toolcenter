# Storefront fixes and verification — 1 October 2026

All 15 actionable findings from the earlier site audit are addressed in the local `D:/jaukumas` source. Two additional defects found during verification are also fixed: the cart leave prompt silently adding a paid gift, and incomplete Discord details for large orders. Changes have not been deployed.

## Fixes

| Area | Result |
| --- | --- |
| Payment amount changes during submission | Native checkout controls lock during submission. The callback captures a complete order before awaiting, rejects duplicate submissions, and checks both the server amount and the current displayed amount before confirmation. |
| Displayed versus charged amount | Both payment routes require an integer `expectedTotalCents`, reprice from the catalog, reject differences with HTTP 409 before creating payment, and return the priced total for reconciliation. Both embedded and hosted checkout clients use this contract. |
| Large baskets | Removed silent 30-line truncation. All 31 test products reach both payment routes and the complete order snapshot. An explicit 90-line limit rejects excessive orders rather than dropping products. |
| Malformed quantities | Client storage, rendering and server parsing share normalization to whole quantities between 1 and 10; invalid or zero quantities are removed. |
| Customer email | Removed the provider-domain whitelist. Ordinary company addresses and subdomains are accepted; malformed addresses remain rejected. |
| Newsletter | As requested, retain Discord capture and acknowledge receipt of the signup request. Missing destinations and provider failures cannot produce a successful signup message. The configured Klaviyo path checks acceptance and uses the server subscription-job contract. No actual signup was submitted. |
| Mobile and full cart totals | Mobile cart explicitly shows delivery and the final total. Full cart includes selected add-ons, gift and delivery. Cart views and checkout share selection state. |
| Accidental paid gift | Continuing, dismissing or leaving the cart prompt cannot silently add the mystery gift. Explicit gift selection remains available. |
| Delivery promises | Corrected audited metadata to 4–6 days and free delivery from €80. |
| Gift finder | Every recommended base price stays inside the selected budget. All 840 combinations still return results. |
| Recovery navigation | Invalid recovery links lead back to the working `/dovanos/visos-dovanos` collection. |
| Unknown URLs | Unknown products, collections and articles are rejected before streaming and return actual HTTP 404. This also avoids the framework diagnostic previously triggered by an unknown static article. |
| Bad CSRF cookies | Malformed encoded cookies produce controlled HTTP 403 instead of an exception. |
| Unpaid confirmation pages | Both confirmation routes display an unconfirmed-payment state without claiming an email or successful purchase. Unpaid visits preserve the cart. |
| FAQ | Principal heading is an h1. |
| Lint | Repaired source hook/ref findings and unused imports. Generated workflow files and temporary QA files are excluded; CommonJS scripts may use `require`. Full lint passes. |
| Order fulfilment details | New Discord notifications use the complete saved order, including charged amounts and variants, instead of the truncated legacy cart summary. Large lists include a complete text attachment; old small orders retain their JSON format. The multipart format follows [Discord's API reference](https://github.com/discord/discord-api-docs/blob/main/developers/reference.mdx). Delivery itself was mocked. |

The configured newsletter API contract was checked against [Klaviyo's consent documentation](https://developers.klaviyo.com/en/v2025-07-15/docs/collect_email_and_sms_consent_via_api). Local configuration has no Klaviyo credentials; Discord capture remains the chosen fallback.

## Final verification

| Check | Result |
| --- | --- |
| `npm test` | **52/52 pass:** 26 existing email tests and 26 storefront/payment regression tests. |
| Pricing regression | **16,000+ combinations** of current variants, quantities, gift and all add-on choices agree between client arithmetic and server order building. |
| Payment regressions | Both real route implementations exercised with Stripe mocked: changed/missing/fractional totals rejected; reviewed totals and all 31 products preserved. Actual callback exercised for displayed-total changes, inconsistent server totals and duplicate submissions. |
| Newsletter regressions | Provider 400/500 failures, provider 202 acceptance, successful/failed Discord capture, absent destination, invalid JSON and invalid consent covered with network mocked. |
| Order notifications | Full 31-product attachment and backwards-compatible small-order payload verified with network mocked. |
| Gift quiz | **840/840 combinations**, no empty results or recommendations outside the chosen budget. |
| `npm run lint` | Pass, no errors or warnings. |
| `npm run build` | Pass, including TypeScript and production page generation. |
| Built pages | **86/86 return HTTP 200**, no broken discovered internal links. |
| Referenced/catalog assets | **276/276 pass**. No missing catalog images or related-product references. |
| Redirects | Seven audited legacy redirects point to their expected destinations. |
| Unknown pages | Page, product, collection and article examples return HTTP 404. |
| API rejection checks | Ten invalid or unauthenticated requests return the expected 400/403/405. Malformed CSRF cookie returns 403. |
| Product SEO | All 53 local products have canonical URLs, Product offers schema and sitemap entries. 70 sitemap locations, no duplicates or checkout entries; 53 feed items. Private checkout pages remain noindex. |
| Browser | Desktop 1280×900, mobile 390×844 and tablet 768×1024 spot checks. Mobile delivery disclosure, cart continuation without gift, synchronized optional charges, gallery reset on variant change, checkout field retention across gift changes, €29.39 ↔ €35.39 totals, strict-budget quiz, both unpaid confirmation routes and FAQ h1 checked. No browser errors observed. Stripe's expected local-HTTP warning remains. |
| Production-server log | Final route/asset/API verification completed without runtime errors. |

Browser interactions were checked after hydration. Tests of payment and provider delivery use mocks; no card or valid email was entered in the browser.

## Evidence

- [Tests](D:/toolsai/control-center/output/site-fix-all-tests.log), [lint](D:/toolsai/control-center/output/site-fix-lint.log), [build](D:/toolsai/control-center/output/site-fix-build.log).
- [Functional crawl](D:/toolsai/control-center/output/site-fix-functional-audit.json), [SEO checks](D:/toolsai/control-center/output/site-fix-seo-audit.json), [malformed-cookie check](D:/toolsai/control-center/output/site-fix-request-boundary.json), [production server log](D:/toolsai/control-center/output/site-fix-server.log).
- [Mobile cart proof](D:/toolsai/control-center/output/site-fixed-mobile-cart.jpg), [unpaid confirmation proof](D:/toolsai/control-center/output/site-fixed-unpaid-confirmation.png).
- Regression suites: [storefront and routes](D:/jaukumas/scripts/test-storefront.cjs), [checkout callback](D:/jaukumas/scripts/test-checkout-submit.cjs).

## Release boundaries

No deployment, real payment, hosted payment session, customer email, newsletter signup or Discord message was performed. These checks establish local code behavior; live settlement, authentication, webhook delivery and provider account configuration remain unverified.

The five local clothing products previously absent from the live catalog remain preserved. Their publication state is a separate release decision. Existing unrelated workspace changes have been preserved.
