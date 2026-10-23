import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import type { Store } from "./db";
import type { Checkout, PaymentOperation } from "./domain-commerce";
import type { InventoryReservation } from "./inventory";
import type { PayPalGateway } from "./paypal";
import { PaymentService } from "./payments";
import { getReceiptSigner, verifyReceipt, ReceiptSigner } from "./receipts";

export class RecoveryHarnessError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus = 409,
  ) {
    super(code);
    this.name = "RecoveryHarnessError";
  }
}
export type RecoveryMarker = {
  schema: "doorway.recovery-marker.v1";
  source: "LIVE_SANDBOX" | "LOCAL_VALIDATION";
  phase: "AFTER_CAPTURE_BEFORE_LOCAL_PERSISTENCE";
  run_id: string;
  recorded_at: string;
  checkout_sha256: string;
  order_sha256: string;
  operation_sha256: string;
  request_key_sha256: string;
  capture_response_sha256: string;
};
export type ApprovalAttestation = {
  actor_kind: "HUMAN";
  role: "sandbox_buyer";
  order_id: string;
  confirmed: true;
  recorded_at: string;
};
export const recoveryHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function fail(code: string, httpStatus = 409): never {
  throw new RecoveryHarnessError(code, httpStatus);
}

/** The CLI never uses the primary application DB or an embedded fallback. */
export function isolatedRecoveryConfig(
  env: Record<string, string | undefined>,
) {
  if (env.ISOLATED_SANDBOX !== "1") fail("ISOLATED_SANDBOX_REQUIRED", 403);
  if (!env.TEST_DATABASE_URL) fail("TEST_DATABASE_URL_REQUIRED", 503);
  const identity = (value: string) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return fail("INVALID_TEST_DATABASE_URL", 400);
    }
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1)
    )
      fail("POSTGRES_TEST_DATABASE_REQUIRED", 400);
    // pg connection strings may override authority through query parameters.
    // Only transport-security/application labels are accepted by this harness.
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          !["sslmode", "channel_binding", "application_name"].includes(key),
      )
    )
      fail("DATABASE_CONNECTION_OVERRIDE_FORBIDDEN", 403);
    let name: string;
    try {
      name = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return fail("INVALID_TEST_DATABASE_URL", 400);
    }
    const hostname = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      url.hostname.toLowerCase(),
    )
      ? "loopback"
      : url.hostname.toLowerCase();
    return { key: `${hostname}:${url.port || "5432"}/${name}`, name };
  };
  const test = identity(env.TEST_DATABASE_URL);
  if (!/(test|sandbox|recovery)/i.test(test.name))
    fail("EXPLICIT_TEST_DATABASE_NAME_REQUIRED", 403);
  if (env.DATABASE_URL) {
    const primary = identity(env.DATABASE_URL);
    // A distinct name is deliberately required even on another hostname: DNS
    // aliases must not turn this opt-in fault harness into a primary-DB writer.
    if (primary.key === test.key || primary.name === test.name)
      fail("PRIMARY_DATABASE_FORBIDDEN", 403);
  }
  if (
    !env.PAYPAL_CLIENT_ID?.trim() ||
    !env.PAYPAL_CLIENT_SECRET?.trim() ||
    !env.PAYPAL_MERCHANT_ID?.trim()
  )
    fail("PAYPAL_SANDBOX_NOT_CONFIGURED", 503);
  if (!env.RECEIPT_PRIVATE_KEY?.trim())
    fail("STABLE_RECEIPT_KEY_REQUIRED", 503);
  let signer: ReceiptSigner;
  try {
    signer = new ReceiptSigner(env.RECEIPT_PRIVATE_KEY.replace(/\\n/g, "\n"));
  } catch {
    return fail("VALID_ED25519_RECEIPT_KEY_REQUIRED", 503);
  }
  return {
    databaseUrl: env.TEST_DATABASE_URL,
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    merchantId: env.PAYPAL_MERCHANT_ID,
    signer,
  };
}

