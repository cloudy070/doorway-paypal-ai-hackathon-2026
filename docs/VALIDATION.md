# Verified development checks — 23 October2026

**Local implementation validated; full hackathon readiness remains NOT_READY.** There has been no actual Anthropic call, human-approved PayPal purchase, delivered provider webhook, live crash recovery, hosted unfamiliar-user test or finished video. The user confirmed provider access is unavailable. No missing result is replaced by a synthetic success.

## Frozen implementation and evidence

- Original protocol commit: `2936865` (before formal local recordings).
- Frozen implementation: `3eddf117ba1a73e74bcee5f5fe367f2239d75a5f`.
- Evidence commit: `c26de8b` contains the two formal local runs below. Subsequent documentation/environment-template edits do not change their tested application code.
- Runtime: Node22.18.0, pnpm9.15.9, PostgreSQL18.4. Resolved library versions are in pnpm-lock.yaml and the run artifacts.

|Check|Observed result|Boundary|
|---|---|---|
|TypeScript|`pnpm typecheck` exited0|Static type checking, not provider acceptance|
|Regression suite|149tests /11files passed in the frozen clean checkout|Real SQL and HTTP where stated; external AI/PayPal gateways are injected in deterministic tests|
|Clean install|`pnpm install --frozen-lockfile` exited0 in a separate local Git clone without node_modules/.next/.data/.env|Used the machine's package cache; no claim of a fresh operating-system install|
|Clean production build|`pnpm build` exited0 from that clean clone|Next16.4.3 production routes, including MCP/shopper/Studio, compiled successfully|
|Production startup|Next start on127.0.0.1:3001 became ready; HTTP checks passed at22:10:48UTC|Fresh generated local secrets, isolated test PostgreSQL database, no provider credentials copied|
|Persistence/auth/public shop|New synthetic seed survived the seed process exit; separate production process authenticated owner and read shop; public catalog omitted owner proof|Fictional fixture, not a real merchant or unfamiliar human|
|Quote/errors|Production server calculated a Saturday quote; missing PayPal and shopper AI returned503; no payment records were created|Explicit unavailable behavior, not a successful payment/AI call|
|Diff/privacy|`git diff --check` passed; staged files were checked against configured private values; live .env/.data excluded|Original source is MIT; vendor licences and external publication rights remain separate|

Formal local records, created only after the frozen commit:

- [DB-20261023220647997](../bench/evidence/DB-20261023220647997.json): REAL_POSTGRES, two independent client pools, twelve concurrent locked increments preserved, rollback restored prior value. Source LOCAL_VALIDATION; no external provider claim.
- [E4-20261023220648795](../bench/evidence/E4-20261023220648795.json): official MCP SDK1.32.2 Client over real Streamable HTTP to the running app; initialize/list, store/search, availability and persisted cart succeeded. The catalog was SYNTHETIC. It did not call start_checkout, approve, capture or invoke a model.

Register rows bind exact artifact SHA-256 and commit. `pnpm claims:check` accepts these two local artifacts but exits1 because thirteen mandatory cases and corresponding live/hosted evidence remain missing. No numerical performance, revenue, accuracy, conversion or merchant-demand claims are enabled. The structural gate cannot independently establish provider authenticity or human consent from metadata; manual acceptance is still required.

## Browser observations

The UI agent exercised desktop and390px views of landing, merchant catalog/review, Test My Store, ordinary storefront and orders. Document width matched viewport containment. It created a local synthetic owner/shop, edited a draft, explicitly confirmed rules, approved, verified the controlled fixture and published catalogv3. Private preflight visibly returned LOCAL_VALIDATION with AI-unavailable disclosure. The storefront returned the actual server quote; missing PayPal displayed503 without pseudo-success.

Later browser checks exercised the buyer-agent503 message, allowed-day409 guidance, explicit Saturday selection followed by a fresh quote, owner alternative-selection controls and the disabled recipient-connection action while configuration is missing. Keyboard tab navigation and mobile menu state were checked. No payment was created. Existing screenshots were visually inspected and saved as user deliverables outside this source repo: Doorway_UI.jpg, Doorway_Mobile.jpg and activity views. A later Chrome screenshot attempt timed out; it did not overwrite the verified images.

