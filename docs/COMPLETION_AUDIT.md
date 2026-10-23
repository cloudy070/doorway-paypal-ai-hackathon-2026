# Completion audit — 23 October 2026

**NOT COMPLETE / NOT READY TO SUBMIT.** Doorway has a public implementation, verified clean-clone builds, deterministic integration tests and two formal local evidence artifacts. The user has confirmed that external provider keys are unavailable. No live AI extraction, human-approved PayPal sandbox purchase, real delivered webhook, hosted unfamiliar-user session, finished video or submitted Devpost entry is established.

This audit describes evidence actually available, not a promise that configured adapters have already worked against providers. The source of scope is the supplied Doorway_Master_Prompt_RU.txt (23 October 2026, private working context, not included in a public clone); [REQUIREMENTS.csv](REQUIREMENTS.csv) covers 77 requirements, decisions and constraints. Its classes distinguish OFFICIAL_MUST, SPONSOR_SPECIFIC, TEAM_PROPOSAL, HYPOTHESIS and USER_MUST. USER_MUST is separate because several stronger acceptance requirements come from the user rather than the contest.

## What exists and what it proves

|Area|Current artifact/evidence|Boundary and remaining acceptance|
|---|---|---|
|Local product|Owner authentication/workspace; import/review/approval/domain gate; private preflight; public storefront; quote/checkout/order/receipt; dashboard; refund UI|Source and local checks establish implemented paths. See final [validation record](VALIDATION.md) for exact commands, browser observations, screenshots, commit and counts. A source file is not live acceptance.|
|Storage|PostgreSQL JSONB records, unique indexes, advisory/row locks; embedded PostgreSQL development fallback; formal real PostgreSQL two-pool concurrency/rollback artifact|Recorded local SQL acceptance passed; clean-clone production persistence/auth/quote checks also passed. This is not deployed database acceptance.|
|Catalog and rules|Immutable versions; provenance, unknown/conflict fields and review; explicit unresolved-rule gate; version-bound quotes; server discount|Injected extraction and API tests cover rejection/authority boundaries. Human field correctness and live extraction quality remain unmeasured.|
|AI|Anthropic extractor, exact source-quote checks, bounded read-only private preflight, Studio analyst adapter|No key means unavailable or explicitly LOCAL_VALIDATION. No provider response, billed-token measurement or measured extraction accuracy has been recorded.|
|MCP|Official SDK server, bundled bounded shopper adapter and formal real Streamable HTTP client artifact; search, availability, persisted cart, checkout handoff|Recorded SDK1.32.2 HTTP smoke passed and stops before payment. No actual shopping-model call or universal compatibility is established.|
|Payment truth/recovery|Sandbox-only REST adapter; separate durable create/capture/refund keys and request hashes; six-hour retry cutoff; authenticated order/capture binding; periodic worker|SQL plus injected HTTP tests cover concurrency, ambiguous outcomes, crash boundaries and mismatches. Actual approval, capture/read, webhook and recovery evidence is absent.|
|Inventory|Atomic local reservations; three-minute expiry; pin before capture; uncertainty stays held; single commit; separate on-hand ledger|Only Doorway's source is controlled. External POS, another checkout channel and physical stock remain outside the guarantee. No automatic refund restock.|
|Refunds and receipts|Owner proposal/confirmation; one exact full or partial refund per checkout; authenticated refund observation; monotonic states; Ed25519 Doorway receipt|No live refund yet. Receipt authenticates Doorway's observation, not PayPal's signature, delivery or dietary safety. Additional partial-refund sequences are outside the pilot.|
|Security|Owner/tenant controls, hashed sessions, origin/capability checks, strict schemas, DNS/redirect/SSRF defence, bounded model/tools, sanitized errors|Local regressions are developer evidence. Separate held-out human cases, hosted quotas, retention/privacy operations and deployed acceptance remain open.|
|AG Studio|Installed actual dashboard component, observed-record data, theme/layout and Studio Agent Framework browser analyst/server adapter|Use the integration agent's final validation; do not infer licence validity, AI entitlement, sponsor acceptance or live model execution from installed code.|
|Submission|Public MIT source repository; environment template; seed; README; plan/architecture; requirements; English description/reviewer/video/disclosure drafts|Public clone and Linux developer CI passed. Hosted demo, video and submission are absent. Dependency/data/media rights and human eligibility still require confirmation.|

The application/recovery snapshot at public commit57a3985 passed153tests, TypeScript and production build both locally and in GitHub Actions. The later E2 manifest consistency amendment passed14targeted readiness tests and TypeScript. These are developer checks, not benchmark statistics. Use [VALIDATION.md](VALIDATION.md) for exact versions, commits, additional changes and counts. Passing tests never substitute for the missing live runs.

## Recorded local evidence and missing acceptance

[bench/register.csv](../bench/register.csv) contains two completed LOCAL_VALIDATION runs: DB-20261023220647997 (real PostgreSQL two-pool concurrency/rollback) and E4-20261023220648795 (actual official MCP client over HTTP, synthetic catalog, no payment/model). Their artifacts bind exact hashes to frozen commit3eddf11. Protocol commit2936865 predates these recordings. Earlier development tests are not retrospectively preregistered. [claims.yaml](../claims.yaml) contains no numerical public claims and declares NOT_READY; fifteen mandatory cases remain missing.

