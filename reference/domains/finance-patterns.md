# Finance & Fintech Design Patterns

This pack documents the data-display, trading-UI, compliance, and payment-security conventions that distinguish finance products from generic SaaS. GDD loads it automatically when it detects a trading, brokerage, banking, ledger, or payments project (see Detection signals below). The auditor agent runs the Audit checklist at the end of this file against any finance UI.

## Data-table density

Financial UIs are table-first: positions, orders, ledgers, transaction histories. The table is the product, so its legibility budget is non-negotiable.

| Property | Convention |
|---|---|
| Comfortable row height | 44-52px (touch-reachable, default for retail) |
| Compact row height | 28-36px (pro/desktop blotters, high row counts) |
| Density toggle | Offer comfortable/compact (and sometimes a 24px "ultra") as a persistent user setting |
| Numeric font | `font-variant-numeric: tabular-nums` (or a font with lining + tabular figures) so digits occupy equal width |
| Numeric alignment | Right-align all numbers; align on the decimal point so magnitudes stack visually |
| Text columns | Left-align labels/symbols; never right-align prose |
| Row separation | Prefer 1px hairline rules (or subtle zebra) for dense data; avoid heavy zebra that fights the numbers |
| Header | Sticky/frozen header row; freeze the first identifier column (symbol/account) on horizontal scroll |
| Column min-width | Size to the widest plausible value (e.g. a 12-digit notional), not the average |

- Tabular numerals matter most where values change in place (live P&L): non-tabular figures cause horizontal jitter on every tick.
- Right-aligning currency columns lets the eye compare orders of magnitude at a glance; decimal alignment is what makes `1,234.50` and `9.05` line up.
- Keep currency symbols and unit suffixes out of the number cell when possible (put `USD`/`%` in the header) so the digits align cleanly.

## Trading-interface conventions

### Direction & semantics (never color alone)
- Red = down/loss/sell, green = up/gain/buy is the Western default; some markets (e.g. parts of East Asia) invert this — make the mapping a setting, not a hard-coded assumption.
- Roughly 1 in 12 men have red-green color vision deficiency. Never encode gain/loss with color only. Always pair color with a non-color cue: a `+`/`-` sign, an up/down arrow (▲/▼), or parentheses for negatives.
- Use a colorblind-safe palette (e.g. teal/orange or blue/orange instead of pure red/green) or let users opt into one.

### Real-time updates
- Flash the cell background briefly (~150-300ms) on value change — green tint up, red tint down — then fade back. This draws the eye without permanent clutter.
- Throttle/coalesce updates: batch ticks to ~4-10 fps (every 100-250ms) rather than rendering every websocket message; high-frequency feeds will otherwise pin the CPU and make text unreadable.
- Show a stale/latency indicator: timestamp of last update, a "delayed 15 min" badge for non-real-time quotes (a regulatory requirement for many retail feeds), and grey the data when the feed is stale.

### Order entry & destructive actions
- Add deliberate friction to order submission: an explicit review/confirm step that restates side, symbol, quantity, order type, limit price, and estimated cost before the order is live.
- Distinguish market vs limit orders clearly; warn on market orders in illiquid or fast-moving instruments.
- Guard destructive/irreversible actions (cancel-all, close-all, liquidate, withdraw): require a confirmation that names the consequence, and consider type-to-confirm for account-level actions.
- Disable the submit button while a submission is in flight; never allow accidental double-submission of an order.

## Regulatory disclaimer placement

The governing principle from advertising rules (SEC, FINRA) is proximity: a disclosure must sit next to the claim it qualifies, not buried in a global footer or behind a tooltip.

| Context | Disclosure |
|---|---|
| Margin trading / leverage | Reg-T margin risk disclosure and current margin requirements, shown in the margin/borrow flow |
| Performance / returns figures | "Past performance does not guarantee future results"; show net-of-fees and the period, adjacent to the number |
| EU cost transparency | MiFID II ex-ante (pre-trade) cost & charges estimate at order entry; ex-post (annual) statement of aggregated costs |
| Quotes & data | Delayed-data badge; real-time entitlement notice |
| Projections / hypotheticals | Label clearly as hypothetical and state assumptions inline |

- Ex-ante cost disclosure (MiFID II) belongs in the order ticket before confirmation, expressed in both percentage and cash terms, including the effect of costs on return.
- FINRA Rule 2210 and SEC marketing rules require communications to be fair, balanced, and not misleading — risk disclosures must be presented with at least equal prominence to the benefit/claim, not in 8px grey fine print.
- Authorities: https://www.sec.gov/ , https://www.finra.org/ , and the EU MiFID II framework.

## Card & payment data (PCI-DSS)

PCI-DSS governs how cardholder data is handled in the UI and beyond. Design must assume the front end is in scope.

