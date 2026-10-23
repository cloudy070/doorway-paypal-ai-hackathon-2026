# Doorway execution plan — 23 October2026

## Decision

Build the team's Doorway, with Test My Store as the visible entry point: observed obstacle → owner-confirmed repair → same-intent retest → real human-approved sandbox purchase → verified receipt → recovery. Keep full import/review/domain/catalog/tools/payments/dashboard/refund scope. Checkout Rescue contributes recovery mechanisms inside this product.

Initial audience: an independent pickup retailer with a simple public site, explicit catalog and an owner able to confirm stock/policies. First demonstration uses a clearly fictional Saturday bakery; it is not a merchant pilot. Value hypothesis: reduce the work needed to prepare reliable agent-readable data and explain why a shopping request fails. Validate onboarding effort, useful corrections and willingness to pay with a consenting merchant before claiming impact.

PayPal already provides agent discovery/cart/checkout/human approval; Shopify also serves external storefronts. Doorway's proposed distinction is the reproducible readiness/repair/outcome chain with evidence and recovery, not invention of MCP or autonomous payments. Distribution and demand remain hypotheses. Sources and requirement mapping: REQUIREMENTS.csv, RESEARCH.md and original Doorway_Context snapshots.

## Team suggestions

|Idea|Decision and estimated incremental effort|Proof and dependencies|Risk / deferral|
|---|---|---|---|
|W1 price/stock sync|P0 version/requote checks,4–8h; authoritative POS adapter later12–30h|Change catalog after quote: old checkout refused; merchant confirms source|Scrape cannot prevent outside sales; no synchronization claim before adapter|
|W2 Test My Store|P0 private read-only preflight/repair/retest,8–16h|Same recorded intent+versions before/after, actual AI with key|No draft payment or automatic publication; block broad expansion before Gate2|
|W3 analytics|P0 observed counts/rejections,4–8h; forecasts P2|Event provenance, paid totals only after verified read|No synthetic demand/lost-revenue inference; defer predictive claims until evidence|
|W4 three-minute hold|Bounded local-ledger implementation,8–14h incl recovery|Concurrent last-unit test, TTL and capture ambiguity tests|No external POS protection; never release pinned UNKNOWN to create false availability|
|W5 alternatives|P1 owner-permitted suggestions,4–8h|Only in-stock approved compatible labels; new buyer quote/approval|No inferred dietary safety or silent substitution; defer broad replanning UI if needed|
|W6 bulk rules|P0 server-side minimum rules/discount,3–6h|Integer minor-unit quote matches configured rule|No agent price setting; free-form negotiation P2|

Estimates are engineering ranges, not confirmed team hours. Reliability is necessary once a feature exists; do not ship an unsafe abbreviated hold or payment path.

## Architecture and contracts

Next.js/React TypeScript UI and Node API; PostgreSQL JSONB record store with indexes, advisory/row transaction locks and immutable catalog versions. Official MCP server; bounded Anthropic extractor/read-only preflight; sandbox-only PayPal REST gateway; Ed25519 Doorway observation receipt; AG Studio dashboard evaluation. Dependency versions are frozen in pnpm-lock.yaml. See ARCHITECTURE.md for boundaries/states.

Owner: authenticate → import → inspect provenance/unknowns → correct → approve → prove domain control → publish → private retest → inspect orders/reconcile → confirm exact refund. Buyer: ordinary store or connected agent → quote → genuine approval page → capture → authenticated read/receipt. Judge: hosted server-key-backed instance, prepared isolated shop, sandbox buyer and repeatable steps with clear source labels. Domain proof never substitutes for merchant identity or PayPal ownership.

## Backlog and acceptance