A pre-E2 audit corrected the manifest to preserve the protocol's intended two development and two held-out tasks: E2-D02/H02 are now explicit mandatory NOT_RUN cases. The gate rejects deleting or disabling them. No E2 attempt, human-held-out definition, ground truth or success was generated. There are seventeen mandatory cases total; the two existing local records remain bound to their original revision. Both normal-store and agent purchase evidence is required for each of the four matched E2 tasks.

Run `pnpm claims:check`. It is expected to fail on absent required evidence. A green developer test suite and a red readiness gate are consistent. Do not add fictional PASS rows, relabel a fixture LIVE_SANDBOX, or count reaching approval as a completed purchase.

Evidence that must still be recorded includes:

- LIVE_AI source extraction with consented, frozen human ground truth; accuracy/coverage before owner review and corrections after it.
- Matched ordinary-store and connected-agent tasks, with the same model/task constraints and completed capture as the common endpoint.
- Human-approved LIVE_SANDBOX order/capture/read, a signed observation receipt, and an exact owner-confirmed refund.
- A real signed delivered webhook, rejected forgery/replay, and current-state re-read; independent worker recovery.
- A separately labeled fault-injected sandbox recovery after capture but before local persistence. An opt-in isolated CLI is prepared in scripts/live-recovery.ts with an actual child-process crash/restart test; its live execution remains blocked. Current injected tests are not footage of a provider crash.
- Hosted acceptance by an unfamiliar consenting human, responsive browser checks and preserved reviewer access.

E3 ablation stays optional. No benchmark, revenue, conversion, speed-up, universal compatibility or merchant-demand number is justified yet.

## External completion ledger

|Required result|Current status|Closure evidence|
|---|---|---|
|Server-side Anthropic access/model and budget|Not supplied|Actual bounded source/preflight/analyst runs; model/version/usage and failures recorded|
|Sandbox application, payee, separate buyer and human approval|Not supplied|Genuine sandbox IDs, authenticated complete capture/read, human action and receipt; redact credentials and buyer data|
|Public HTTPS webhook and retained worker/database|Not provisioned|Real delivery/verification and no-webhook recovery artifacts|
|Consenting merchant/source and unfamiliar human|Not supplied or conducted|Source rights/ground truth plus independent task notes and explicit consent|
|AG Studio lawful demo and judging coverage|Unverified|Applicable licence/trial and AI entitlement, covering the actual use through judging; no assumption that a 45-day trial starting 23 October suffices|
|Hosted judging service and retained provider/DB budget|Not provisioned|Working URL, isolated reviewer account, server-side keys, worker, health check and budget through 15 December|
|Eligibility and team representative|Human facts unknown|Each entrant reviews current official eligibility/conflict rules; team authorizes an eligible representative|
|Public open-source repository|VERIFIED PUBLIC|[Public source](https://github.com/cloudy070/doorway-paypal-ai-hackathon-2026), detected MIT, secret scan, anonymous clone/install/tests/build and Linux developer CI; see VALIDATION.md|
|Video and final submission|Not recorded/uploaded/submitted|Actual functioning footage under three minutes, public YouTube link, final English form and submission acknowledgement|

These are recorded dependencies, not repeated permission questions or claims that local progress must stop.

## Scope and source corrections

The official rules permit either complete runnable setup instructions or a hosted functional demo. The user's master prompt additionally requires hosted end-to-end and unfamiliar-user acceptance; this stronger project requirement remains open. The schedule currently shows submission close at **12 November 2026, 20:00 London**, judging end at **15 December 2026, 16:00 London**. Recheck the [official rules](https://paypalaihackathon.devpost.com/rules) and [schedule](https://paypalaihackathon.devpost.com/details/dates) before submission.

Nine PayPal capabilities and approval in twelve seconds are earlier team tactics, not official requirements. Minimum house rules and receipt/trust precede the second project gate. No copied 113-hour personal calendar is treated as team capacity. W1–W6 are evaluated individually in the matrix and [English plan](PLAN_EN.md): local freshness/holds and observed counts are implemented boundaries; universal synchronization, predictive earnings and free-form negotiation are not claimed.

The root agent reports a fresh authorized chat read at about 22:43 London on 23 October: no newer substantive visible plan beyond W1–W6; the later WhatsApp item was a membership update; an unsupported message remained unreadable. The targeted Discord group showed no newer visible plan. No messages were sent. This does not establish exhaustive chat access, read voice/deleted/unsupported content, or byte identity between same-named WhatsApp/Discord PDFs. Private chat contents and contact details are not publication assets.

The dated judge-key discussion snapshot says judges should not need their own Anthropic keys. Its [forum URL](https://paypalaihackathon.devpost.com/forum_topics/45465-api-key-for-judges) could not be refreshed by this agent's web tool; distinguish the supplied snapshot from a newly verified page. Current official rules, schedule, resources and AG sponsor pages were readable.

## Final release decision

Keep NOT_READY until every applicable requirement has an actual artifact, run ID, human result or public URL. Resolve the matrix's external and unverified rows, rerun affected checks after fixes, verify rights/eligibility/access, and replace draft-only submission metadata. The current local implementation is useful development progress; the user's full completion criteria are not yet met.