- Mask the PAN: display only the last 4 digits (e.g. `•••• •••• •••• 4242`). The first 6 (BIN) may be shown only where genuinely needed.
- Never display, log, or store the CVV/CVC2/CID after authorization — not in state, not in logs, not in analytics. It is the one value that must never persist.
- Never put PAN, CVV, or full account numbers in URLs, query strings, `localStorage`, analytics events, error reports, or screenshots.
- Use tokenization: send card details directly to the processor (Stripe Elements, Plaid Link, etc.) so raw PAN never touches your servers; store the returned token, not the card.
- Mask card entry inputs and disable autocomplete logging of the CVV field; clear sensitive fields from memory after submit.
- Authority: https://www.pcisecuritystandards.org/

## Number formatting precision

Honest, locale-correct number formatting is a trust signal in finance. Use the platform's locale APIs (e.g. `Intl.NumberFormat`) rather than hand-rolled formatting.

- Currency minor units: respect each currency's decimal places — USD/EUR use 2, JPY/KRW use 0, and several (BHD, KWD, TND) use 3. Do not hard-code 2.
- Percentages: pick a precision and keep it consistent per context (2 decimals for yields/rates is common); show a trailing zero rather than dropping it (`5.00%`, not `5%`).
- Basis points (bps): 1 bp = 0.01% = 0.0001. Use bps for small rate moves and spreads; label the unit explicitly.
- Locale grouping/decimals: respect locale separators (`1,234.56` en-US vs `1.234,56` de-DE vs `1 234,56` fr-FR). Never assume `.` is the decimal mark.
- Negatives: in accounting contexts, show negatives in parentheses `(1,234.50)` (often with red); elsewhere a leading minus is fine. Pick one convention per surface and apply it everywhere.
- Rounding honesty: state whether a figure is rounded or truncated; never round a fee/cost down in a way that understates what the user pays. Carry full precision internally and round only at display.

## Real-time data UI

- Websocket cadence: subscribe to streams, but render on a throttled tick (100-250ms) and coalesce intermediate updates; full-snapshot on (re)connect, deltas thereafter.
- Optimistic vs confirmed: clearly distinguish an order/transfer that is *pending* (optimistic, locally echoed) from one *confirmed* by the venue/backend. Use a distinct state — never let a pending action look settled.
- Connection loss: show a persistent "Reconnecting…" banner the moment the socket drops; auto-reconnect with backoff.
- Stale-data greying: when the feed is stale or disconnected, grey out live values and freeze the last-known number with its timestamp, so users never act on data that looks live but is not.

## Detection signals

GDD treats a project as finance/fintech when it sees these signals. Keywords (in product copy, route names, schema, or component names) plus payment/market data dependencies in `package.json` are the strongest indicators.

**Keywords:** trading, trade, order, blotter, portfolio, position, P&L, brokerage, ledger, journal entry, invoice, banking, account balance, fintech, payments, payout, wallet, KYC, AML, custody, settlement.

**`package.json` dependencies:**

| Dependency | Signals |
|---|---|
| `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js` | Card payments / billing |
| `plaid`, `@plaid/...`, `react-plaid-link` | Bank account linking / ACH |
| `dwolla-v2` | ACH transfers / payouts |
| `finnhub`, `@alpacahq/alpaca-trade-api` | Market data / brokerage trading |
| `ccxt` | Crypto exchange connectivity |
| `lightweight-charts`, `react-financial-charts` | Financial / candlestick charting |
| `highcharts` / `highstock` | Stock charting |

Any one payment/market dependency, or a cluster of the keywords, should trigger this domain pack.

## Audit checklist

A finance UI should pass every item below.

1. Numeric columns use `tabular-nums` (or tabular lining figures), are right-aligned, and align on the decimal point.
2. The data table offers a density mode (comfortable/compact) and uses appropriate row heights; headers (and key identifier columns) stay frozen on scroll.
3. Gain/loss and up/down are never conveyed by color alone — each carries a sign, arrow, or parentheses, and a colorblind-safe palette is available.
4. Live values flash on change and updates are throttled/coalesced (no per-message re-render); a stale/delayed indicator and last-update timestamp are present.
5. Order entry has an explicit confirmation step restating side, symbol, quantity, type, and estimated cost; submit is disabled while a request is in flight.
6. Destructive/irreversible actions (cancel-all, liquidate, withdraw) are guarded by a consequence-naming confirmation.
7. Cost and risk disclosures sit adjacent to the figure they qualify (e.g. ex-ante costs in the order ticket), not in a global footer, and are at least as prominent as the claim.
8. Margin/leverage flows show the Reg-T margin risk disclosure; performance figures carry a past-performance disclaimer with period and net-of-fees basis.
9. PAN is masked to last-4; CVV is never displayed, logged, persisted, or stored after authorization.
10. No PAN, CVV, or account number appears in URLs, query strings, `localStorage`, analytics events, or error reports; card data is tokenized via the processor.
11. Currency, percentage, and basis-point values respect the correct minor units, locale separators, and a consistent negative convention; rounding/truncation is honest and applied only at display.
12. Real-time UI distinguishes pending (optimistic) from confirmed states and greys/freezes stale data on connection loss with a visible reconnect indicator.
