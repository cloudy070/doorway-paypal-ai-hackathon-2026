import { createHash, randomUUID } from "node:crypto";
import type { Store } from "./db";
import type { Shop } from "./domain";
import { validateCheckoutQuote } from "./commerce";
import {
  CommerceError,
  type Checkout,
  type PaymentOperation,
  type Quote,
  type RefundApproval,
  type StoredWebhook,
} from "./domain-commerce";
import {
  PayPalError,
  paypalToMinor,
  sandboxApprovalUrl,
  type PayPalCapture,
  type PayPalGateway,
  type PayPalOrder,
  type PayPalRefund,
  type WebhookEvent,
} from "./paypal";
import {
  canonicalJson,
  getReceiptSigner,
  RECEIPT_STATEMENT,
  type ReceiptSigner,
} from "./receipts";
import {
  commitInventory,
  pinInventoryForCapture,
  releaseExpiredInventory,
  reserveInventory,
} from "./inventory";
export type {
  Checkout,
  PaymentOperation,
  RefundApproval,
} from "./domain-commerce";

// PayPal's default v2 retention is six hours. Never issue a mutation after this
// conservative window when its outcome could already have happened.
const MUTATION_WINDOW_MS = 6 * 60 * 60 * 1000;
const LEASE_MS = 60000;
type Options = { clock?: () => Date; receiptSigner?: ReceiptSigner };

export class PaymentService {
  private readonly clock: () => Date;
  constructor(
    private readonly store: Store,
    private readonly gateway: PayPalGateway,
    private readonly options: Options = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }
  private now(): string {
    return this.clock().toISOString();
  }
  private async checkout(
    shopId: string,
    id: string,
    store = this.store,
  ): Promise<Checkout> {
    const result = await store.get<Checkout>("checkouts", id);
    if (!result || result.shopId !== shopId)
      throw new CommerceError("CHECKOUT_NOT_FOUND", 404);
    return result;
  }

  async startCheckout(shopId: string, quoteId: string): Promise<Checkout> {
    const id = `checkout:${quoteId}`;
    const checkout = await this.store.transaction(async (tx) => {
      const existing = await tx.get<Checkout>("checkouts", id);
      if (existing) {
        if (existing.shopId !== shopId)
          throw new CommerceError("CHECKOUT_NOT_FOUND", 404);
        return existing;
      }
      const quote = await tx.get<Quote>("quotes", quoteId);
      if (!quote || quote.shopId !== shopId)
        throw new CommerceError("QUOTE_NOT_FOUND", 404);
      const shop = await validateCheckoutQuote(tx, quote, this.clock());
      const now = this.now();
      const result: Checkout = {
        id,
        shopId,
        quoteId,
        quote: structuredClone(quote),
        status: "CREATING",
        expectedPayeeId: shop.paypalMerchantId,
        refundedMinor: 0,
        createdAt: now,
        updatedAt: now,
      };
      await tx.set("checkouts", id, result);
      await reserveInventory(tx, result, this.clock());
      await tx.set("quotes", quoteId, { ...quote, status: "CHECKOUT" });
      await this.ensureOperation(tx, result, "create", {
        quote: result.quote,
        payee: result.expectedPayeeId,
      });
      return result;
    });
    if (
      checkout.orderId ||
      ["PAID", "REFUNDED", "MISMATCH", "CANCELLED"].includes(checkout.status)
    )
      return checkout;
    return this.createExisting(checkout);
  }

  private async ensureOperation(
    tx: Store,
    checkout: Checkout,
    kind: PaymentOperation["kind"],
    request: unknown,
    extra: Partial<PaymentOperation> = {},
  ): Promise<PaymentOperation> {
    const id = `${checkout.id}:${kind}`;
    const hash = digest(request);
    const existing = await tx.get<PaymentOperation>("operations", id);
    if (existing) {
      if (existing.requestHash !== hash)
        throw new CommerceError("IDEMPOTENCY_PAYLOAD_MISMATCH");
      return existing;
    }
    const now = this.now();
    const result: PaymentOperation = {
      id,
      shopId: checkout.shopId,
      checkoutId: checkout.id,
      kind,
      idempotencyKey: randomUUID(),
      requestHash: hash,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
      ...extra,
    };
    await tx.set("operations", id, result);
    return result;
  }