|Work|Dependencies|Range|Acceptance|
|---|---|---|---|
|Persistent vertical slice and owner authorization|New local project|12–20h|Two tenants isolated; versions/approval/domain gate enforced; restart preserves state|
|Real source extraction + owner review|Public consented merchant source, AI key|8–16h|Grounded fields, explicit unknown/conflict; no invented stock; corrections audited|
|MCP + ordinary baseline|Approved published shop|6–12h|Real official client over HTTP; server-priced cart; same buyer tasks both paths|
|PayPal + receipts + recovery|Sandbox app/merchant/buyer|16–28h|Human approval, authenticated complete capture binding, durable operations, uncertain recovery, exact refund|
|Test/repair/retest + merchant dashboard|First slice, AI|10–18h|Same intent before/after, observed evidence, mobile UX, real Studio widget data|
|Evaluation + unfamiliar-user test|Hosted live slice|10–18h|Committed protocol, held-out cases, honest failures, no mock proof substituted|
|Submission and reviewer operations|Verified behavior and rights|8–14h|English package, public OSS repo, <3min YouTube, access maintained|

Overall range70–126 focused developer hours plus external waits and25% integration/contingency reserve. This is a planning estimate; no claim that the unknown team has that capacity. Local implementation already reduces remaining work but does not erase external acceptance. Critical path: keys+merchant/source → verified live purchase → hosted repair/retest and recovery → unfamiliar human → evidence → video/package. Assign one accountable integrator.

Solo+AI: sequential ownership, one reliable store/client, daily integration, no extra protocols before gates. Two people: merchant/AI/MCP and payments/recovery/evidence, with shared daily contracts; reserve explicit design/video time. Three+: split owner onboarding, shopper commerce, payments, dashboard/design, evidence/submission; roles may overlap and names/hours are assigned only after actual availability is known.

## Dates and fallback decisions (London)

-23–28Oct: real extraction, real MCP and human-approved sandbox capture/read by28Oct. If access absent, continue local work and escalate the concrete dependency; do not call Gate1 passed.
-29Oct–4Nov: host the slice, ground-truth source, repair/retest, receipt/trust and recovery before Gate2. Begin consented merchant feedback.
-5Nov12:00: hosted end-to-end and unfamiliar-user pass, separate recovery. E3 remains optional. If capacity fails, cut forecasts, extra protocols/clients and free-form negotiation; preserve required path or honestly mark incomplete.
-6–7Nov: locked evaluations and critical fixes; update claims only from completed runs.
-8Nov12:00: feature freeze. Any necessary fix triggers affected retests.
-9–10Nov: record actual behavior, package English submission, practice judging.
-11Nov20:00 internal readiness.12Nov20:00 official cutoff. Keep judging access until15Dec16:00. Reverify current sources before submission.

## Budget and risk

Proposed caps, **not vendor price quotations or spending authority**: AI development/evaluation25–50USD; hosted API+DB+worker50–100USD through15Dec; domain0–20USD if needed; browser0–20USD if paid cloud tools chosen. Commercial Studio licence/trial terms and sponsor credits are unknown; do not assume zero production cost or claimed credits. Confirm current prices/quotas before provisioning. Start with one merchant,3pages/import,6agent turns,16tools, bounded requests. Enforce provider billing alerts and a reviewer budget that covers the whole judging interval. Price to merchants is unvalidated: measure setup/support cost and test a capped service subscription; no ARR or revenue forecast.

Primary risks: unavailable keys/buyer/source (owner action; prepare adapters); 45-day trial expiring before15Dec (obtain explicit coverage or lawful alternative before deployment); source uncertainty (owner gate); external stock (no guarantee); payment ambiguity (same-operation reconcile, pinned hold); overclaiming novelty (competitor comparison); team capacity (ranges/gates); model cost/injection (bounded grounded tools); hosted abuse (shared limits and isolated reviewer data); reviewer friction (unfamiliar-human test).

Five equal judging criteria map to actual integration/recovery, coherent owner/buyer UX, a specific merchant hypothesis and evidence, defensible repair-to-outcome differentiation, and a clear working2:50 video. Nine PayPal APIs and12-second approval are not requirements. E3 ablation is optional; receipt/trust and minimum house rules precede Gate2. The earlier personal113-hour calendar is not this team's schedule.
