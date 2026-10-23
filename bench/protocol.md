# Doorway evidence protocol — 2026-10-23

This file must be committed before benchmark runs. Earlier development tests and SDK smoke checks are development evidence, not preregistered benchmarks. Record failures and every rerun. Do not tune on held-out cases.

## Success and provenance

A purchase succeeds only after human sandbox approval AND an authenticated provider read verifies completed capture, exact expected amount/currency/payee, order and capture linkage. Approval-link creation is a separate intermediate outcome. A local injected transport proves application behavior, never PayPal behavior.

Each register row has run_id,experiment,case_id,split,source,method,status,fault_injected,rerun_of,started_at,evidence,notes. Source is LIVE_SANDBOX, LIVE_AI, SYNTHETIC, RECORDED or LOCAL_VALIDATION. Method distinguishes REAL_HTTP_MCP, REAL_POSTGRES, INJECTED_TRANSPORT and HUMAN_BROWSER. Never relabel a synthetic catalog as a merchant pilot. Keep raw files private and redact buyer/secret data from curated evidence.

The register additionally binds commit_sha and evidence_sha256. Artifacts use schema doorway.evidence.v1 and repeat run_id, experiment, case_id, split, source, method, status, fault_injected (boolean), rerun_of (null or a registered run), started_at, completed_at and commit_sha. The gate checks exact CSV/artifact identity, actual JSON-byte SHA256, an existing Git commit, bounded evidence paths, and typed proof. Optional runtime/observations/stderr metadata may preserve the actual local command result. Do not record credentials in transcripts.

Numeric claims declare metric, unit, value, sample_size, aggregation (sum, mean or sample_weighted_mean) and run_ids. Each cited artifact must contain matching metrics with explicit sample_ids. Value and total sample size must equal the declared aggregation; duplicate samples across original/rerun evidence cannot inflate the sample. No numerical public claims currently exist.

LIVE_AI requires hashed request/response artifacts, a matching provider request ID/model and authenticated-request metadata. LIVE_SANDBOX requires hashed authenticated order/capture read transcripts with the expected checkout/order/capture, amount/currency/payee and a human approval attestation. E6-D02 adds real signature-verification/replay proof; E6-D03 adds the same-operation/key crash boundary; E6-D04 adds the exact human owner-confirmed refund/read and safe retry. These structural checks reject obvious relabeling; metadata and hashes do not independently establish remote authenticity, consent or truth. A human must inspect original provider evidence and rights before publishing claims.

cases.csv marks mandatory cases and their source/method/fault expectations. Deleting claims.yaml required_evidence entries does not remove these obligations. Existing FAIL/NOT_RUN attempts remain in the append-only register but never satisfy a case or numeric claim. E3 remains optional and is not promoted by this gate.

Held-out artifacts additionally reference hashed human-supplied case definitions and human-labelled ground truth, binding the case ID and attesting that the case was unseen at implementation freeze. The gate checks these structures; a separate human must still verify that the split and annotation process were honest. Re-running a known developer fixture with a held_out label does not qualify.

## Cases and metrics

- E1 extraction: two development pages and two consented, disjoint held-out pages. Freeze source snapshots, answer fields and model before execution. Score exact price/currency/stock/policy facts; missing or conflict must remain unknown. Report precision/coverage before owner review and corrected field count after review separately. No case is ready until merchant consent/source rights and answers are recorded. Budget maximum six extraction calls, no held-out retry without a labeled failure/rerun.
- E2 normal checkout vs connected-agent flow: same source catalog, model version, exact buyer intent, pickup constraints, initial available stock and completed-capture success point; counterbalance order. Two development tasks (E2-D01/D02), two held-out tasks (E2-H01/H02). Each case requires both paths; their separate approved orders/captures must be retained and bound to the same frozen task. Restore an equal initial inventory in isolated test data before each path, outside the timed task, and disclose that preparation. Report completion separately from time/tool count. Report human approval time separately. No speed/improvement claim before both paths actually run. Baseline uses the published ordinary storefront, not a deliberately broken page.
- E3 ablation OPTIONAL: provenance/preflight/repair toggles only if E1/E2/E5/E6 and hosted acceptance pass. No implied requirement or invented results.
- E4 interoperability: official MCP SDK Client over real Streamable HTTP. Record client+SDK versions, tool schemas, results and errors. Other clients require their own recorded runs; do not extrapolate universal compatibility. Local fixture may be SYNTHETIC while transport is real.
- E5 security: dev fixtures cover local/private/mixed DNS, redirect, injection, ungrounded evidence, wrong owner, unpublished catalog, malformed dietary, caller price override. Reserve held-out case IDs E5-H01/H02 until a separate human supplies unseen payloads. Unit regressions do not become held-out evaluation retrospectively.
- E6 payment reliability: happy checkout; double start/capture; lost create/capture/refund response; pending; decline; wrong amount/currency/payee/order/capture; expired hold; refund confirmation/replay; webhook forged/replay/out-of-order; crash after provider capture before local persistence; altered receipt. Local injected tests precede bounded LIVE_SANDBOX runs. Fault injection is explicit, opt-in, restricted to an isolated test environment, and never used to invent provider outcomes.
- Acceptance: clean checkout build, persistent PostgreSQL transaction rollback/concurrent access, responsive390px, unfamiliar consenting human hosted walkthrough, webhook delivery and reconciliation worker, reviewer access through2026-12-15T16:00:00Z.

## Readiness gate

`pnpm claims:check` must fail on an empty register, NOT_RUN/FAIL rows used as proof, missing evidence, unsupported numeric claims and missing mandatory live/hosted runs. Passing developer tests is separate from readiness. claims.yaml currently contains no numeric public claims. Live runs must be enabled by actual keys and human actions, not fabricated rows.

## Run handling

Pre-E2 consistency amendment,23 October2026: E2-D02/H02 were missing from the original manifest even though this protocol specified two tasks in each split. They are explicitly planned NOT_RUN cases, with no results or human definitions supplied. Commit their manifest/gate revision before any E2 execution and freeze actual human-held-out definitions independently. The two earlier E4/DB local records keep their original protocol/implementation hashes; this amendment does not retrospectively change them.

Freeze commit, cases and installed versions before each run. Add one append-only row per attempt, including failure. Save bounded redacted output to bench/evidence. A changed implementation gets a new run and rerun_of. Summaries state sample count, data source, limitations and costs; no statistical generalization from a demonstration. Secrets remain in ignored .env.local/.data. Do not publish someone else's messages or identities.