  private async claim(
    checkoutId: string,
    kind: PaymentOperation["kind"],
  ): Promise<PaymentOperation | null> {
    return this.store.transaction(async (tx) => {
      const checkout = await tx.get<Checkout>("checkouts", checkoutId);
      const op = await tx.get<PaymentOperation>(
        "operations",
        `${checkoutId}:${kind}`,
      );
      if (
        !checkout ||
        !op ||
        op.status === "SUCCEEDED" ||
        op.status === "FAILED"
      )
        return null;
      if (
        (kind === "create" && checkout.orderId) ||
        (kind === "capture" &&
          [
            "PAID",
            "REFUNDED",
            "PARTIALLY_REFUNDED",
            "REVERSED",
            "CANCELLED",
            "MISMATCH",
          ].includes(checkout.status))
      )
        return null;
      if (
        op.status === "RUNNING" &&
        Date.parse(op.leaseUntil ?? "") > this.clock().getTime()
      )
        return null;
      if (
        this.clock().getTime() - Date.parse(op.createdAt) >=
        MUTATION_WINDOW_MS
      ) {
        await tx.set("operations", op.id, {
          ...op,
          status: "UNKNOWN",
          updatedAt: this.now(),
          error: "IDEMPOTENCY_WINDOW_EXPIRED_MANUAL_RECONCILIATION_REQUIRED",
        });
        await tx.set("checkouts", checkout.id, {
          ...checkout,
          status: "UNKNOWN",
          reason: "IDEMPOTENCY_WINDOW_EXPIRED_MANUAL_RECONCILIATION_REQUIRED",
          updatedAt: this.now(),
        });
        return null;
      }
      if (
        kind === "capture" &&
        !(await pinInventoryForCapture(tx, checkout, this.clock()))
      ) {
        await tx.set("operations", op.id, {
          ...op,
          status: "FAILED",
          updatedAt: this.now(),
          error: "LOCAL_HOLD_EXPIRED_REQUOTE_REQUIRED",
        });
        await tx.set("checkouts", checkout.id, {
          ...checkout,
          status: "CANCELLED",
          updatedAt: this.now(),
          reason: "LOCAL_HOLD_EXPIRED_REQUOTE_REQUIRED",
        });
        return null;
      }
      const running: PaymentOperation = {
        ...op,
        status: "RUNNING",
        updatedAt: this.now(),
        leaseUntil: new Date(this.clock().getTime() + LEASE_MS).toISOString(),
      };
      await tx.set("operations", op.id, running);
      await tx.set("checkouts", checkout.id, {
        ...checkout,
        status:
          kind === "capture"
            ? "CAPTURING"
            : kind === "create"
              ? "CREATING"
              : checkout.status,
        updatedAt: this.now(),
      });
      return running;
    });
  }

  private async fail(
    checkout: Checkout,
    op: PaymentOperation,
    error: unknown,
  ): Promise<Checkout> {
    return this.store.transaction(async (tx) => {
      const current = await this.checkout(checkout.shopId, checkout.id, tx);
      const stored = await tx.get<PaymentOperation>("operations", op.id);
      if (stored?.status === "SUCCEEDED") return current;
      const ambiguous = !(error instanceof PayPalError) || error.ambiguous;
      const code =
        error instanceof PayPalError
          ? error.code
          : "PAYMENT_OUTCOME_UNCONFIRMED";
      await tx.set("operations", op.id, {
        ...op,
        status: ambiguous ? "UNKNOWN" : "FAILED",
        updatedAt: this.now(),
        error: code,
      });
      const result: Checkout = {
        ...current,
        status: ambiguous
          ? "UNKNOWN"
          : op.kind === "refund"
            ? current.status
            : "DECLINED",
        reason:
          op.kind === "refund"
            ? `REFUND_${ambiguous ? "UNKNOWN" : "REJECTED"}:${code}`
            : code,
        updatedAt: this.now(),
      };
      await tx.set("checkouts", result.id, result);
      return result;
    });
  }

