# Doorway — Devpost draft

**DRAFT — NOT READY TO SUBMIT.** The text below describes implemented local behavior and the intended demonstration. It must retain these limitations until actual live evidence exists. No hosted URL, public code URL, video URL or human eligibility confirmation is available. Do not paste an unqualified completed-project claim into Devpost.

**Project name:** Doorway
**Tagline:** Help a small shop turn reviewed catalog data into a human-approved, verifiable agent checkout.

## Inspiration

A small pickup retailer can have a useful website while leaving a shopping agent unsure about stock, pickup days or policies. Our hypothesis is that the owner needs a short, inspectable path from those missing facts to an actual verified buying outcome.

PayPal already supports agentic discovery and checkout with human approval, and Shopify offers agentic storefront options. Doorway's proposed contribution is the connection between source evidence, owner repair, repeating the same shopping intent and checking what the payment provider actually recorded. We do not claim to have invented MCP, human-approved checkout or agentic commerce.

## What it does

The owner imports a public HTTPS merchant source into an unapproved catalog, reviews evidence and unknown/conflicting fields, corrects the data and house rules, and approves a version. Publishing requires owner authorization and domain-control proof. Domain proof does not verify the legal merchant or ownership of the PayPal account.

Private Test My Store inspects a shopping intent before launch and explains concrete obstacles. After owner repair, the same intent can be tested against the new version. The published ordinary storefront and MCP tools use server-priced quotes with stock, pickup, quantity and discount rules. A buyer approves the actual PayPal sandbox checkout.

Doorway separates capture requests from payment truth. It records operations and stable keys before external calls, saves the PayPal order before capture, and requires authenticated order/capture reads to match the expected order, amount, currency and recipient before PAID. Uncertain outcomes stay unresolved and are recovered through the existing operation. A signed receipt records Doorway's observation.

The owner can inspect recorded checks and sandbox order states, and approve one exact full or partial refund per checkout. The AG Studio dashboard uses observed records; its analyst can query or arrange a private report and cannot change the shop or move money.

## How we built it

TypeScript, Next.js/React, PostgreSQL transaction locks and uniqueness constraints, the official MCP SDK, a sandbox-only PayPal REST adapter, an Anthropic extraction/preflight adapter, Ed25519 receipts, and AG Studio's component and Studio Agent Framework. Dependency versions are frozen in the lockfile. Original Doorway code is MIT; commercial and third-party dependencies retain their own terms.

The server owns tenant, price, inventory, currency, discounts, payee and rules. Local three-minute reservations become pinned before a capture might occur; an ambiguous capture cannot release stock merely because a timer elapsed. The guarantee covers Doorway's ledger only.

AI has limited authority. Website text is untrusted input; extracted facts need source quotations and owner review. Dietary labels are exact confirmed data, not medical judgments. Shopping tools can prepare a checkout but cannot approve, capture, refund or publish.

## Challenges and lessons

A timeout is not proof that a payment failed. A webhook is not proof that the expected order was paid. A source quotation is not proof that a merchant's inventory is current. We designed the application around those distinctions and tested the SQL and external boundaries with injected failures.

The product also needs disciplined claims: repeated private tests are not market demand, and sandbox basket amounts are not earnings. An approval link is an intermediate result rather than a completed purchase.

## What is validated today

Local application and regression tests cover owner/capability boundaries, catalog approval and version changes, deterministic quotes, concurrent stock/payment operations, ambiguous responses, refund retries, stale/replayed events, state mismatches and receipt tampering. Exact commands, versions, browser results and test counts belong in the final [validation record](VALIDATION.md), not an invented benchmark.

**Live-provider acceptance remains outstanding:** real AI extraction, human-approved sandbox purchase/read/refund, delivered signed webhook, live crash recovery, hosted acceptance and an unfamiliar human test have not been recorded. The current fictional bakery is a synthetic fixture, not a merchant pilot.

## Impact and next steps

Our initial audience is an independent pickup retailer whose owner can confirm source data and policies. The proposed value is less confusion when preparing a shop for a connected agent and a clear explanation of what prevented a purchase. This is a hypothesis; we have no conversion lift, revenue, onboarding-time or willingness-to-pay result.

Next, supply lawful provider access, run one consented merchant/source through the frozen evidence protocol, complete the same-intent repair/purchase/recovery demonstration, and have an unfamiliar person use the hosted build. Measure ordinary and agent checkout against the same completed-capture endpoint before making comparative claims.

## Submission fields to complete

|Field|Current value|
|---|---|
|Public repository|https://github.com/cloudy070/doorway-paypal-ai-hackathon-2026|
|Working demo / complete executable access|Local instructions exist; hosted reviewer service NOT PROVISIONED|
|Public YouTube demonstration|NOT RECORDED OR UPLOADED|
|Team and authorized representative|HUMAN CONFIRMATION REQUIRED|
|Sponsor award selection|CONDITIONAL: AG integration validation and applicable licence/entitlement still required|
|AI/tool disclosure|[AI_DISCLOSURE.md](AI_DISCLOSURE.md); final contributor review required|
|Evidence and limitations|[COMPLETION_AUDIT.md](COMPLETION_AUDIT.md); [REQUIREMENTS.csv](REQUIREMENTS.csv)|

Use the [official rules](https://paypalaihackathon.devpost.com/rules) and [schedule](https://paypalaihackathon.devpost.com/details/dates) at final submission. Core PayPal+AI integration must actually work. Sponsor tools are optional for general eligibility; installing a package alone does not establish a sponsor-winning integration. Do not submit this draft while the central live and access requirements remain unresolved.
