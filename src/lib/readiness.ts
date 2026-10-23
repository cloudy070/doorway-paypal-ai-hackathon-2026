import { createHash } from "node:crypto";
import { normalizePublicUrl } from "./url-security";
export type EvidenceRow = Record<string, string>;
export type EvidenceMetric = {
  name: string;
  unit: string;
  value: number;
  sample_size: number;
  sample_ids: string[];
};
export type EvidenceArtifact = {
  schema: "doorway.evidence.v1";
  run_id: string;
  experiment: string;
  case_id: string;
  split: string;
  source: string;
  method: string;
  status: string;
  fault_injected: boolean;
  rerun_of: string | null;
  started_at: string;
  completed_at: string;
  commit_sha: string;
  metrics: EvidenceMetric[];
  proof: Record<string, unknown>;
  [key: string]: unknown;
};
export type NumericClaim = {
  id: string;
  metric: string;
  unit: string;
  value: number;
  sample_size: number;
  aggregation: "sum" | "mean" | "sample_weighted_mean";
  run_ids: string[];
};
export type ReadinessConfig = {
  version: number;
  claims: NumericClaim[];
  required_evidence: EvidenceRow[];
};
export type ReadinessInput = {
  config: unknown;
  cases: EvidenceRow[];
  rows: EvidenceRow[];
  readText: (path: string) => string;
  commitExists: (sha: string) => boolean;
};
export const REGISTER_FIELDS = [
  "run_id",
  "experiment",
  "case_id",
  "split",
  "source",
  "method",
  "status",
  "fault_injected",
  "rerun_of",
  "started_at",
  "evidence",
  "evidence_sha256",
  "commit_sha",
  "notes",
];
const mandatory = [
  "E1-D01",
  "E1-D02",
  "E1-H01",
  "E1-H02",
  "E2-D01",
  "E2-H01",
  "E4-D01",
  "DB-D01",
  "E5-H01",
  "E5-H02",
  "E6-D01",
  "E6-D02",
  "E6-D03",
  "E6-D04",
  "HOST-D01",
];
const sources = new Set([
  "LOCAL_VALIDATION",
  "SYNTHETIC",
  "RECORDED",
  "LIVE_AI",
  "LIVE_SANDBOX",
]);
const methods = new Set([
  "REAL_POSTGRES",
  "REAL_HTTP_MCP",
  "INJECTED_TRANSPORT",
  "LOCAL_COMMAND",
  "AUTHENTICATED_HTTP",
  "HUMAN_BROWSER",
  "RECORDED_REPLAY",
]);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" &&
  !!value.trim() &&
  value.length <= 1000 &&
  !/^(NOT_RUN|TBD|TODO|UNKNOWN|PLACEHOLDER)$/i.test(value);
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const time = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function parseEvidenceCsv(
  input: string,
  required: string[] = [],
): EvidenceRow[] {
  const table: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("Malformed CSV quote");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      table.push(row);
      row = [];
      cell = "";
      closed = false;
    } else if (closed && c !== "\r")
      throw new Error("Data after CSV closing quote");
    else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    table.push(row);
  }
  const [header, ...data] = table;
  if (
    !header?.length ||
    new Set(header).size !== header.length ||
    header.some((x) => !x) ||
    required.some((x) => !header.includes(x))
  )
    throw new Error("Missing/duplicate CSV headers");
  return data
    .filter((x) => x.some(Boolean))
    .map((values) => {
      if (values.length !== header.length)
        throw new Error("CSV row width mismatch");
      return Object.fromEntries(header.map((name, i) => [name, values[i]]));
    });
}