  private async createExisting(checkout: Checkout): Promise<Checkout> {
    const op = await this.claim(checkout.id, "create");
    if (!op) return this.checkout(checkout.shopId, checkout.id);
    try {
      const order = await this.gateway.createOrder(
        {
          paymentId: checkout.id,
          merchantId: checkout.expectedPayeeId,
          amountMinor: checkout.quote.totalMinor,
          currency: checkout.quote.currency,
          subtotalMinor: checkout.quote.subtotalMinor,
          discountMinor: checkout.quote.discountMinor,
          lines: checkout.quote.lines,
        },
        op.idempotencyKey,
      );
      if (!validProviderId(order.id))
        throw new PayPalError("PAYPAL_ORDER_ID_MISSING", true);
      const approvalUrl = sandboxApprovalUrl(order);
      return await this.store.transaction(async (tx) => {
        const current = await this.checkout(checkout.shopId, checkout.id, tx);
        if (current.orderId && current.orderId !== order.id)
          throw new CommerceError("ORDER_ID_CHANGED");
        const result: Checkout = {
          ...current,
          orderId: order.id,
          ...(approvalUrl ? { approvalUrl } : {}),
          status: "AWAITING_APPROVAL",
          updatedAt: this.now(),
        };
        // Persist order ID before any capture can possibly be attempted.
        await tx.set("checkouts", current.id, result);
        await tx.set("operations", op.id, {
          ...op,
          status: "SUCCEEDED",
          providerId: order.id,
          updatedAt: this.now(),
        });
        return result;
      });
    } catch (error) {
      return this.fail(checkout, op, error);
    }
  }

  async capture(shopId: string, checkoutId: string): Promise<Checkout> {
    let checkout = await this.checkout(shopId, checkoutId);
    if (!checkout.orderId) return checkout;
    checkout = await this.reconcile(checkout.id); // Authenticated read proves approval and detects a prior capture.
    if (checkout.status !== "APPROVED") return checkout;
    await this.store.transaction(async (tx) => {
      const current = await this.checkout(shopId, checkoutId, tx);
      if (current.status !== "APPROVED") return;
      await this.ensureOperation(tx, current, "capture", {
        orderId: current.orderId,
        quote: current.quote,
        payee: current.expectedPayeeId,
      });
    });
    const op = await this.claim(checkout.id, "capture");
    if (!op) return this.checkout(shopId, checkoutId);
    try {
      // The mutation result is deliberately never sufficient to mark PAID.
      await this.gateway.captureOrder(checkout.orderId!, op.idempotencyKey);
      return await this.reconcile(checkout.id);
    } catch (error) {
      return this.fail(checkout, op, error);
    }
  }