These are developer-led browser checks. They do not satisfy the required unfamiliar-user or hosted acceptance test. AG Studio rendered its actual observed-record widgets locally with evaluation warnings; no licence validity or live-model claim follows.

## Development failures retained in this account

The first npm install failed in npm's dependency-tree handling; pnpm with a frozen lockfile succeeded. Initial Windows pg_ctl startup inherited output pipes and hung despite the server starting; explicit ignored stdio/timeouts corrected it. An initial seed used top-level await under CommonJS; ESM package configuration corrected it. API tests initially failed from missing test slug records/status expectation, then passed after correction and actual authorization/state fixes. A later continuation found stopped PostgreSQL and a cached rejected initialization promise; restarting the confirmed-stopped local DB and resetting failed initialization restored health. These are development iterations, not hidden successful benchmark attempts.

## Public source and remaining release gate

After that snapshot, an isolated CLI recovery harness was added without changing the existing payment adapter/service. A new regression launches an actual child process against durable embedded SQL, injects only provider HTTP, terminates with exit86 after capture response and opens the saved database in a fresh process. Recovery reused the same operation/order/key and observed one capture, one receipt and committed stock. A transient provider-read outage persists UNKNOWN; read-only resume with the original marker succeeds without another capture. Guards reject absent keys/isolation, primary-database reuse, invalid/non-Ed25519 signing keys before capture, and absent or mismatched human-attestation data. All four added tests passed; the full local suite passed153tests in12files, TypeScript and production build passed. This is LOCAL_VALIDATION, not an actual PayPal or human-approval result. The CLI never generates a real attestation or appends a benchmark PASS row.

The final harness review also found and fixed retry after PAID/receipt/SUCCEEDED persistence but before the final verification read/result write. Its regression reopens the SQL in a fresh process, verifies the same finalized state without downgrade or another capture, and preserves original result bytes on ALREADY_RECORDED. An independent read-only source review found no remaining actionable issue in the harness; this is bounded developer review, not a provider or security certification.

The prepared Docker/Render deployment configuration passed the current official Render JSON Schema locally (schema SHA-256 `8a3fb8da6b4f55fe686fbefa790e011d3dd7895f013f355953c572a21ab6494a`). The official Node base-image digest was resolved from registry metadata. The Linux Docker daemon was unavailable, so the image was not built or run and no cloud resource was created. Structural validation does not establish hosted acceptance. [DEPLOYMENT.md](DEPLOYMENT.md) records the exact instructions, shared web/worker/database configuration, licence/budget gates and missing operational checks.

Full source was published to the public [GitHub repository](https://github.com/cloudy070/doorway-paypal-ai-hackathon-2026) at commit `766053734add8bfa16f5be3c8c392dcd9029f996`. GitHub reports public visibility and detects MIT. A separate anonymous HTTPS clone imported the bundled original history, reproduced all source text, installed the frozen dependencies, passed149tests and built production successfully. The GitHub connector was used because local Git transport has no configured credential. `source-history.bundle` preserves original protocol/implementation/evidence commits; import it as described in README before checking historical commit bindings in an API-published clone.

GitHub Actions [run40032444676](https://github.com/cloudy070/doorway-paypal-ai-hackathon-2026/actions/runs/40032444676), using Linux and Node24, independently passed the developer job: frozen install, typecheck,149tests and production build. Its separate readiness job failed on the thirteen missing mandatory cases. The overall workflow is therefore red. Logs confirmed the failure was missing live/hosted acceptance, rather than missing historical commit objects or invalid local evidence hashes.

[COMPLETION_AUDIT.md](COMPLETION_AUDIT.md) lists external live-service, human, licence, reviewer-access and submission requirements. Public source availability closes the repository requirement; it does not establish these remaining results. Full objective completion is not asserted.
