# Reviewer instructions — development draft

**Current status: local development build; live provider acceptance and judging access are not provisioned.** No hosted URL, public repository URL or video link exists in this package yet. These instructions distinguish what can be checked now from the full path that still requires configured server services and human sandbox approval.

## Run a local review

Use the exact [README](../README.md) setup for the frozen lockfile, environment and database. In brief: Node 22+ (24 recommended), pnpm9.15.9 (the tested version), `pnpm install --frozen-lockfile`, an ignored `.env.local` from `.env.example`, then `pnpm db:setup` if matching local PostgreSQL binaries are available, `pnpm seed`, and `pnpm dev`. The default origin is `http://127.0.0.1:3000`; it must match APP_URL exactly. A development embedded PostgreSQL fallback is available when DATABASE_URL is absent. Production/judging deployment requires the full configured database and stable secrets.

For a new seed, local reviewer credentials are in ignored `.data/local-reviewer.txt`. The seed preserves an existing fictional fixture. Do not publish that file or use production customer credentials. Alternatively register a local owner account with a password of at least twelve characters and create a fictional shop.

Open the dashboard, store workspace, catalog review, Test My Store, orders and published storefront. All seeded bakery products are **SYNTHETIC**. Seed approval and the local fixture's verification token are conveniences for a controlled demo; they are not proof of real merchant review or control of an external domain.

## What works without provider keys

- Review persisted fixture products/rules, create a new draft version, explicitly confirm changes, approve and publish the controlled fixture.
- Run private Test My Store and inspect its source label. Without an AI key this is bounded **LOCAL_VALIDATION**, not live model reasoning or website extraction.
- Use the ordinary storefront to get a server-priced quote for an allowed pickup date. The Saturday fixture requires Saturday collection; choose an actual upcoming Saturday.
- Inspect empty/dashboard/loading/error states and observed-event counts. Repeated tests are repeated records, not independent customer demand.
- Run local regression and real SQL/MCP checks. No PayPal order can be created when sandbox configuration is absent; the expected response is an explicit unavailable state.
- Use actual AG Studio chart/filter/layout controls in a lawful local evaluation. Licence warnings/watermarks are meaningful. A model-backed analyst needs server Anthropic access and the relevant AG entitlement.

A missing key does not produce a simulated success. Do not treat a visible PayPal button, approval-link arrival, static screenshot or passing fixture test as proof of money movement.

## Full owner → buyer → verified outcome acceptance

This sequence is an acceptance procedure, not a report that it has already passed.

1. **Owner and source.** Sign in as a shop owner. For a real merchant, use a consenting public HTTPS source, import it with configured AI, and inspect per-field evidence/unknowns. No extraction should succeed silently without a provider.
2. **Specific obstacle.** Save a natural-language shopping intent and run private Test My Store against the draft. Record exact intent, catalog version, source label, model/version and a concrete finding. A private check must not publish, reserve inventory or create payment.
3. **Owner repair.** Inspect the cited source. Correct the actual product/rule error, clear product issues only after review, explicitly confirm uncertain house rules and save a new draft. Approve it as owner. Verify control by adding the exact meta tag to the configured merchant domain, then publish. External domain proof is not legal identity or ownership of the PayPal account.
4. **Same-intent retest.** Repeat the identical original intent and record the new catalog version plus explanation. If a change of date/product is required, show the buyer choosing a permitted alternative/new quote. Never infer allergen safety or silently substitute.
5. **Ordinary or connected-agent cart.** Use either the published storefront or the documented MCP tools. Inspect exact items, currency, collection date, catalog/rules version and server-calculated bulk rule. Changed catalog or expired quote must require a new quote.
6. **Human sandbox approval.** With genuine sandbox app/payee configuration, start checkout and keep the original capability URL private. The buyer follows the actual `sandbox.paypal.com` approval page, using a separate sandbox personal buyer. Only the human approves. Returning to Doorway alone does not mean PAID; press the completion/verification action.
7. **Authenticated outcome.** Confirm that Doorway shows PAID only after order and capture reads agree on the internal references, full amount, currency, payee and capture/order linkage. Inspect matching internal checkout, PayPal order and capture IDs. Pending, declined, mismatch and UNKNOWN must remain visibly distinct.
8. **Receipt.** Open and verify the signed observation. Altered content or an untrusted replacement signing key must fail verification. The statement is Doorway's observation of sandbox state, not a PayPal signature or fulfillment guarantee.
9. **Owner refund.** As owner, prepare an exact amount, review this exact order/amount and explicitly confirm. Repeat the same confirmation: the result must reuse the same operation rather than create a second refund. One full or partial refund is supported per checkout. Do not use a buyer capability to manage refunds.
10. **Dashboard.** Inspect recorded outcomes, private checks and rejected quotes with their provenance. If configured/licensed, use the Studio analyst to query or arrange this private report. It cannot publish a shop, pay, refund or change business records. Sandbox values are not real sales revenue.

