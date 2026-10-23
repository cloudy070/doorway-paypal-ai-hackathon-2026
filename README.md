# Doorway

Owner-reviewed stores for connected shopping agents. Doorway imports a public merchant site with AI, preserves evidence and uncertainty, lets the owner repair and approve a version, and exposes server-validated shopping tools. A buyer approves PayPal sandbox checkout; authenticated provider reads determine payment truth.

**Development build, not submission-ready.** Local fixtures are fictional. Live AI, human-approved PayPal purchase, real webhook, hosted acceptance, unfamiliar-user testing and video/submission artifacts still require external access. See [completion audit](docs/COMPLETION_AUDIT.md) and [plan](docs/PLAN_EN.md). No conversion, revenue or speed improvement is claimed.

Public source: https://github.com/cloudy070/doorway-paypal-ai-hackathon-2026 . The connected GitHub app publishes the source snapshot. The original local Git history is preserved in `source-history.bundle`, including the protocol commit before measurements. After cloning, import those original evidence commits before the claim check:

```sh
git fetch ./source-history.bundle refs/heads/master:refs/remotes/doorway-evidence/master
```

This adds evidence-history objects and does not replace the checked-out branch. [Validation](docs/VALIDATION.md) identifies the exact implementation commit and completed checks.

## Run locally

Requirements: Node22+ (Node24 recommended), pnpm9.15.9 (the tested version), and PostgreSQL for the full integration path. Lockfile is committed. Do not use `npm install` alongside pnpm.

```sh
pnpm install --frozen-lockfile
```

Create `.env.local` from `.env.example`. Set `DATABASE_URL` to a PostgreSQL database and `TEST_DATABASE_URL` to a **separate** test database. With locally installed PostgreSQL binaries, `pnpm db:setup` provisions a loopback-only instance on55432, databases, signing keys and random local secrets. Set `POSTGRES_BIN` to your installation's bin folder; the script's default path is this Windows workstation's installation. It never needs a pre-existing repository. Without DATABASE_URL, development uses durable embedded PostgreSQL under `.data/pglite`; production requires a real PostgreSQL URL.

```sh
pnpm seed
pnpm dev
```

Open http://127.0.0.1:3000. The seed preserves existing fixtures. For a newly seeded database it writes random local reviewer credentials to ignored `.data/local-reviewer.txt`; it does not print or commit them. Alternatively register a new local account with a12+ character password, create a fictional demo shop and review it through the UI. Synthetic seed approval is a fixture convenience, not evidence that an external merchant reviewed data.

Owner journey: dashboard → new shop → import public HTTPS site or seed fictional fixture → review products and unknown fields → explicitly review house rules → approve → add verification meta tag to the actual site → verify → publish. Fixture verification is explicitly local, not external ownership proof. Private Test My Store reads drafts and cannot pay or publish. Published storefront and MCP tools enforce the same catalog/rules version.

## Real integrations

Set these in ignored `.env.local`; never paste or commit secrets:

- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: a **sandbox** REST application.
- `PAYPAL_MERCHANT_ID`: that application's sandbox business merchant ID. The pilot uses one server-configured recipient across shops; multi-merchant onboarding is not implemented. Domain verification does not establish PayPal ownership.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`: server-side real AI extraction and read-only preflight. No key means explicit unavailable or LOCAL_VALIDATION, never fake extraction. The current default model is `claude-sonnet-4-6`; confirm availability on your account.
- `APP_URL`: exact browser origin. Owner/browser mutations require it. Use HTTPS for hosted access; cookie security follows this value.
- `CHECKOUT_ACCESS_SECRET`, `RECEIPT_PRIVATE_KEY`, `RECONCILE_SECRET`: stable deployment secrets. The setup script generates local ones. Production requires these plus DATABASE_URL. Back up signing keys with the database and preserve trusted public keys when rotating.
- `PAYPAL_WEBHOOK_ID`: create a sandbox webhook at `https://YOUR_HOST/api/paypal/webhook` for relevant checkout/capture/refund events. The backend asks PayPal to verify signatures, deduplicates events and then reads payment state. A local loopback URL is not a valid externally delivered webhook endpoint.

