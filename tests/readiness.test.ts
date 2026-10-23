import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseEvidenceCsv,
  validateReadiness,
  type EvidenceArtifact,
  type EvidenceRow,
  type NumericClaim,
  type ReadinessConfig,
} from "../src/lib/readiness";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const committedCases = parseEvidenceCsv(
  readFileSync("bench/cases.csv", "utf8"),
);
/** These are deliberately artificial in-memory validator fixtures, never benchmark evidence. */
function fixture() {
  const files = new Map<string, string>(),
    rows: EvidenceRow[] = [];
  const ref = (name: string, value: unknown) => {
    const path = `bench/evidence/test-only-${name}.json`,
      data = JSON.stringify(value);
    files.set(path, data);
    return { path, sha256: hash(data) };
  };
  const get = (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw new Error("File absent");
    return value;
  };
  for (const item of committedCases) {
    const source = item.required_source || "LOCAL_VALIDATION",
      method =
        item.required_method ||
        (source.startsWith("LIVE_")
          ? "AUTHENTICATED_HTTP"
          : "INJECTED_TRANSPORT");
    const id = `test-only-${item.case_id}`,
      orderId = `ORDER-${item.case_id}`,
      captureId = `CAPTURE-${item.case_id}`,
      checkoutId = `checkout-${item.case_id}`,
      money = { currency_code: "GBP", value: "10.00" };
    let proof: Record<string, unknown> = {
      kind: "local_validation",
      commands: [{ command: "test-only", exit_code: 0 }],
    };
    if (source === "LIVE_AI")
      proof = {
        kind: "anthropic",
        model: "test-model",
        provider_request_id: "msg_test123",
        request: ref(id + "request", {
          provider: "anthropic",
          authenticated: true,
          model: "test-model",
        }),
        response: ref(id + "response", {
          id: "msg_test123",
          model: "test-model",
          content: [{ type: "text", text: "test-only" }],
        }),
      };
    if (source === "LIVE_SANDBOX") {
      const capture = {
        id: captureId,
        status: "COMPLETED",
        amount: money,
        supplementary_data: { related_ids: { order_id: orderId } },
      };
      const order = {
        id: orderId,
        status: "COMPLETED",
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: checkoutId,
            custom_id: checkoutId,
            invoice_id: checkoutId,
            payee: { merchant_id: "TEST-PAYEE" },
            amount: money,
            payments: { captures: [capture] },
          },
        ],
      };
      const transcript = (name: string, path: string, body: unknown) =>
        ref(name, {
          request: {
            method: "GET",
            origin: "https://api-m.sandbox.paypal.com",
            path,
            authenticated: true,
          },
          response: { http_status: 200, body },
        });
      const human = (role: string, extra = {}) =>
        ref(id + role, {
          actor_kind: "HUMAN",
          role,
          order_id: orderId,
          confirmed: true,
          recorded_at: "2026-10-23T12:00:00Z",
          ...extra,
        });
      proof = {
        kind: "paypal_sandbox",
        order_id: orderId,
        capture_id: captureId,
        checkout_id: checkoutId,
        expected_payee_id: "TEST-PAYEE",
        amount_minor: 1000,
        currency: "GBP",
        order_read: transcript(
          id + "order",
          `/v2/checkout/orders/${orderId}`,
          order,
        ),
        capture_read: transcript(
          id + "capture",
          `/v2/payments/captures/${captureId}`,
          capture,
        ),
        human_approval: human("sandbox_buyer"),
      };
      if (item.case_id === "E6-D02")
        Object.assign(proof, {
          webhook_event_id: "WH-TEST",
          replay_mutation_count: 0,
          webhook_verification: ref(id + "webhook", {
            request: {
              method: "POST",
              origin: "https://api-m.sandbox.paypal.com",
              path: "/v1/notifications/verify-webhook-signature",
              authenticated: true,
            },
            response: {
              http_status: 200,
              body: { verification_status: "SUCCESS" },
            },
          }),
        });
      if (item.case_id === "E6-D03")
        proof.recovery = {
          phase: "AFTER_CAPTURE_BEFORE_LOCAL_PERSISTENCE",
          worker_restarted: true,
          capture_count: 1,
          operation_id: "test-operation",
          request_id_before: "same-key",
          request_id_after: "same-key",
          order_id_before: orderId,
          order_id_after: orderId,
        };
      if (item.case_id === "E6-D04")
        Object.assign(proof, {
          refund_id: "REFUND-TEST",
          refund_amount_minor: 300,
          refund_mutation_count: 1,
          owner_confirmation: human("shop_owner", {
            amount_minor: 300,
            currency: "GBP",
          }),
          refund_read: transcript(
            id + "refund",
            "/v2/payments/refunds/REFUND-TEST",
            {
              id: "REFUND-TEST",
              status: "COMPLETED",
              amount: { currency_code: "GBP", value: "3.00" },
              links: [
                {
                  rel: "up",
                  href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`,
                },
              ],
            },
          ),
        });
    }
    if (method === "REAL_POSTGRES")
      proof = {
        kind: "postgresql",
        server_version: "test-only-server",
        independent_clients: 2,
        checks: { rollback: true, concurrent_locking: true },
      };
    if (method === "REAL_HTTP_MCP")
      proof = {
        kind: "mcp_http",
        endpoint: "http://127.0.0.1:3000/api/mcp/test",
        client: { name: "@modelcontextprotocol/sdk", version: "test-version" },
        transport: "STREAMABLE_HTTP",
        tools: [
          "get_store",
          "search_products",
          "check_availability",
          "create_cart",
          "start_checkout",
        ],
        payment_created: false,
      };
    if (method === "HUMAN_BROWSER")
      proof = {
        kind: "human_review",
        host_url: "https://test-only.doorway.demo",
        reviewer_alias: "test-only-person",
        consent: true,
        unfamiliar: true,
        order_id: orderId,
        steps: [
          "owner_review",
          "same_intent_retest",
          "human_approval",
          "verified_payment",
          "receipt",
          "refund",
        ].map((name) => ({ name, status: "PASS" })),
        attestation: ref(id + "human", {
          actor_kind: "HUMAN",
          role: "unfamiliar_reviewer",
          order_id: orderId,
          confirmed: true,
          recorded_at: "2026-10-23T12:00:00Z",
        }),
      };
    if (item.split === "held_out")
      proof.held_out = {
        supplied_by: "HUMAN",
        unseen_at_freeze: true,
        definition: ref(id + "definition", {
          case_id: item.case_id,
          intent: "test-only unseen case",
        }),
        ground_truth: ref(id + "answers", {
          case_id: item.case_id,
          labelled_by: "HUMAN",
          expected: "test-only answer",
        }),
      };
    const artifact: EvidenceArtifact = {
      schema: "doorway.evidence.v1",
      run_id: id,
      experiment: item.experiment,
      case_id: item.case_id,
      split: item.split,
      source,
      method,
      status: "PASS",
      fault_injected: item.required_fault_injected === "true",
      rerun_of: null,
      started_at: "2026-10-23T12:00:00Z",
      completed_at: "2026-10-23T12:01:00Z",
      commit_sha: "a".repeat(40),
      metrics: [],
      proof,
    };
    const path = `bench/evidence/${id}.json`,
      data = JSON.stringify(artifact);
    files.set(path, data);
    rows.push({
      run_id: id,
      experiment: item.experiment,
      case_id: item.case_id,
      split: item.split,
      source,
      method,
      status: "PASS",
      fault_injected: String(artifact.fault_injected),
      rerun_of: "",
      started_at: artifact.started_at,
      commit_sha: artifact.commit_sha,
      evidence: path,
      evidence_sha256: hash(data),
      notes: "IN-MEMORY TEST FIXTURE ONLY",
    });
  }
  const config: ReadinessConfig = {
    version: 1,
    claims: [],
    required_evidence: [],
  };
  const edit = (
    caseId: string,
    action: (artifact: EvidenceArtifact, row: EvidenceRow) => void,
  ) => {
    const row = rows.find((row) => row.case_id === caseId)!;
    const artifact = JSON.parse(get(row.evidence)) as EvidenceArtifact;
    action(artifact, row);
    const data = JSON.stringify(artifact);
    files.set(row.evidence, data);
    row.evidence_sha256 = hash(data);
  };
  return {
    files,
    rows,
    config,
    cases: structuredClone(committedCases),
    readText: get,
    commitExists: (sha: string) => sha === "a".repeat(40),
    edit,
    result() {
      return validateReadiness(this);
    },
  };
}

describe("readiness gate rejects plausible false proof", () => {
  it("accepts a complete structurally bound artificial fixture without claiming authenticity", () => {
    expect(fixture().result().errors).toEqual([]);
  });
  it("keeps mandatory cases when the YAML list is erased and rejects an empty register", () => {
    const f = fixture();
    f.rows = [];
    expect(f.result().errors).toContain("The run register is empty.");
    expect(f.result().errors.some((error) => error.includes("E6-D04"))).toBe(
      true,
    );
    f.cases = [];
    expect(
      f.result().errors.some((error) => error.includes("Mandatory case")),
    ).toBe(true);
  });
  it.each(["FAIL", "NOT_RUN"])(
    "a %s row and artifact cannot satisfy a required case or metric",
    (status) => {
      const f = fixture();
      f.edit("DB-D01", (a, row) => {
        a.status = row.status = status;
      });
      expect(
        f
          .result()
          .errors.some((error) =>
            error.includes("Missing completed required case: DB-D01"),
          ),
      ).toBe(true);
    },
  );
  it("detects artifact byte tampering, commit mismatches, and cross-case reuse", () => {
    const f = fixture();
    const row = f.rows[0];
    f.files.set(row.evidence, f.readText(row.evidence) + " ");
    expect(
      f.result().errors.some((error) => error.includes("SHA256 mismatch")),
    ).toBe(true);
    const g = fixture();
    g.edit("E1-D01", (a) => {
      a.commit_sha = "b".repeat(40);
    });
    expect(
      g.result().errors.some((error) => error.includes("commit_sha mismatch")),
    ).toBe(true);
    const h = fixture();
    h.edit("E1-D01", (a) => {
      a.case_id = "E1-H01";
    });
    expect(
      h.result().errors.some((error) => error.includes("case_id mismatch")),
    ).toBe(true);
    const j = fixture();
    j.edit("E1-D01", (a, row) => {
      a.commit_sha = row.commit_sha = "c".repeat(40);
    });
    expect(
      j
        .result()
        .errors.some((error) => error.includes("commit does not exist")),
    ).toBe(true);
  });
  it("cannot weaken a live requirement or relabel injected output as live", () => {
    const f = fixture();
    f.cases.find((item) => item.case_id === "E6-D01")!.required_source = "";
    expect(
      f
        .result()
        .errors.some((error) => error.includes("expectation was weakened")),
    ).toBe(true);
    const g = fixture();
    g.edit("E6-D01", (a, row) => {
      a.method = row.method = "INJECTED_TRANSPORT";
      a.proof = {
        kind: "local_validation",
        commands: [{ command: "fake", exit_code: 0 }],
      };
    });
    expect(
      g.result().errors.some((error) => error.includes("LIVE source cannot")),
    ).toBe(true);
  });
  it("rejects a live label without provider transcripts and human approval", () => {
    const f = fixture();
    f.edit("E6-D01", (a) => {
      delete a.proof.human_approval;
    });
    expect(
      f
        .result()
        .errors.some((error) => error.includes("proof file/hash missing")),
    ).toBe(true);
    const g = fixture();
    g.edit("E1-D01", (a) => {
      delete a.proof.response;
    });
    expect(
      g
        .result()
        .errors.some((error) => error.includes("proof file/hash missing")),
    ).toBe(true);
  });
  it("checks wrong live payee and exact owner refund amount inside hashed proof files", () => {
    const f = fixture();
    f.edit("E6-D01", (a) => {
      a.proof.expected_payee_id = "WRONG-PAYEE";
    });
    expect(
      f.result().errors.some((error) => error.includes("order/payee/amount")),
    ).toBe(true);
    const g = fixture();
    g.edit("E6-D04", (a) => {
      a.proof.refund_amount_minor = 700;
    });
    expect(
      g
        .result()
        .errors.some((error) => error.includes("refund amount/capture")),
    ).toBe(true);
  });
  it("rejects recovery with a fresh request key or no fault flag", () => {
    const f = fixture();
    f.edit("E6-D03", (a) => {
      (a.proof.recovery as Record<string, unknown>).request_id_after =
        "new-key";
    });
    expect(
      f
        .result()
        .errors.some((error) => error.includes("same-operation recovery")),
    ).toBe(true);
  });
  it("requires consent and unfamiliar-human proof, rather than a localhost UI smoke", () => {
    const f = fixture();
    f.edit("HOST-D01", (a) => {
      a.proof.host_url = "http://127.0.0.1:3000";
    });
    expect(
      f
        .result()
        .errors.some((error) => error.includes("hosted unfamiliar-human")),
    ).toBe(true);
  });
  it("held-out claims require unseen human-supplied definitions and human ground truth", () => {
    const f = fixture();
    f.edit("E5-H01", (a) => {
      delete a.proof.held_out;
    });
    expect(
      f.result().errors.some((error) => error.includes("held-out human")),
    ).toBe(true);
  });
  it("numeric claims must match metric, unit, sample count and actual aggregation", () => {
    const f = fixture();
    f.edit("E5-H01", (a) => {
      a.metrics = [
        {
          name: "latency",
          unit: "ms",
          value: 10,
          sample_size: 2,
          sample_ids: ["s1", "s2"],
        },
      ];
    });
    f.edit("E5-H02", (a) => {
      a.metrics = [
        {
          name: "latency",
          unit: "ms",
          value: 20,
          sample_size: 1,
          sample_ids: ["s3"],
        },
      ];
    });
    const claim: NumericClaim = {
      id: "claim-test",
      metric: "latency",
      unit: "ms",
      value: 40 / 3,
      sample_size: 3,
      aggregation: "sample_weighted_mean",
      run_ids: ["test-only-E5-H01", "test-only-E5-H02"],
    };
    f.config.claims = [claim];
    expect(f.result().errors).toEqual([]);
    claim.value = 999;
    expect(
      f.result().errors.some((error) => error.includes("aggregation mismatch")),
    ).toBe(true);
    claim.value = 40 / 3;
    claim.unit = "seconds";
    expect(
      f.result().errors.some((error) => error.includes("metric/unit mismatch")),
    ).toBe(true);
  });
  it("cannot inflate sample size by counting an original and rerun on the same samples", () => {
    const f = fixture();
    for (const id of ["E5-H01", "E5-H02"])
      f.edit(id, (a) => {
        a.metrics = [
          {
            name: "completion",
            unit: "ratio",
            value: 1,
            sample_size: 1,
            sample_ids: ["same-case"],
          },
        ];
      });
    f.config.claims = [
      {
        id: "double",
        metric: "completion",
        unit: "ratio",
        value: 1,
        sample_size: 2,
        aggregation: "mean",
        run_ids: ["test-only-E5-H01", "test-only-E5-H02"],
      },
    ];
    expect(
      f.result().errors.some((error) => error.includes("double-counts")),
    ).toBe(true);
  });
  it("rejects malformed CSV instead of silently losing required rows", () => {
    expect(() => parseEvidenceCsv('a,b\n"unclosed,cell')).toThrow("Unclosed");
    expect(() => parseEvidenceCsv("a,a\nx,y")).toThrow("headers");
    expect(() => parseEvidenceCsv("a,b\nx,y,z")).toThrow("width");
  });
});