export function assertHumanApproval(
  value: unknown,
  orderId: string,
): asserts value is ApprovalAttestation {
  if (!value || typeof value !== "object")
    fail("EXISTING_HUMAN_APPROVAL_ATTESTATION_REQUIRED", 403);
  const a = value as Record<string, unknown>;
  if (
    a.actor_kind !== "HUMAN" ||
    a.role !== "sandbox_buyer" ||
    a.order_id !== orderId ||
    a.confirmed !== true ||
    typeof a.recorded_at !== "string" ||
    !Number.isFinite(Date.parse(a.recorded_at)) ||
    Date.parse(a.recorded_at) > Date.now() + 60000
  )
    fail("HUMAN_APPROVAL_ATTESTATION_MISMATCH", 403);
}
export function writeRecoveryMarker(
  file: string,
  marker: RecoveryMarker,
): void {
  const fd = openSync(file, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(marker, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

type CrashOptions = {
  checkoutId: string;
  merchantId: string;
  runId: string;
  source: RecoveryMarker["source"];
  approval: unknown;
  signer: ReceiptSigner;
  writeMarker: (marker: RecoveryMarker) => void;
  terminate: (code: number) => never;
};

/** Intentionally terminates only the isolated child, after a successful gateway response. */
export async function captureAndCrash(
  store: Store,
  gateway: PayPalGateway,
  options: CrashOptions,
): Promise<never> {
  const existing = await store.get<Checkout>("checkouts", options.checkoutId);
  if (
    !existing?.orderId ||
    existing.expectedPayeeId !== options.merchantId ||
    existing.captureId ||
    existing.receipt ||
    !["AWAITING_APPROVAL", "APPROVED"].includes(existing.status)
  )
    fail("EXISTING_UNCAPTURED_CHECKOUT_REQUIRED");
  assertHumanApproval(options.approval, existing.orderId);
  if (await store.get<PaymentOperation>("operations", `${existing.id}:capture`))
    fail("PRIOR_CAPTURE_OPERATION_REQUIRES_RECONCILIATION");
  const observed = await gateway.readOrder(existing.orderId);
  if (
    observed.id !== existing.orderId ||
    observed.status !== "APPROVED" ||
    observed.purchase_units?.some(
      (unit) => (unit.payments?.captures?.length ?? 0) !== 0,
    )
  )
    fail("AUTHENTICATED_APPROVED_UNCAPTURED_ORDER_REQUIRED");
  let calls = 0;
  const guarded = readOnlyGateway(gateway);
  guarded.captureOrder = async (orderId, requestId) => {
    if (++calls !== 1 || orderId !== existing.orderId)
      fail("ONLY_ORIGINAL_CAPTURE_ALLOWED");
    const op = await store.get<PaymentOperation>(
      "operations",
      `${existing.id}:capture`,
    );
    const reservation = await store.get<InventoryReservation>(
      "reservations",
      `reservation:${existing.id}`,
    );
    if (
      !op ||
      op.status !== "RUNNING" ||
      op.idempotencyKey !== requestId ||
      !reservation?.captureStartedAt ||
      reservation.status !== "HELD"
    )
      fail("DURABLE_CAPTURE_OPERATION_AND_PIN_REQUIRED");
    const response = await gateway.captureOrder(orderId, requestId);
    // SandboxPayPal returns only after an authenticated successful HTTP response.
    if (response.id !== existing.orderId)
      fail("CAPTURE_RESPONSE_ORDER_MISMATCH");
    options.writeMarker({
      schema: "doorway.recovery-marker.v1",
      source: options.source,
      phase: "AFTER_CAPTURE_BEFORE_LOCAL_PERSISTENCE",
      run_id: options.runId,
      recorded_at: new Date().toISOString(),
      checkout_sha256: recoveryHash(existing.id),
      order_sha256: recoveryHash(orderId),
      operation_sha256: recoveryHash(op.id),
      request_key_sha256: recoveryHash(requestId),
      capture_response_sha256: recoveryHash(JSON.stringify(response)),
    });
    options.terminate(86);
  };
  const result = await new PaymentService(store, guarded, {
    receiptSigner: options.signer,
  }).capture(existing.shopId, existing.id);
  fail(`CAPTURE_DID_NOT_REACH_CRASH_BOUNDARY:${result.status}`);
}

/** A fresh service may only read the existing order; no create/capture/refund is allowed. */
export async function recoverAfterCaptureCrash(
  store: Store,
  gateway: PayPalGateway,
  checkoutId: string,
  marker: RecoveryMarker,
  signer: ReceiptSigner = getReceiptSigner(),
) {
  const before = await store.get<Checkout>("checkouts", checkoutId),
    operation = await store.get<PaymentOperation>(
      "operations",
      `${checkoutId}:capture`,
    );
  const finalized =
    before?.status === "PAID" &&
    !!before.captureId &&
    !!before.receipt &&
    operation?.status === "SUCCEEDED" &&
    operation.providerId === before.captureId;
  const unresolved =
    !!before &&
    ["CAPTURING", "UNKNOWN", "PENDING"].includes(before.status) &&
    !before.receipt &&
    !!operation &&
    ["RUNNING", "UNKNOWN"].includes(operation.status);
  if (
    marker.schema !== "doorway.recovery-marker.v1" ||
    marker.phase !== "AFTER_CAPTURE_BEFORE_LOCAL_PERSISTENCE" ||
    !before?.orderId ||
    !operation ||
    (!unresolved && !finalized) ||
    marker.checkout_sha256 !== recoveryHash(checkoutId) ||
    marker.order_sha256 !== recoveryHash(before.orderId) ||
    marker.operation_sha256 !== recoveryHash(operation.id) ||
    marker.request_key_sha256 !== recoveryHash(operation.idempotencyKey)
  )
    fail("CRASH_BOUNDARY_OR_ORIGINAL_OPERATION_NOT_PRESERVED");
  // Verification/report-write retries may follow durable PAID. Never downgrade it.
  if (!finalized)
    await store.transaction(async (tx) => {
      const current = await tx.get<Checkout>("checkouts", checkoutId);
      if (
        !current ||
        !["CAPTURING", "UNKNOWN", "PENDING"].includes(current.status) ||
        current.orderId !== before.orderId
      )
        fail("ISOLATED_CHECKOUT_CHANGED");
      await tx.set("checkouts", checkoutId, {
        ...current,
        status: "UNKNOWN",
        reason: "ISOLATED_CRASH_AFTER_CAPTURE_BEFORE_LOCAL_PERSISTENCE",
        updatedAt: new Date().toISOString(),
      });
    });
  const safe = readOnlyGateway(gateway),
    recovered = await new PaymentService(store, safe, {
      receiptSigner: signer,
    }).reconcile(checkoutId);
  const order = await safe.readOrder(before.orderId),
    captures =
      order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []) ??
      [];
  const after = await store.get<PaymentOperation>("operations", operation.id),
    receipts = await store.list<{
      id: string;
      payload?: { checkoutId?: string };
    }>("receipts");
  if (
    recovered.status !== "PAID" ||
    recovered.orderId !== before.orderId ||
    captures.length !== 1 ||
    captures[0].id !== recovered.captureId ||
    !recovered.stockCommitted ||
    !recovered.receipt ||
    !verifyReceipt(recovered.receipt, signer.publicKey) ||
    receipts.filter((receipt) => receipt.payload?.checkoutId === checkoutId)
      .length !== 1 ||
    after?.status !== "SUCCEEDED" ||
    after.idempotencyKey !== operation.idempotencyKey
  )
    fail("RECOVERY_NOT_VERIFIED_NO_NEW_PAYMENT_ALLOWED");
  return {
    schema: "doorway.recovery-result.v1",
    source: marker.source,
    status: "RECOVERED",
    resumed_finalized_state: finalized,
    fault_injected: true,
    phase: marker.phase,
    run_id: marker.run_id,
    observed_at: new Date().toISOString(),
    checkout_sha256: recoveryHash(checkoutId),
    order_sha256: recoveryHash(before.orderId),
    operation_sha256: recoveryHash(operation.id),
    request_key_sha256: recoveryHash(operation.idempotencyKey),
    capture_sha256: recoveryHash(recovered.captureId!),
    capture_count: captures.length,
    receipt_count: 1,
    receipt_verified: true,
    stock_committed: true,
    new_payment_created: false,
    manual_provider_evidence_review_required: true,
  };
}

/** Called only after fresh authenticated verification; existing evidence is retained. */
export function recordRecoveryResult(
  file: string,
  result: Awaited<ReturnType<typeof recoverAfterCaptureCrash>>,
) {
  try {
    writeFileSync(file, JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return fail("EXISTING_RECOVERY_RESULT_MISMATCH");
  }
  for (const key of [
    "schema",
    "source",
    "phase",
    "run_id",
    "checkout_sha256",
    "order_sha256",
    "operation_sha256",
    "request_key_sha256",
    "capture_sha256",
    "capture_count",
    "receipt_count",
    "receipt_verified",
    "stock_committed",
    "new_payment_created",
  ] as const) {
    if (existing[key] !== result[key])
      fail("EXISTING_RECOVERY_RESULT_MISMATCH");
  }
  if (existing.status !== "RECOVERED")
    fail("EXISTING_RECOVERY_RESULT_MISMATCH");
  return {
    ...result,
    status: "ALREADY_RECORDED",
    original_result_retained: true,
  };
}

function readOnlyGateway(gateway: PayPalGateway): PayPalGateway {
  return {
    createOrder: async () => fail("HARNESS_CANNOT_CREATE_ORDER"),
    captureOrder: async () => fail("RECOVERY_CANNOT_CAPTURE"),
    refundCapture: async () => fail("HARNESS_CANNOT_REFUND"),
    readOrder: (id) => gateway.readOrder(id),
    readCapture: (id) => gateway.readCapture(id),
    readRefund: (id) => gateway.readRefund(id),
    verifyWebhook: (headers, event) => gateway.verifyWebhook(headers, event),
  };
}