Restart development after changing secrets. The UI status checks presence, not validity. Use a different sandbox personal buyer from the configured business seller. Publish an approved shop, create a quote for an allowed pickup date, start checkout and follow the genuine sandbox approval link. The return page requires **Complete sandbox order**; redirect parameters alone cannot mark it paid. Verify matching internal/PayPal order/capture IDs and the signed receipt. Run `pnpm worker` in a retained process for30-second reconciliation independently of webhooks.

The gateway is pinned to `https://api-m.sandbox.paypal.com`; there is no live-money switch. Human PayPal approval remains a human action. Unknown outcomes retain the same durable operation and idempotency key; do not create another payment to resolve uncertainty. Retry is conservatively blocked outside six hours. Refund supports one exact owner-confirmed full or partial refund per checkout; additional partial-refund sequences are outside this pilot.

## MCP

Endpoint: `/api/mcp/SHOP_SLUG`. Official SDK1.32.2, stateless Streamable HTTP. Tools: `get_store`, `search_products`, `check_availability`, `create_cart`, `start_checkout`. A published/verified approved store is required even for tool discovery. Price, shop tenant, inventory, discounts and payee are server-owned. No capture/refund/publish tools exist. start_checkout returns a capability-protected browser URL for human approval.

```sh
pnpm exec tsx scripts/mcp-smoke.ts http://127.0.0.1:3000/api/mcp/SHOP_SLUG
```

This real HTTP client smoke stops after cart creation. It proves neither AI reasoning nor a completed payment. Compatibility claims apply only to the clients actually tested.

## Checks and evidence

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec tsx scripts/postgres-smoke.ts
pnpm claims:check
```

Tests use real SQL storage and inject the external provider boundary for deterministic failures. `postgres-smoke` requires the isolated TEST_DATABASE_URL and checks two independent pools, concurrent locks and rollback. The readiness gate is intentionally red while required LIVE_AI/LIVE_SANDBOX/hosted evidence is absent. A passing unit suite is not a completed hackathon integration.

Evidence protocol/cases are in bench/. Keep every failure and labeled rerun; bind numerical public claims to completed runs. Do not tune on held-out cases. Source labels distinguish SYNTHETIC, LOCAL_VALIDATION, LIVE_AI, LIVE_SANDBOX and RECORDED; fault injection is separate. Dashboard rejected quotes are observed requests, not proven buyer demand or lost revenue.

## Build and deployment

`pnpm build` then `pnpm start` runs locally. The default server binds loopback; a deployment platform must explicitly set an appropriate bind address, HTTPS reverse proxy, APP_URL, managed PostgreSQL and stable server secrets. Run the reconciliation worker separately. Do not deploy evaluation-only commercial dependencies until rights are confirmed. [Reviewer guide](docs/REVIEWER.md) lists the actual end-to-end acceptance and access needs.

## Limits

Local inventory reservations cover only Doorway's ledger and never an external POS. Three-minute holds become pinned once capture may have started; ambiguity cannot safely release them. Publication changes require a fresh quote; owner stock changes cannot invalidate existing holds. Refund does not automatically restock physical goods. Website scraping is not authoritative stock synchronization. Dietary labels require explicit evidence/owner confirmation; no medical safety is inferred.

Authentication uses scrypt, hashed session tokens and same-origin mutations. Rate limits currently reside in one server process; a public multi-instance service needs shared rate limiting, quotas, observability and a privacy/retention policy. There is no general production multi-merchant credential/onboarding service. No automatic distribution to ChatGPT, Google, ACP/UCP/AP2 or WebMCP compatibility is claimed.

Original code is MIT; dependencies keep their licences. AG Studio local evaluation and public production rights differ. See [AI/tools disclosure](docs/AI_DISCLOSURE.md).