  async reconcile(checkoutId: string): Promise<Checkout> {
    const checkout = await this.store.get<Checkout>("checkouts", checkoutId);
    if (!checkout) throw new CommerceError("CHECKOUT_NOT_FOUND", 404);
    if (!checkout.orderId) return checkout;
    let order: PayPalOrder;
    try {
      order = await this.gateway.readOrder(checkout.orderId);
    } catch {
      return this.setObservation(
        checkout,
        "UNKNOWN",
        "AUTHENTICATED_READ_UNAVAILABLE",
      );
    }
    if (!boundOrder(checkout, order))
      return this.setObservation(
        checkout,
        "MISMATCH",
        "ORDER_AMOUNT_CURRENCY_PAYEE_OR_BINDING_MISMATCH",
      );
    const captures = order.purchase_units![0].payments?.captures ?? [];
    if (captures.length === 0) {
      const expired = await this.store.transaction(async (tx) => {
        const current = await this.checkout(checkout.shopId, checkout.id, tx);
        if (["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(current.status))
          return false;
        return releaseExpiredInventory(
          tx,
          current,
          this.clock(),
          order.status === "VOIDED",
        );
      });
      if (expired)
        return this.setObservation(
          checkout,
          "CANCELLED",
          "LOCAL_HOLD_EXPIRED_REQUOTE_REQUIRED",
        );
      const status =
        order.status === "APPROVED"
          ? "APPROVED"
          : order.status === "VOIDED"
            ? "CANCELLED"
            : order.status === "CREATED" ||
                order.status === "PAYER_ACTION_REQUIRED"
              ? "AWAITING_APPROVAL"
              : "PENDING";
      return this.setObservation(
        checkout,
        status,
        status === "PENDING" ? "NO_COMPLETED_CAPTURE" : undefined,
      );
    }
    if (captures.length !== 1)
      return this.setObservation(
        checkout,
        "MISMATCH",
        "EXPECTED_ONE_FULL_CAPTURE",
      );
    const embedded = captures[0];
    let capture: PayPalCapture;
    try {
      capture = await this.gateway.readCapture(embedded.id);
    } catch {
      return this.setObservation(
        checkout,
        "UNKNOWN",
        "CAPTURE_READ_UNAVAILABLE",
      );
    }
    if (!boundCapture(checkout, embedded, capture))
      return this.setObservation(
        checkout,
        "MISMATCH",
        "CAPTURE_AMOUNT_CURRENCY_OR_ORDER_BINDING_MISMATCH",
      );
    if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(capture.status)) {
      await this.store.transaction(async (tx) => {
        const current = await this.checkout(checkout.shopId, checkout.id, tx);
        await commitInventory(tx, current, this.clock());
      });
      return this.setObservation(
        checkout,
        capture.status as "REFUNDED" | "PARTIALLY_REFUNDED",
        "AUTHENTICATED_CAPTURE_REFUND_STATE",
        {
          captureId: capture.id,
          ...(capture.status === "REFUNDED"
            ? { refundedMinor: checkout.quote.totalMinor }
            : {}),
        },
      );
    }
    if (capture.status === "REVERSED")
      return this.setObservation(
        checkout,
        "REVERSED",
        "AUTHENTICATED_CAPTURE_REVERSED",
        { captureId: capture.id },
      );
    if (capture.status === "DECLINED" || capture.status === "FAILED")
      return this.setObservation(checkout, "DECLINED", "CAPTURE_DECLINED", {
        captureId: capture.id,
      });
    if (
      order.status !== "COMPLETED" ||
      embedded.status !== "COMPLETED" ||
      capture.status !== "COMPLETED"
    )
      return this.setObservation(checkout, "PENDING", "CAPTURE_NOT_COMPLETED", {
        captureId: capture.id,
      });
    return this.store.transaction(async (tx) => {
      const current = await this.checkout(checkout.shopId, checkout.id, tx);
      const now = this.now();
      // A current authenticated read may race a refund. Do not replace its durable result.
      if (
        ["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED"].includes(current.status)
      )
        return current;
      const pendingRefund = await tx.get<PaymentOperation>(
        "operations",
        `${checkout.id}:refund`,
      );
      if (
        pendingRefund &&
        ["RUNNING", "UNKNOWN"].includes(pendingRefund.status)
      ) {
        const unresolved: Checkout = {
          ...current,
          status: "UNKNOWN",
          reason: "REFUND_RESULT_UNCONFIRMED",
          updatedAt: now,
        };
        await tx.set("checkouts", current.id, unresolved);
        return unresolved;
      }
      const stockCommitted = await commitInventory(tx, current, this.clock());
      const receipt =
        current.receipt ??
        (this.options.receiptSigner ?? getReceiptSigner()).sign({
          schema: "doorway.receipt.v1",
          issuer: "Doorway",
          environment: "PAYPAL_SANDBOX",
          checkoutId: current.id,
          shopId: current.shopId,
          quoteId: current.quoteId,
          catalogVersion: current.quote.catalogVersion,
          orderId: order.id,
          captureId: capture.id,
          amountMinor: current.quote.totalMinor,
          currency: current.quote.currency,
          observedAt: now,
          statement: RECEIPT_STATEMENT,
        });
      const result: Checkout = {
        ...current,
        status: "PAID",
        captureId: capture.id,
        receipt,
        stockCommitted,
        verifiedAt: now,
        updatedAt: now,
        reason: stockCommitted ? undefined : "LOCAL_STOCK_REVIEW_REQUIRED",
      };
      await tx.set("checkouts", result.id, result);
      await tx.set("receipts", receipt.id, receipt);
      const op = await tx.get<PaymentOperation>(
        "operations",
        `${checkout.id}:capture`,
      );
      if (op)
        await tx.set("operations", op.id, {
          ...op,
          status: "SUCCEEDED",
          providerId: capture.id,
          updatedAt: now,
        });
      return result;
    });
  }

  private async setObservation(
    checkout: Checkout,
    status: Checkout["status"],
    reason?: string,
    fields: Partial<Checkout> = {},
  ): Promise<Checkout> {
    return this.store.transaction(async (tx) => {
      const current = await this.checkout(checkout.shopId, checkout.id, tx);
      if (current.status === "REVERSED" && status !== "MISMATCH")
        return current;
      if (
        current.status === "REFUNDED" &&
        !["REFUNDED", "REVERSED", "MISMATCH"].includes(status)
      )
        return current;
      if (
        current.status === "PARTIALLY_REFUNDED" &&
        !["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED", "MISMATCH"].includes(
          status,
        )
      )
        return current;
      if (
        current.status === "PAID" &&
        [
          "APPROVED",
          "AWAITING_APPROVAL",
          "CREATING",
          "CAPTURING",
          "PENDING",
          "CANCELLED",
          "UNKNOWN",
        ].includes(status) &&
        !reason?.startsWith("REFUND_")
      )
        return current;
      const result: Checkout = {
        ...current,
        ...fields,
        status,
        reason,
        updatedAt: this.now(),
      };
      await tx.set("checkouts", result.id, result);
      return result;
    });
  }

  async approveRefund(
    shopId: string,
    ownerId: string,
    checkoutId: string,
    amountMinor: number,
  ): Promise<RefundApproval> {
    return this.store.transaction(async (tx) => {
      const checkout = await this.checkout(shopId, checkoutId, tx);
      const shop = await tx.get<Shop>("shops", shopId);
      if (!shop || shop.ownerId !== ownerId)
        throw new CommerceError("OWNER_REQUIRED", 403);
      if (
        checkout.status !== "PAID" ||
        !checkout.captureId ||
        !Number.isSafeInteger(amountMinor) ||
        amountMinor <= 0 ||
        amountMinor > checkout.quote.totalMinor - checkout.refundedMinor
      )
        throw new CommerceError("INVALID_REFUND_AMOUNT_OR_STATE");
      const previous = await tx.get<RefundApproval>(
        "refundApprovals",
        `refund-approval:${checkoutId}`,
      );
      if (previous) {
        if (
          previous.amountMinor !== amountMinor ||
          previous.ownerId !== ownerId
        )
          throw new CommerceError("REFUND_APPROVAL_ALREADY_EXISTS");
        return previous;
      }
      const approval: RefundApproval = {
        id: `refund-approval:${checkoutId}`,
        shopId,
        checkoutId,
        ownerId,
        amountMinor,
        currency: checkout.quote.currency,
        confirmedAt: this.now(),
      };
      await tx.set("refundApprovals", approval.id, approval);
      return approval;
    });
  }

  async refund(shopId: string, approvalId: string): Promise<Checkout> {
    const reference = await this.store.get<RefundApproval>(
      "refundApprovals",
      approvalId,
    );
    if (!reference || reference.shopId !== shopId)
      throw new CommerceError("REFUND_APPROVAL_NOT_FOUND", 404);
    const prepared = await this.store.transaction(async (tx) => {
      const checkout = await this.checkout(shopId, reference.checkoutId, tx);
      const approval = await tx.get<RefundApproval>(
        "refundApprovals",
        approvalId,
      );
      if (!approval || approval.shopId !== shopId)
        throw new CommerceError("REFUND_APPROVAL_NOT_FOUND", 404);
      if (
        !checkout.captureId ||
        approval.currency !== checkout.quote.currency ||
        approval.amountMinor <= 0 ||
        approval.amountMinor > checkout.quote.totalMinor
      )
        throw new CommerceError("REFUND_APPROVAL_MISMATCH");
      const existing = await tx.get<PaymentOperation>(
        "operations",
        `${checkout.id}:refund`,
      );
      if (!existing && checkout.status !== "PAID")
        throw new CommerceError("REFUND_PAYMENT_STATE_CHANGED");
      const op = await this.ensureOperation(
        tx,
        checkout,
        "refund",
        {
          captureId: checkout.captureId,
          amountMinor: approval.amountMinor,
          currency: approval.currency,
          approvalId,
        },
        { amountMinor: approval.amountMinor, approvalId },
      );
      await tx.set("refundApprovals", approval.id, {
        ...approval,
        consumedAt: approval.consumedAt ?? this.now(),
      });
      return { checkout, approval, op };
    });
    if (prepared.op.providerId)
      return this.verifyRefund(prepared.checkout, prepared.op);
    const op = await this.claim(prepared.checkout.id, "refund");
    if (!op) return this.checkout(shopId, prepared.checkout.id);
    try {
      const response = await this.gateway.refundCapture(
        prepared.checkout.captureId!,
        prepared.approval.amountMinor,
        prepared.approval.currency,
        op.idempotencyKey,
      );
      if (!validProviderId(response.id))
        throw new PayPalError("PAYPAL_REFUND_ID_MISSING", true);
      const withId = { ...op, providerId: response.id, updatedAt: this.now() };
      await this.store.transaction(async (tx) => {
        await this.checkout(shopId, prepared.checkout.id, tx);
        await tx.set("operations", op.id, withId);
      });
      return await this.verifyRefund(prepared.checkout, withId);
    } catch (error) {
      return this.fail(prepared.checkout, op, error);
    }
  }

  private async verifyRefund(
    checkout: Checkout,
    op: PaymentOperation,
  ): Promise<Checkout> {
    let refund: PayPalRefund;
    try {
      refund = await this.gateway.readRefund(op.providerId!);
    } catch {
      return this.setObservation(
        checkout,
        "UNKNOWN",
        "REFUND_READ_UNAVAILABLE",
      );
    }
    if (
      refund.id !== op.providerId ||
      refund.amount?.currency_code !== checkout.quote.currency ||
      !amountEquals(refund.amount, op.amountMinor!) ||
      !linkedTo(refund.links, "captures", checkout.captureId!)
    )
      return this.setObservation(
        checkout,
        "MISMATCH",
        "REFUND_AMOUNT_CURRENCY_OR_CAPTURE_BINDING_MISMATCH",
      );
    if (refund.status !== "COMPLETED")
      return this.setObservation(checkout, "UNKNOWN", "REFUND_NOT_COMPLETED");
    return this.store.transaction(async (tx) => {
      const current = await this.checkout(checkout.shopId, checkout.id, tx);
      const refundedMinor = Math.max(current.refundedMinor, op.amountMinor!);
      const result: Checkout = {
        ...current,
        refundId: refund.id,
        refundedMinor,
        status:
          current.status === "REVERSED"
            ? "REVERSED"
            : refundedMinor === current.quote.totalMinor
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED",
        verifiedAt: this.now(),
        updatedAt: this.now(),
        reason: undefined,
      };
      await tx.set("checkouts", result.id, result);
      await tx.set("operations", op.id, {
        ...op,
        status: "SUCCEEDED",
        updatedAt: this.now(),
      });
      return result;
    });
  }

  async reconcilePending(): Promise<{ checked: number; failed: number }> {
    const all = await this.store.list<Checkout>("checkouts");
    let checked = 0,
      failed = 0;
    for (const checkout of all) {
      try {
        const refundOp = await this.store.get<PaymentOperation>(
          "operations",
          `${checkout.id}:refund`,
        );
        if (refundOp && refundOp.status !== "SUCCEEDED" && refundOp.providerId)
          await this.verifyRefund(checkout, refundOp);
        else if (
          refundOp &&
          refundOp.status !== "SUCCEEDED" &&
          refundOp.approvalId
        )
          await this.refund(checkout.shopId, refundOp.approvalId);
        else if (checkout.orderId) await this.reconcile(checkout.id);
        else if (["UNKNOWN", "CREATING"].includes(checkout.status))
          await this.createExisting(checkout);
        checked++;
      } catch {
        failed++;
      }
    }
    return { checked, failed };
  }

  async handleWebhook(
    headers: Record<string, string>,
    event: WebhookEvent,
  ): Promise<{ accepted: boolean; duplicate: boolean }> {
    if (
      !event ||
      !validProviderId(event.id) ||
      typeof event.event_type !== "string" ||
      !(await this.gateway.verifyWebhook(headers, event))
    )
      throw new CommerceError("WEBHOOK_SIGNATURE_INVALID", 400);
    const hash = digest(event);
    const accepted = await this.store.transaction(async (tx) => {
      const previous = await tx.get<StoredWebhook>("webhooks", event.id);
      if (previous) {
        if (previous.payloadHash !== hash)
          throw new CommerceError("WEBHOOK_REPLAY_BODY_CHANGED", 400);
        return !previous.processedAt;
      }
      await tx.set("webhooks", event.id, {
        id: event.id,
        shopId: "unmatched",
        eventType: event.event_type,
        payloadHash: hash,
        verifiedAt: this.now(),
      });
      return true;
    });
    if (!accepted) return { accepted: true, duplicate: true };
    const related = event.resource?.supplementary_data?.related_ids;
    const all = await this.store.list<Checkout>("checkouts");
    const targets = all
      .filter(
        (checkout) =>
          (!!related?.order_id && checkout.orderId === related.order_id) ||
          (!!event.resource?.id &&
            (checkout.orderId === event.resource.id ||
              checkout.captureId === event.resource.id ||
              checkout.refundId === event.resource.id)) ||
          (!!related?.capture_id && checkout.captureId === related.capture_id),
      )
      .filter((checkout) => checkout.orderId);
    for (const checkout of targets) {
      const refundOp = await this.store.get<PaymentOperation>(
        "operations",
        `${checkout.id}:refund`,
      );
      if (refundOp?.providerId) await this.verifyRefund(checkout, refundOp);
      else await this.reconcile(checkout.id);
    }
    await this.store.transaction(async (tx) => {
      const saved = await tx.get<StoredWebhook>("webhooks", event.id);
      if (saved)
        await tx.set("webhooks", saved.id, {
          ...saved,
          processedAt: this.now(),
        });
    });
    return { accepted: true, duplicate: false };
  }
}

function validProviderId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(id);
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function amountEquals(
  value: { currency_code: string; value: string } | undefined,
  expected: number,
): boolean {
  try {
    return !!value && paypalToMinor(value) === expected;
  } catch {
    return false;
  }
}
function boundOrder(checkout: Checkout, order: PayPalOrder): boolean {
  const unit = order.purchase_units?.[0];
  return (
    order.id === checkout.orderId &&
    order.intent === "CAPTURE" &&
    order.purchase_units?.length === 1 &&
    !!unit &&
    unit.reference_id === checkout.id &&
    unit.custom_id === checkout.id &&
    unit.invoice_id === checkout.id &&
    unit.payee?.merchant_id === checkout.expectedPayeeId &&
    unit.amount?.currency_code === checkout.quote.currency &&
    amountEquals(unit.amount, checkout.quote.totalMinor)
  );
}
function boundCapture(
  checkout: Checkout,
  embedded: PayPalCapture,
  capture: PayPalCapture,
): boolean {
  return (
    validProviderId(capture.id) &&
    capture.id === embedded.id &&
    (!checkout.captureId || checkout.captureId === capture.id) &&
    embedded.amount?.currency_code === checkout.quote.currency &&
    capture.amount?.currency_code === checkout.quote.currency &&
    amountEquals(embedded.amount, checkout.quote.totalMinor) &&
    amountEquals(capture.amount, checkout.quote.totalMinor) &&
    (capture.supplementary_data?.related_ids?.order_id === checkout.orderId ||
      linkedTo(capture.links, "orders", checkout.orderId!))
  );
}
function linkedTo(
  links: Array<{ rel: string; href: string }> | undefined,
  kind: "orders" | "captures",
  id: string,
): boolean {
  return !!links?.some((link) => {
    try {
      const url = new URL(link.href);
      return (
        link.rel === "up" &&
        url.protocol === "https:" &&
        ["api-m.sandbox.paypal.com", "api.sandbox.paypal.com"].includes(
          url.hostname,
        ) &&
        url.pathname ===
          (kind === "orders"
            ? `/v2/checkout/orders/${id}`
            : `/v2/payments/captures/${id}`) &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
}
