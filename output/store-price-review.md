# Price and charge consistency checks — 2026-10-01

Read-only review of D:/jaukumas and the public production catalog at https://www.kaledukampelis.com. Application prices and checkout code were not changed. Stripe was mocked; no real payment, PaymentIntent, or hosted session was created.

## Passed

- 53 local products and 104 variants: positive integer-cent prices, valid default variants, and valid higher crossed-out prices.
- 17,104 normal scenarios: every variant, quantities 1–10, all eight add-on combinations, gift on/off, and mixed baskets of 2–30 lines. Client item resolution and displayed checkout arithmetic match server order totals and hosted Stripe line items plus shipping.
- 6,784 simulated calls through the actual PaymentIntent and hosted Checkout routes: their Stripe parameters match the expected totals. Currency is EUR; no automatic tax or promotion feature is configured in these requests to add or subtract an undisplayed amount.
- 48 live product pages: structured product prices and visible formatted prices match the local catalog. The five newer clothing URLs return Next.js not-found content; their live prices cannot be verified.
- Quantity discount rounding is shared between product forms, carts, and the server: the €24.90 candle is €44.82 for two and €63.51 for three.
- Checkout includes €2.99 delivery below €80, waived at €80 or when the €8.99 gift is selected. Protection is €1.50, priority is €2.50, and donation uses the same rounding calculation on client and server.

## Findings

1. **More than 30 cart lines can be undercharged.** `parseLines()` silently keeps only the first 30 lines, while the client cart has no equivalent line-count limit. A valid 31-product basket showed €841.90 of products but the server priced €826.00: €15.90 less. Limits should be explicitly rejected or applied visibly before payment.
2. **The gift can change during payment.** Payment buttons disable while busy, but `CheckoutShippingUpsells` continues to call the enabled gift toggle. The running submit callback keeps the old model. An isolated execution of the actual callback with mocked Stripe still confirmed the original €29.39 intent after the displayed gift-selected total changed to €35.39. The UI should lock amount-changing controls until payment completes.
3. **There is no final displayed-total comparison.** The server correctly reprices from its own catalog, but the request has no expected amount and the response returns only a client secret. A stale page after a price update, or altered cart state, can therefore produce a different server amount without an explicit price-change acknowledgement. The server should compare against the displayed total before creating/confirming payment.
4. **The mobile cart labels a pre-shipping amount “Iš viso”.** It excludes delivery; the desktop shipping note is hidden on mobile. Checkout itself shows shipping and the correct total. This can look like a €2.99 price increase to the customer.
5. **Malformed stored quantities are normalized differently.** The client accepts fractional stored quantities; the server floors them. A quantity of 1.5 displayed €37.35 of products versus €24.90 on the server. Ordinary UI controls use whole quantities, so this is a stored-state edge case rather than the normal buying path.

## Limits

This validates current local payment code and the production public catalog, not a completed production charge or the deployed backend's source equivalence. No Stripe account settings or transaction records were changed or inspected. Commercial margins and supplier costs were outside scope.

Evidence: `store-price-audit.json`, `payment-change-audit.json`. Reproducible scripts: `check-store-prices.cjs`, `check-payment-change.cjs`.

Stripe amount semantics: https://docs.stripe.com/api/payment_intents/create