export function validateReadiness(input: ReadinessInput): {
  errors: string[];
  acceptedRuns: string[];
} {
  const errors: string[] = [],
    accepted = new Map<string, EvidenceArtifact>();
  const config = input.config as ReadinessConfig;
  if (
    !object(config) ||
    config.version !== 1 ||
    !Array.isArray(config.claims) ||
    !Array.isArray(config.required_evidence)
  )
    return { errors: ["Invalid claims configuration."], acceptedRuns: [] };
  if (!input.rows.length) errors.push("The run register is empty.");
  if (!input.cases.length) errors.push("The case manifest is empty.");
  const cases = new Map<string, EvidenceRow>();
  for (const item of input.cases) {
    if (
      !item.case_id ||
      cases.has(item.case_id) ||
      !["true", "false"].includes(item.required)
    )
      errors.push("Missing/duplicate case or required flag.");
    cases.set(item.case_id, item);
  }
  for (const id of mandatory) {
    const item = cases.get(id);
    if (item?.required !== "true") {
      errors.push(`Mandatory case ${id} missing or disabled.`);
      continue;
    }
    const source = id.startsWith("E1-")
      ? "LIVE_AI"
      : id.startsWith("E2-") || id.startsWith("E6-")
        ? "LIVE_SANDBOX"
        : id === "E4-D01"
          ? ""
          : "LOCAL_VALIDATION";
    const method = id.startsWith("E1-")
      ? "AUTHENTICATED_HTTP"
      : id === "E4-D01"
        ? "REAL_HTTP_MCP"
        : id === "DB-D01"
          ? "REAL_POSTGRES"
          : id === "HOST-D01"
            ? "HUMAN_BROWSER"
            : "";
    if (
      item.required_source !== source ||
      item.required_method !== method ||
      (id === "E6-D03" && item.required_fault_injected !== "true")
    )
      errors.push(
        `Mandatory case ${id} provenance/method expectation was weakened.`,
      );
  }
  const ids = new Set<string>();
  for (const row of input.rows) {
    const name = row.run_id || "unnamed run",
      before = errors.length,
      planned = cases.get(row.case_id);
    if (!text(row.run_id) || ids.has(row.run_id))
      errors.push(`${name}: missing/duplicate run ID.`);
    ids.add(row.run_id);
    if (
      !planned ||
      row.experiment !== planned.experiment ||
      row.split !== planned.split
    )
      errors.push(`${name}: case/experiment/split mismatch.`);
    if (
      !sources.has(row.source) ||
      !methods.has(row.method) ||
      !["PASS", "FAIL", "NOT_RUN"].includes(row.status) ||
      !["true", "false"].includes(row.fault_injected)
    )
      errors.push(`${name}: invalid provenance/method/status/fault flag.`);
    if (
      !time(row.started_at) ||
      !/^[a-f0-9]{40}$/.test(row.commit_sha ?? "") ||
      !sha(row.evidence_sha256)
    )
      errors.push(
        `${name}: commit/timestamp/artifact hash missing or invalid.`,
      );
    else if (!input.commitExists(row.commit_sha))
      errors.push(
        `${name}: frozen implementation commit does not exist in this repository.`,
      );
    if (
      row.rerun_of &&
      (!input.rows.some((other) => other.run_id === row.rerun_of) ||
        row.rerun_of === row.run_id)
    )
      errors.push(`${name}: rerun_of is not another registered attempt.`);
    let artifact: EvidenceArtifact | undefined;
    try {
      const raw = readFile(input.readText, row.evidence);
      if (hash(raw) !== row.evidence_sha256)
        throw new Error("artifact SHA256 mismatch");
      const parsed: unknown = JSON.parse(raw);
      if (!object(parsed) || parsed.schema !== "doorway.evidence.v1")
        throw new Error("structured artifact schema missing");
      artifact = parsed as EvidenceArtifact;
      for (const key of [
        "run_id",
        "experiment",
        "case_id",
        "split",
        "source",
        "method",
        "status",
        "started_at",
        "commit_sha",
      ] as const)
        if (artifact[key] !== row[key])
          throw new Error(`artifact ${key} mismatch`);
      if (
        artifact.fault_injected !== (row.fault_injected === "true") ||
        artifact.rerun_of !== (row.rerun_of || null)
      )
        throw new Error("artifact fault/rerun mismatch");
      if (
        !time(artifact.completed_at) ||
        Date.parse(artifact.completed_at) < Date.parse(row.started_at) ||
        !Array.isArray(artifact.metrics) ||
        !object(artifact.proof)
      )
        throw new Error("completion/metrics/proof invalid");
      const seen = new Set<string>();
      for (const metric of artifact.metrics) {
        const key = metric.name + ":" + metric.unit;
        if (
          !object(metric) ||
          !text(metric.name) ||
          !text(metric.unit) ||
          !Number.isFinite(metric.value) ||
          !Number.isSafeInteger(metric.sample_size) ||
          metric.sample_size < 1 ||
          !Array.isArray(metric.sample_ids) ||
          metric.sample_ids.length !== metric.sample_size ||
          metric.sample_ids.some((id) => !text(id)) ||
          new Set(metric.sample_ids).size !== metric.sample_ids.length ||
          seen.has(key)
        )
          throw new Error("invalid/duplicate metric/sample identities");
        seen.add(key);
      }
      if (row.status === "PASS") checkProof(artifact, input.readText);
    } catch (error) {
      errors.push(
        `${name}: ${error instanceof Error ? error.message : "unreadable artifact"}.`,
      );
    }
    if (artifact && row.status === "PASS" && before === errors.length)
      accepted.set(row.run_id, artifact);
  }
  for (const item of cases.values())
    if (
      item.required === "true" &&
      ![...accepted.values()].some(
        (a) =>
          a.case_id === item.case_id &&
          (!item.required_source || a.source === item.required_source) &&
          (!item.required_method || a.method === item.required_method) &&
          (!item.required_fault_injected ||
            String(a.fault_injected) === item.required_fault_injected),
      )
    )
      errors.push(`Missing completed required case: ${item.case_id}.`);
  for (const required of config.required_evidence)
    if (
      !object(required) ||
      !Object.keys(required).length ||
      ![...accepted.values()].some((a) =>
        Object.entries(required).every(
          ([key, value]) => String(a[key]) === String(value),
        ),
      )
    )
      errors.push("Missing configured evidence: " + JSON.stringify(required));
  const claims = new Set<string>();
  for (const claim of config.claims)
    try {
      if (
        !object(claim) ||
        !text(claim.id) ||
        claims.has(claim.id) ||
        !text(claim.metric) ||
        !text(claim.unit) ||
        !Number.isFinite(claim.value) ||
        !Number.isSafeInteger(claim.sample_size) ||
        claim.sample_size < 1 ||
        !["sum", "mean", "sample_weighted_mean"].includes(claim.aggregation) ||
        !Array.isArray(claim.run_ids) ||
        !claim.run_ids.length ||
        new Set(claim.run_ids).size !== claim.run_ids.length
      )
        throw new Error("numeric claim schema invalid");
      claims.add(claim.id);
      const metrics = claim.run_ids.map((id) => {
        const a = accepted.get(id);
        if (!a) throw new Error(`${id} is not completed bound evidence`);
        const m = a.metrics.find(
          (m) => m.name === claim.metric && m.unit === claim.unit,
        );
        if (!m) throw new Error(`${id} metric/unit mismatch`);
        return m;
      });
      const samples = metrics.flatMap((m) => m.sample_ids),
        count = metrics.reduce((sum, m) => sum + m.sample_size, 0);
      if (new Set(samples).size !== samples.length)
        throw new Error("claim double-counts sample identities");
      const value =
        claim.aggregation === "sum"
          ? metrics.reduce((sum, m) => sum + m.value, 0)
          : claim.aggregation === "mean"
            ? metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length
            : metrics.reduce((sum, m) => sum + m.value * m.sample_size, 0) /
              count;
      if (
        claim.sample_size !== count ||
        Math.abs(claim.value - value) > Math.max(1e-9, Math.abs(value) * 1e-9)
      )
        throw new Error("claim value/sample aggregation mismatch");
    } catch (error) {
      errors.push(
        `${claim?.id ?? "unnamed claim"}: ${error instanceof Error ? error.message : "invalid claim"}.`,
      );
    }
  return { errors, acceptedRuns: [...accepted.keys()] };
}
function readFile(read: ReadinessInput["readText"], path: unknown): string {
  if (
    typeof path !== "string" ||
    !/^bench\/evidence\/[A-Za-z0-9_.\/-]+$/.test(path) ||
    path.split("/").some((x) => x === ".." || !x)
  )
    throw new Error("evidence path must stay inside bench/evidence");
  const raw = read(path);
  if (!raw || Buffer.byteLength(raw) > 2_000_000)
    throw new Error("evidence empty or over size limit");
  return raw;
}
function reference(read: ReadinessInput["readText"], ref: unknown): unknown {
  if (!object(ref) || !sha(ref.sha256))
    throw new Error("proof file/hash missing");
  const raw = readFile(read, ref.path);
  if (hash(raw) !== ref.sha256) throw new Error("proof file hash mismatch");
  return JSON.parse(raw) as unknown;
}
function providerRead(
  read: ReadinessInput["readText"],
  ref: unknown,
  path: string,
): Record<string, unknown> {
  const value = reference(read, ref);
  if (
    !object(value) ||
    !object(value.request) ||
    !object(value.response) ||
    value.request.authenticated !== true ||
    value.request.origin !== "https://api-m.sandbox.paypal.com" ||
    value.request.path !== path ||
    value.request.method !== "GET" ||
    value.response.http_status !== 200 ||
    !object(value.response.body)
  )
    throw new Error("authenticated sandbox read transcript invalid");
  return value.response.body;
}
function money(value: unknown, expected: number, currency: unknown): boolean {
  if (
    !object(value) ||
    value.currency_code !== currency ||
    typeof value.value !== "string" ||
    !/^(0|[1-9]\d*)\.\d{2}$/.test(value.value)
  )
    return false;
  const [whole, fraction] = value.value.split(".");
  return Number(whole) * 100 + Number(fraction) === expected;
}
function human(
  read: ReadinessInput["readText"],
  ref: unknown,
  orderId: unknown,
  role: string,
): Record<string, unknown> {
  const value = reference(read, ref);
  if (
    !object(value) ||
    value.actor_kind !== "HUMAN" ||
    value.role !== role ||
    value.order_id !== orderId ||
    value.confirmed !== true ||
    !time(value.recorded_at)
  )
    throw new Error("human approval/confirmation attestation missing");
  return value;
}
function checkProof(
  a: EvidenceArtifact,
  read: ReadinessInput["readText"],
): void {
  const p = a.proof;
  if (p.transcript) reference(read, p.transcript);
  if (a.split === "held_out") {
    const held = p.held_out;
    if (
      !object(held) ||
      held.supplied_by !== "HUMAN" ||
      held.unseen_at_freeze !== true
    )
      throw new Error("held-out human case/ground-truth proof missing");
    const definition = reference(read, held.definition),
      answers = reference(read, held.ground_truth);
    if (
      !object(definition) ||
      definition.case_id !== a.case_id ||
      !object(answers) ||
      answers.case_id !== a.case_id ||
      answers.labelled_by !== "HUMAN"
    )
      throw new Error("held-out case/ground-truth identity mismatch");
  }
  if (
    a.source.startsWith("LIVE_") &&
    !["AUTHENTICATED_HTTP", "HUMAN_BROWSER"].includes(a.method)
  )
    throw new Error("LIVE source cannot use injected/local/replay method");
  if (a.source === "LIVE_SANDBOX") {
    if (
      p.kind !== "paypal_sandbox" ||
      !text(p.order_id) ||
      !text(p.capture_id) ||
      !text(p.checkout_id) ||
      !text(p.expected_payee_id) ||
      !Number.isSafeInteger(p.amount_minor) ||
      (p.amount_minor as number) <= 0 ||
      !["GBP", "USD", "EUR"].includes(String(p.currency))
    )
      throw new Error("sandbox provider identities missing");
    const amount = p.amount_minor as number,
      order = providerRead(
        read,
        p.order_read,
        `/v2/checkout/orders/${p.order_id}`,
      ),
      capture = providerRead(
        read,
        p.capture_read,
        `/v2/payments/captures/${p.capture_id}`,
      ),
      units = order.purchase_units;
    if (
      order.id !== p.order_id ||
      order.status !== "COMPLETED" ||
      order.intent !== "CAPTURE" ||
      !Array.isArray(units) ||
      units.length !== 1 ||
      !object(units[0])
    )
      throw new Error("sandbox completed order missing");
    const unit = units[0],
      payee = unit.payee,
      payments = unit.payments;
    if (
      unit.reference_id !== p.checkout_id ||
      unit.custom_id !== p.checkout_id ||
      unit.invoice_id !== p.checkout_id ||
      !object(payee) ||
      payee.merchant_id !== p.expected_payee_id ||
      !money(unit.amount, amount, p.currency) ||
      !object(payments) ||
      !Array.isArray(payments.captures) ||
      payments.captures.length !== 1 ||
      !object(payments.captures[0]) ||
      payments.captures[0].id !== p.capture_id ||
      payments.captures[0].status !== "COMPLETED" ||
      !money(payments.captures[0].amount, amount, p.currency)
    )
      throw new Error("sandbox order/payee/amount/capture mismatch");
    const supplementary = capture.supplementary_data;
    if (
      capture.id !== p.capture_id ||
      capture.status !== "COMPLETED" ||
      !money(capture.amount, amount, p.currency) ||
      !object(supplementary) ||
      !object(supplementary.related_ids) ||
      supplementary.related_ids.order_id !== p.order_id
    )
      throw new Error("sandbox capture/order mismatch");
    human(read, p.human_approval, p.order_id, "sandbox_buyer");
    if (a.case_id === "E6-D02") {
      const v = reference(read, p.webhook_verification);
      if (
        !text(p.webhook_event_id) ||
        !object(v) ||
        !object(v.request) ||
        !object(v.response) ||
        v.request.authenticated !== true ||
        v.request.origin !== "https://api-m.sandbox.paypal.com" ||
        v.request.path !== "/v1/notifications/verify-webhook-signature" ||
        v.request.method !== "POST" ||
        v.response.http_status !== 200 ||
        !object(v.response.body) ||
        v.response.body.verification_status !== "SUCCESS" ||
        p.replay_mutation_count !== 0
      )
        throw new Error("real webhook verification/replay proof missing");
    }
    if (a.case_id === "E6-D03") {
      const r = p.recovery;
      if (
        !a.fault_injected ||
        !object(r) ||
        r.phase !== "AFTER_CAPTURE_BEFORE_LOCAL_PERSISTENCE" ||
        r.worker_restarted !== true ||
        r.capture_count !== 1 ||
        !text(r.operation_id) ||
        !text(r.request_id_before) ||
        r.request_id_before !== r.request_id_after ||
        r.order_id_before !== p.order_id ||
        r.order_id_after !== p.order_id
      )
        throw new Error("same-operation recovery proof missing");
    }
    if (a.case_id === "E6-D04") {
      if (
        !text(p.refund_id) ||
        !Number.isSafeInteger(p.refund_amount_minor) ||
        (p.refund_amount_minor as number) <= 0 ||
        (p.refund_amount_minor as number) > amount
      )
        throw new Error("exact refund proof missing");
      const refund = providerRead(
          read,
          p.refund_read,
          `/v2/payments/refunds/${p.refund_id}`,
        ),
        owner = human(read, p.owner_confirmation, p.order_id, "shop_owner");
      if (
        refund.id !== p.refund_id ||
        refund.status !== "COMPLETED" ||
        !money(refund.amount, p.refund_amount_minor as number, p.currency) ||
        owner.amount_minor !== p.refund_amount_minor ||
        owner.currency !== p.currency ||
        !Array.isArray(refund.links) ||
        !refund.links.some(
          (link) =>
            object(link) &&
            link.rel === "up" &&
            link.href ===
              `https://api-m.sandbox.paypal.com/v2/payments/captures/${p.capture_id}`,
        ) ||
        p.refund_mutation_count !== 1
      )
        throw new Error("owner refund amount/capture/retry mismatch");
    }
    return;
  }
  if (a.source === "LIVE_AI") {
    if (
      p.kind !== "anthropic" ||
      !text(p.model) ||
      !/^msg_[A-Za-z0-9]+$/.test(String(p.provider_request_id))
    )
      throw new Error("live AI provider identity missing");
    const request = reference(read, p.request),
      response = reference(read, p.response);
    if (
      !object(request) ||
      request.provider !== "anthropic" ||
      request.authenticated !== true ||
      request.model !== p.model ||
      !object(response) ||
      response.id !== p.provider_request_id ||
      response.model !== p.model ||
      !Array.isArray(response.content) ||
      !response.content.length
    )
      throw new Error("live AI request/response binding missing");
    return;
  }
  if (a.method === "REAL_POSTGRES") {
    if (
      p.kind !== "postgresql" ||
      !text(p.server_version) ||
      typeof p.independent_clients !== "number" ||
      p.independent_clients < 2 ||
      !object(p.checks) ||
      p.checks.rollback !== true ||
      p.checks.concurrent_locking !== true
    )
      throw new Error("real PostgreSQL proof missing");
  } else if (a.method === "REAL_HTTP_MCP") {
    if (
      p.kind !== "mcp_http" ||
      !text(p.endpoint) ||
      !/^https?:\/\//.test(p.endpoint) ||
      !object(p.client) ||
      !text(p.client.name) ||
      !text(p.client.version) ||
      p.transport !== "STREAMABLE_HTTP" ||
      !Array.isArray(p.tools) ||
      ![
        "get_store",
        "search_products",
        "check_availability",
        "create_cart",
        "start_checkout",
      ].every((name) => (p.tools as unknown[]).includes(name)) ||
      p.payment_created !== false
    )
      throw new Error("real HTTP MCP client proof missing");
  } else if (a.method === "HUMAN_BROWSER") {
    let host: URL | undefined;
    try {
      if (typeof p.host_url === "string") host = normalizePublicUrl(p.host_url);
    } catch {
      /* Invalid hosted metadata fails below. No network is performed. */
    }
    if (
      p.kind !== "human_review" ||
      p.consent !== true ||
      p.unfamiliar !== true ||
      !text(p.reviewer_alias) ||
      !host ||
      host.protocol !== "https:" ||
      !Array.isArray(p.steps) ||
      ![
        "owner_review",
        "same_intent_retest",
        "human_approval",
        "verified_payment",
        "receipt",
        "refund",
      ].every((name) =>
        (p.steps as unknown[]).some(
          (step) =>
            object(step) && step.name === name && step.status === "PASS",
        ),
      )
    )
      throw new Error("hosted unfamiliar-human proof missing");
    human(read, p.attestation, p.order_id, "unfamiliar_reviewer");
  } else if (["INJECTED_TRANSPORT", "LOCAL_COMMAND"].includes(a.method)) {
    if (
      p.kind !== "local_validation" ||
      !Array.isArray(p.commands) ||
      !p.commands.length ||
      p.commands.some(
        (c) => !object(c) || !text(c.command) || c.exit_code !== 0,
      )
    )
      throw new Error("local command proof missing");
  } else if (a.method === "RECORDED_REPLAY") {
    if (
      a.source !== "RECORDED" ||
      p.kind !== "recorded_replay" ||
      !text(p.original_run_id)
    )
      throw new Error("recorded replay provenance missing");
    reference(read, p.original_artifact);
  } else throw new Error("unsupported evidence proof combination");
}
