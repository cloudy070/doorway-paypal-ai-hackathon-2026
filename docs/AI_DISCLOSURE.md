# AI and tools disclosure — draft for contributor review

This document records current implementation and development assistance. It does not assert that missing runtime services were executed. Final contributors must verify authorship, exact tool/model metadata, licences and submission-field wording before publishing.

## Development assistance

OpenAI Codex assisted with reading supplied project material, researching public documentation, architecture, implementation, test design, security review and these documentation drafts. Work was divided among collaborating coding agents with separate file ownership and integrated checks.

The exact development model/version selected in the application has not been independently captured in this artifact; do not invent a model identifier. Add it from actual session metadata if the submission asks. Human contributors remain responsible for the submission, rights, eligibility, product decisions and claims. No AI agent supplied human PayPal approval, merchant consent, an unfamiliar-user test or team representation.

Tools actually used during development include local TypeScript/Node tooling, SQL storage, browser inspection/automation, public web/documentation research, the official MCP SDK and deterministic test gateways/HTTP transport injection. Reading authorized project chat updates did not authorize publication of private messages or sending team messages. No external team message, hosting purchase, video upload or Devpost submission has been performed. The connected GitHub account is used to publish the audited source snapshot; current repository verification is recorded in VALIDATION.md.

## Runtime model behavior

|Runtime use|Implemented provider/configuration|Data and limits|Authority|Observed execution status|
|---|---|---|---|---|
|Catalog extraction|Anthropic SDK; ANTHROPIC_API_KEY; model from ANTHROPIC_MODEL, code default `claude-sonnet-4-6`|Bounded public source pages/text; structured tool output; exact cited quotations; explicit known/unknown/conflict|May propose an unapproved draft only; cannot publish, pay, choose prices or invent stock|No live provider key/run supplied; injected-gateway tests only|
|Private Test My Store|Same server-side model adapter when configured; deterministic LOCAL_VALIDATION fallback when absent|Owner's draft/version and saved intent; bounded turns and read-only catalog/rule tools|May report findings; cannot publish, reserve inventory or start/capture/refund a payment|Local validation exists; LIVE_AI acceptance not recorded|
|Studio evidence analyst|AG Studio Agent Framework plus owner-authorized Anthropic server adapter|Observed private run/order rows; limited conversation/body/turn/output/tool scope|May query/filter/arrange the browser report; no store, payment, refund, external-network or publishing tools|Framework/adapter implemented; live model and applicable AG entitlement not established|
|Buyer shopping agent|Bundled Anthropic shopper invokes the official MCP Client over HTTP; server ANTHROPIC_API_KEY and explicit prepare-checkout consent|One published shop, bounded turns/tools/context; capability URLs redacted before model/logs|Search, availability, cart and human approval handoff only; never capture/refund/publish|Real MCP transport exercised with an injected model boundary; actual Anthropic reasoning and purchase remain unverified|

Record the actual runtime model ID returned/configured, installed versions, source snapshots, prompts, token usage, failures and cost in each future live evidence run. A configured default is not evidence that the model is available on an account or was called.

## Grounding, privacy and authority

Website descriptions, metadata, agent intent and tool-result strings are untrusted data. Source quotations are checked for occurrence, but that does not prove real-world correctness; owner review is still required. Missing stock, conflicting price or unconfirmed policies must remain unresolved. Dietary attributes require exact confirmed labels, with no medical inference.

Provider secrets stay on the server in ignored environment configuration. Do not include API keys, session cookies, checkout capability URLs, raw buyer details or private chat contact information in the repository, public video or evidence. A hosted review needs configured server access so judges are not expected to bring their own paid-model keys.

AI output never establishes payment truth. Only authenticated provider reads can establish the expected completed sandbox capture. Human buyer approval and exact owner refund confirmation are separate required actions. A Doorway receipt signs an observation; it is neither PayPal's signature nor proof of delivery.

## Synthetic and injected material

The Saturday bakery seed and its products are fictional SYNTHETIC fixtures. Seeded approval/domain proof is a controlled setup convenience, not a consenting merchant pilot. Deterministic tests replace only external boundaries to exercise failure cases. They are not recordings of PayPal or Anthropic responses.

Provenance labels separate SYNTHETIC, LOCAL_VALIDATION, LIVE_AI, LIVE_SANDBOX and RECORDED. `fault_injected` is a separate flag. A stored sandbox-order record in a dashboard is not, by itself, a registered LIVE_SANDBOX benchmark. No synthetic customer demand, revenue, conversion lift, successful run or testimonial was created to fill evidence gaps.

## Software, media and sponsor rights

Doorway's original code is covered by [LICENSE](../LICENSE). Dependencies retain their own licences. The AG Studio component and its Agent Framework are actually integrated in source; package installation and evaluation warnings do not establish public-demo rights, AI entitlement, sponsor-prize acceptance or validity through judging. The browser component reads NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY; follow the vendor's approved licence mechanism and do not commit private licence material.

The PayPal REST adapter targets sandbox only. Doorway has no implemented PayPal Agent Ready/Store Sync onboarding, ACP/UCP/AP2 mandate implementation, automatic ChatGPT/Google distribution, PayPal Toolkit dependency, or WebMCP compatibility claim. Current support is limited to the MCP tools/clients actually verified.

The supplied team plans and project chat snapshots informed requirements. They are not generated-code assets, permissions to republish private correspondence, or proof that every suggestion was adopted. No generated image, music, narrated voice, recorded working video, customer review or unfamiliar-human result is claimed. If later added, disclose its tool/source and obtain necessary rights.

See [COMPLETION_AUDIT.md](COMPLETION_AUDIT.md), [REQUIREMENTS.csv](REQUIREMENTS.csv) and [bench/protocol.md](../bench/protocol.md) for the unresolved evidence and release conditions.