Record every attempt, including failed attempts and reruns, according to [bench/protocol.md](../bench/protocol.md). Freeze the protocol/cases/commit before benchmark runs.

## Recovery and negative cases

First run `pnpm test`; deterministic SQL/external-boundary tests exercise concurrent start/capture, last-unit stock, expired approval hold, lost create/capture/refund response, pending/mismatch, receipt alteration, webhook forgery/replay and a recreated worker after the capture boundary. These are **LOCAL_VALIDATION with injected transport**, not live provider experiments.

For live recovery, provision a dedicated isolated sandbox environment and an explicit, reviewed fault mechanism after the real capture is accepted but before local persistence. That live fault mechanism/run has not been recorded. Preserve the durable operation, request key and original order ID; suppress webhook delivery for that case; restart the worker and re-read the original provider record. Expected evidence is UNKNOWN followed by the authenticated paid observation, one capture, one stock commit and one receipt. Never create another order to resolve uncertainty. Clearly label `fault_injected=true`; do not disrupt a shared judging instance.

For the three-minute hold, delay approval beyond expiry before capture: the checkout must cancel/requote without capturing. After capture might have started, an UNKNOWN reservation must remain pinned until safe reconciliation. Other sales channels are not reserved.

Use a real public HTTPS webhook URL, configured webhook ID and a retained `pnpm worker` process. Capture a genuine verified event followed by provider read, a rejected forgery and a replay with no repeated mutation. Current code does not make a loopback-only URL externally deliverable.

## Developer verification

Run these independently and preserve actual output/version/commit in [VALIDATION.md](VALIDATION.md):

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec tsx scripts/postgres-smoke.ts
pnpm exec tsx scripts/mcp-smoke.ts http://127.0.0.1:3000/api/mcp/SHOP_SLUG
pnpm claims:check
```

The PostgreSQL smoke needs a separate TEST_DATABASE_URL and checks two real client pools, locks and rollback. The MCP smoke uses the official SDK over HTTP and stops after cart creation; it does not approve or capture. The readiness command should currently fail because mandatory live/host evidence is absent. Never fabricate rows to turn it green.

## Judging access handoff — unresolved

|Item|Value today|
|---|---|
|Public repository|NOT CREATED / URL NOT AVAILABLE|
|Hosted functional demo|NOT PROVISIONED|
|Public YouTube video|NOT RECORDED OR UPLOADED|
|Judge owner account and sandbox buyer instructions|NOT PROVISIONED|
|Server-side Anthropic/PayPal configuration|NOT SUPPLIED|
|AG Studio applicable public-demo/judging rights|UNVERIFIED|
|Retained database/worker/provider budget through judging|UNCONFIRMED|

Before submission, the contributor must supply a working URL or complete executable access, dedicated reviewer instructions/account, a separate sandbox buyer procedure and server-side paid-service keys. Judges must not be expected to buy API access or provide their own Anthropic key. Give only dedicated test credentials through appropriate testing instructions; never publish production secrets, raw customer records, capability URLs, session cookies or private chats.

The [official rules](https://paypalaihackathon.devpost.com/rules) allow runnable local access or hosting. The user additionally requires hosted acceptance by an unfamiliar consenting human. Keep the chosen access functional and free through the [judging end](https://paypalaihackathon.devpost.com/details/dates), 15 December 2026 at 16:00 London. See [completion audit](COMPLETION_AUDIT.md) for the remaining release conditions.
