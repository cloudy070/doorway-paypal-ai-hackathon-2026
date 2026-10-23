import { generateKeyPairSync } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createStore, type Store } from "../src/lib/db";
import type { Catalog, Shop } from "../src/lib/domain";
import type {
  Checkout,
  PaymentOperation,
  Quote,
} from "../src/lib/domain-commerce";
import { createQuote } from "../src/lib/commerce";
import {
  initializeCatalogInventory,
  inventoryAvailability,
  type InventoryReservation,
} from "../src/lib/inventory";
import { PaymentService } from "../src/lib/payments";
import { ReceiptSigner, verifyReceipt } from "../src/lib/receipts";
import {
  SandboxPayPal,
  type PayPalCapture,
  type PayPalOrder,
  type PayPalRefund,
  type WebhookEvent,
} from "../src/lib/paypal";

/** An injected HTTP boundary: all production service and database code still runs. */
class SandboxTransport {
  calls: Array<{
    path: string;
    method: string;
    key: string | null;
    body: Record<string, unknown>;
  }> = [];
  order?: PayPalOrder;
  capture?: PayPalCapture;
  refund?: PayPalRefund;
  createTimeout = false;
  captureTimeout = false;
  refundTimeout = false;
  readUnavailable = false;
  capturePending = false;
  signatureValid = true;
  mutateOrder?: (value: PayPalOrder) => void;
  onMutation?: (key: string, path: string) => Promise<void>;
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api-m.sandbox.paypal.com");
    expect(init?.redirect).toBe("error");
    const path = url.pathname,
      method = init?.method ?? "GET";
    const headers = new Headers(init?.headers),
      key = headers.get("PayPal-Request-Id");
    let body: Record<string, unknown> = {};
    if (init?.body && String(init.body).startsWith("{"))
      body = JSON.parse(String(init.body));
    this.calls.push({ path, method, key, body });
    const result = (value: unknown) =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (path === "/v1/oauth2/token")
      return result({ access_token: "test-access-token", expires_in: 3600 });
    expect(headers.get("authorization")).toBe("Bearer test-access-token");
    if (path === "/v1/notifications/verify-webhook-signature")
      return result({
        verification_status: this.signatureValid ? "SUCCESS" : "FAILURE",
      });
    if (method === "POST") {
      expect(key).toMatch(/^[a-f0-9-]{36}$/);
      await this.onMutation?.(key!, path);
    }
    if (path === "/v2/checkout/orders" && method === "POST") {
      if (!this.order)
        this.order = {
          id: "ORDER1",
          status: "CREATED",
          intent: "CAPTURE",
          purchase_units: body.purchase_units as PayPalOrder["purchase_units"],
          links: [
            {
              rel: "payer-action",
              href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1",
            },
          ],
        };
      if (this.createTimeout) {
        this.createTimeout = false;
        throw new Error("injected response lost after create");
      }
      return result(this.order);
    }
    if (path === "/v2/checkout/orders/ORDER1/capture" && method === "POST") {
      this.completeCapture();
      if (this.captureTimeout) {
        this.captureTimeout = false;
        throw new Error("injected response lost after capture");
      }
      return result(this.order);
    }
    if (path === "/v2/checkout/orders/ORDER1" && method === "GET") {
      if (this.readUnavailable) throw new Error("injected read outage");
      const order = structuredClone(this.order!);
      this.mutateOrder?.(order);
      return result(order);
    }
    if (path === "/v2/payments/captures/CAPTURE1" && method === "GET")
      return result({
        ...this.capture,
        status: this.capturePending ? "PENDING" : this.capture!.status,
      });
    if (path === "/v2/payments/captures/CAPTURE1/refund" && method === "POST") {
      if (!this.refund)
        this.refund = {
          id: "REFUND1",
          status: "COMPLETED",
          amount: body.amount as PayPalRefund["amount"],
          links: [
            {
              rel: "up",
              href: "https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE1",
            },
          ],
        };
      if (this.refundTimeout) {
        this.refundTimeout = false;
        throw new Error("injected refund response lost");
      }
      return result(this.refund);
    }
    if (path === "/v2/payments/refunds/REFUND1" && method === "GET")
      return result(this.refund);
    throw new Error(`Unhandled injected HTTP ${method} ${path}`);
  };
  completeCapture(): void {
    this.capture = {
      id: "CAPTURE1",
      status: "COMPLETED",
      amount: structuredClone(this.order!.purchase_units![0].amount),
      final_capture: true,
      supplementary_data: { related_ids: { order_id: "ORDER1" } },
    };
    this.order!.status = "COMPLETED";
    this.order!.purchase_units![0].payments = {
      captures: [structuredClone(this.capture)],
    };
  }
  writes(path: string) {
    return this.calls.filter(
      (call) => call.method === "POST" && call.path === path,
    );
  }
}

const shop: Shop = {
  id: "shop1",
  ownerId: "owner1",
  slug: "bakery",
  name: "Bakery",
  siteUrl: "https://example.com",
  currency: "GBP",
  paypalMerchantId: "MERCHANT1",
  ownershipToken: "token",
  domainVerified: true,
  publishedVersion: 1,
  createdAt: "2026-10-23T00:00:00Z",
};
const catalog: Catalog = {
  id: "catalog1",
  shopId: shop.id,
  version: 1,
  status: "APPROVED",
  approvedAt: "2026-10-23T00:00:00Z",
  createdAt: "2026-10-23T00:00:00Z",
  source: "SYNTHETIC",
  sources: [],
  warnings: [],
  products: [
    {
      id: "bread",
      name: "Bread",
      description: "Bread",
      priceMinor: 500,
      currency: "GBP",
      stock: 20,
      attributes: {},
    },
  ],
  rules: {
    pickupDays: [0, 1, 2, 3, 4, 5, 6],
    leadTimeHours: 0,
    minOrderMinor: 100,
    maxQuantityPerLine: 10,
    deliveryPolicy: "Pickup",
    returnsPolicy: "Contact owner",
  },
};
const signer = new ReceiptSigner(
  generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
);
const webhookHeaders = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url":
    "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
  "paypal-transmission-id": "transmission-1",
  "paypal-transmission-sig": "signature",
  "paypal-transmission-time": "2026-10-23T12:00:00Z",
};
let store: Store,
  transport: SandboxTransport,
  service: PaymentService,
  quote: Quote,
  clock: Date;

beforeAll(async () => {
  process.env.TEST_DB_MEMORY = "1";
  store = await createStore();
}, 60000);
beforeEach(async () => {
  for (const collection of [
    "shops",
    "catalogs",
    "quotes",
    "checkouts",
    "operations",
    "refundApprovals",
    "webhooks",
    "receipts",
    "inventory",
    "reservations",
  ]) {
    for (const record of await store.list<{ id: string }>(collection))
      await store.delete(collection, record.id);
  }
  clock = new Date("2026-10-23T12:00:00Z");
  await store.set("shops", shop.id, shop);
  await store.set("catalogs", catalog.id, catalog);
  transport = new SandboxTransport();
  const gateway = new SandboxPayPal({
    clientId: "test",
    clientSecret: "test-secret",
    webhookId: "WEBHOOK1",
    returnUrl: "http://localhost:3000/return",
    cancelUrl: "http://localhost:3000/cancel",
    fetch: transport.fetch,
  });
  service = new PaymentService(store, gateway, {
    clock: () => clock,
    receiptSigner: signer,
  });
  quote = await createQuote(
    store,
    shop.id,
    [{ productId: "bread", quantity: 2 }],
    { pickupDate: "2026-10-24", now: clock },
  );
});
async function paidCheckout() {
  const checkout = await service.startCheckout(shop.id, quote.id);
  transport.order!.status = "APPROVED";
  return service.capture(shop.id, checkout.id);
}

describe("durable real-adapter payment orchestration with injected HTTP", () => {
  it("commits an operation and unique key before HTTP; concurrent retries create once", async () => {
    transport.onMutation = async (key) => {
      const operations = await store.list<PaymentOperation>("operations");
      expect(
        operations.some(
          (op) => op.idempotencyKey === key && op.status === "RUNNING",
        ),
      ).toBe(true);
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.startCheckout(shop.id, quote.id)),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(transport.writes("/v2/checkout/orders")).toHaveLength(1);
    expect(await store.list<PaymentOperation>("operations")).toHaveLength(1);
  });
  it("binds PayPal callback URLs to this checkout and validates dynamic callbacks before sending", async () => {
    const gateway = new SandboxPayPal({
      clientId: "test",
      clientSecret: "test-secret",
      webhookId: "WEBHOOK1",
      returnUrl: "https://doorway.example/return",
      cancelUrl: "https://doorway.example/cancel",
      returnUrlFor: (id) =>
        `https://doorway.example/checkout/${encodeURIComponent(id)}?token=return-capability&returned=1`,
      cancelUrlFor: (id) =>
        `https://doorway.example/checkout/${encodeURIComponent(id)}?token=return-capability&cancelled=1`,
      fetch: transport.fetch,
    });
    const bound = new PaymentService(store, gateway, {
      clock: () => clock,
      receiptSigner: signer,
    });
    const checkout = await bound.startCheckout(shop.id, quote.id);
    const body = transport.writes("/v2/checkout/orders")[0].body;
    const context = (
      body.payment_source as {
        paypal: {
          experience_context: { return_url: string; cancel_url: string };
        };
      }
    ).paypal.experience_context;
    expect(new URL(context.return_url).pathname).toBe(
      `/checkout/${encodeURIComponent(checkout.id)}`,
    );
    expect(new URL(context.return_url).searchParams.get("token")).toBe(
      "return-capability",
    );
    expect(new URL(context.cancel_url).searchParams.get("cancelled")).toBe("1");
    const unsafe = new SandboxPayPal({
      clientId: "test",
      clientSecret: "test-secret",
      webhookId: "WEBHOOK1",
      returnUrl: "https://doorway.example/return",
      cancelUrl: "https://doorway.example/cancel",
      returnUrlFor: () => "javascript:alert(1)",
      fetch: transport.fetch,
    });
    expect(() =>
      unsafe.createOrder(
        {
          paymentId: "payment-1",
          merchantId: "merchant-1",
          amountMinor: 100,
          currency: "GBP",
          subtotalMinor: 100,
          discountMinor: 0,
          lines: [
            {
              productId: "bread",
              name: "Bread",
              quantity: 1,
              unitPriceMinor: 100,
            },
          ],
        },
        "00000000-0000-4000-a000-000000000001",
      ),
    ).toThrow("INVALID_CHECKOUT_CALLBACK_URL");
    expect(transport.writes("/v2/checkout/orders")).toHaveLength(1);
  });
  it("requires authenticated human approval and rejects tenant access", async () => {
    const checkout = await service.startCheckout(shop.id, quote.id);
    expect((await service.capture(shop.id, checkout.id)).status).toBe(
      "AWAITING_APPROVAL",
    );
    expect(transport.writes("/v2/checkout/orders/ORDER1/capture")).toHaveLength(
      0,
    );
    await expect(service.capture("other-shop", checkout.id)).rejects.toThrow(
      "CHECKOUT_NOT_FOUND",
    );
  });
  it("reads order and capture before PAID and signs the exact observed binding", async () => {
    const checkout = await paidCheckout();
    expect(checkout.status).toBe("PAID");
    expect(checkout.captureId).toBe("CAPTURE1");
    expect(verifyReceipt(checkout.receipt!, signer.publicKey)).toBe(true);
    expect(checkout.receipt!.payload.amountMinor).toBe(1000);
    expect(
      transport.calls.some(
        (call) =>
          call.method === "GET" && call.path.endsWith("captures/CAPTURE1"),
      ),
    ).toBe(true);
  });
  it("never trusts a successful capture response without completed authenticated reads", async () => {
    const checkout = await service.startCheckout(shop.id, quote.id);
    transport.order!.status = "APPROVED";
    transport.capturePending = true;
    expect((await service.capture(shop.id, checkout.id)).status).toBe(
      "PENDING",
    );
    expect(await store.list("receipts")).toHaveLength(0);
  });
  it("requires the separately read capture to bind to this order and reflects a later reversal", async () => {
    const checkout = await paidCheckout();
    transport.capture!.supplementary_data!.related_ids!.order_id =
      "OTHER_ORDER";
    expect((await service.reconcile(checkout.id)).status).toBe("MISMATCH");
    transport.capture!.supplementary_data!.related_ids!.order_id = "ORDER1";
    transport.capture!.status = "REVERSED";
    expect((await service.reconcile(checkout.id)).status).toBe("REVERSED");
  });
  it.each(["amount", "currency", "payee", "order", "invoice"])(
    "holds a wrong %s binding",
    async (field) => {
      const checkout = await paidCheckout();
      transport.mutateOrder = (order) => {
        const unit = order.purchase_units![0];
        if (field === "amount") unit.amount.value = "1.00";
        if (field === "currency") unit.amount.currency_code = "USD";
        if (field === "payee") unit.payee!.merchant_id = "OTHER";
        if (field === "order") order.id = "OTHER";
        if (field === "invoice") unit.invoice_id = "OTHER";
      };
      expect((await service.reconcile(checkout.id)).status).toBe("MISMATCH");
    },
  );
  it("recovers a lost create response using the same key and stops retries after retention", async () => {
    transport.createTimeout = true;
    const first = await service.startCheckout(shop.id, quote.id);
    expect(first.status).toBe("UNKNOWN");
    const recovered = await service.startCheckout(shop.id, quote.id);
    expect(recovered.orderId).toBe("ORDER1");
    const calls = transport.writes("/v2/checkout/orders");
    expect(calls[0].key).toBe(calls[1].key);
    // A separate unknown create with an expired durable key is never replaced.
    transport.order = undefined;
    transport.createTimeout = true;
    const secondQuote = await createQuote(
      store,
      shop.id,
      [{ productId: "bread", quantity: 1 }],
      { pickupDate: "2026-10-24", now: clock },
    );
    const second = await service.startCheckout(shop.id, secondQuote.id);
    const count = transport.writes("/v2/checkout/orders").length;
    clock = new Date(clock.getTime() + 7 * 3600000);
    expect((await service.startCheckout(shop.id, secondQuote.id)).status).toBe(
      "UNKNOWN",
    );
    expect(transport.writes("/v2/checkout/orders")).toHaveLength(count);
    expect(
      (await store.get<Checkout>("checkouts", second.id))!.reason,
    ).toContain("IDEMPOTENCY_WINDOW_EXPIRED");
  });
  it("recovers after capture took effect but its response was lost, without a second capture", async () => {
    const checkout = await service.startCheckout(shop.id, quote.id);
    transport.order!.status = "APPROVED";
    transport.captureTimeout = true;
    expect((await service.capture(shop.id, checkout.id)).status).toBe(
      "UNKNOWN",
    );
    expect((await service.reconcile(checkout.id)).status).toBe("PAID");
    expect((await service.capture(shop.id, checkout.id)).status).toBe("PAID");
    expect(transport.writes("/v2/checkout/orders/ORDER1/capture")).toHaveLength(
      1,
    );
  });
  it("a recreated worker recovers a durable RUNNING capture after an abrupt crash", async () => {
    const checkout = await service.startCheckout(shop.id, quote.id);
    transport.order!.status = "APPROVED";
    // Model the durable boundary after HTTP accepted a capture and before any response save.
    await store.set("operations", `${checkout.id}:capture`, {
      id: `${checkout.id}:capture`,
      shopId: shop.id,
      checkoutId: checkout.id,
      kind: "capture",
      idempotencyKey: "00000000-0000-4000-a000-000000000001",
      requestHash: "persisted-before-dispatch",
      status: "RUNNING",
      createdAt: clock.toISOString(),
      updatedAt: clock.toISOString(),
      leaseUntil: new Date(clock.getTime() + 60000).toISOString(),
    } satisfies PaymentOperation);
    transport.completeCapture();
    const restarted = new PaymentService(
      store,
      new SandboxPayPal({
        clientId: "test",
        clientSecret: "test-secret",
        webhookId: "WEBHOOK1",
        returnUrl: "http://localhost:3000/return",
        cancelUrl: "http://localhost:3000/cancel",
        fetch: transport.fetch,
      }),
      { clock: () => clock, receiptSigner: signer },
    );
    expect(await restarted.reconcilePending()).toEqual({
      checked: 1,
      failed: 0,
    });
    expect((await store.get<Checkout>("checkouts", checkout.id))!.status).toBe(
      "PAID",
    );
    expect(transport.writes("/v2/checkout/orders/ORDER1/capture")).toHaveLength(
      0,
    );
  });
  it("verifies webhook signatures, deduplicates replay, and lets fresh reads decide stale events", async () => {
    const checkout = await paidCheckout();
    const event: WebhookEvent = {
      id: "WH-EVENT1",
      event_type: "PAYMENT.CAPTURE.DENIED",
      resource: {
        id: "CAPTURE1",
        supplementary_data: { related_ids: { order_id: "ORDER1" } },
      },
    };
    transport.signatureValid = false;
    await expect(service.handleWebhook(webhookHeaders, event)).rejects.toThrow(
      "WEBHOOK_SIGNATURE_INVALID",
    );
    expect(await store.list("webhooks")).toHaveLength(0);
    transport.signatureValid = true;
    expect(await service.handleWebhook(webhookHeaders, event)).toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(await service.handleWebhook(webhookHeaders, event)).toEqual({
      accepted: true,
      duplicate: true,
    });
    expect((await store.get<Checkout>("checkouts", checkout.id))!.status).toBe(
      "PAID",
    );
    await expect(
      service.handleWebhook(webhookHeaders, {
        ...event,
        event_type: "PAYMENT.CAPTURE.COMPLETED",
      }),
    ).rejects.toThrow("WEBHOOK_REPLAY_BODY_CHANGED");
  });
  it("requires exact owner approval and reuses a durable refund key after an ambiguous outcome", async () => {
    const checkout = await paidCheckout();
    await expect(
      service.approveRefund(shop.id, "intruder", checkout.id, 300),
    ).rejects.toThrow("OWNER_REQUIRED");
    await expect(
      service.approveRefund(shop.id, shop.ownerId, checkout.id, 1001),
    ).rejects.toThrow("INVALID_REFUND_AMOUNT_OR_STATE");
    const approval = await service.approveRefund(
      shop.id,
      shop.ownerId,
      checkout.id,
      300,
    );
    await expect(
      service.approveRefund(shop.id, shop.ownerId, checkout.id, 500),
    ).rejects.toThrow("REFUND_APPROVAL_ALREADY_EXISTS");
    transport.refundTimeout = true;
    expect((await service.refund(shop.id, approval.id)).status).toBe("UNKNOWN");
    const refunded = await service.refund(shop.id, approval.id);
    expect(refunded.status).toBe("PARTIALLY_REFUNDED");
    expect(refunded.refundedMinor).toBe(300);
    const writes = transport.writes("/v2/payments/captures/CAPTURE1/refund");
    expect(writes).toHaveLength(2);
    expect(writes[0].key).toBe(writes[1].key);
    expect(writes[0].body.amount).toEqual({
      value: "3.00",
      currency_code: "GBP",
    });
    await service.refund(shop.id, approval.id);
    expect(
      transport.writes("/v2/payments/captures/CAPTURE1/refund"),
    ).toHaveLength(2);
  });
  it("never silently reprices an already quoted or published-version-changed order", async () => {
    await store.set("shops", shop.id, { ...shop, publishedVersion: 2 });
    await store.set("catalogs", "catalog2", {
      ...catalog,
      id: "catalog2",
      version: 2,
    });
    await expect(service.startCheckout(shop.id, quote.id)).rejects.toThrow(
      "CATALOG_CHANGED_REQUOTE_REQUIRED",
    );
    expect(transport.writes("/v2/checkout/orders")).toHaveLength(0);
  });
  it("atomically reserves the last unit across concurrent distinct checkouts", async () => {
    const lastUnit = {
      ...catalog,
      products: [{ ...catalog.products[0], stock: 1 }],
    };
    await store.set("catalogs", catalog.id, lastUnit);
    const [first, second] = await Promise.all(
      [1, 2].map(() =>
        createQuote(store, shop.id, [{ productId: "bread", quantity: 1 }], {
          pickupDate: "2026-10-24",
          now: clock,
        }),
      ),
    );
    const results = await Promise.allSettled([
      service.startCheckout(shop.id, first.id),
      service.startCheckout(shop.id, second.id),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(transport.writes("/v2/checkout/orders")).toHaveLength(1);
    expect((await inventoryAvailability(store, lastUnit)).bread).toBe(0);
  });
  it("expires approval holds before capture and safely releases after an authenticated no-capture read", async () => {
    const checkout = await service.startCheckout(shop.id, quote.id);
    transport.order!.status = "APPROVED";
    clock = new Date(clock.getTime() + 4 * 60000);
    const result = await service.capture(shop.id, checkout.id);
    expect(result.status).toBe("CANCELLED");
    expect(result.reason).toBe("LOCAL_HOLD_EXPIRED_REQUOTE_REQUIRED");
    expect(transport.writes("/v2/checkout/orders/ORDER1/capture")).toHaveLength(
      0,
    );
    expect((await inventoryAvailability(store, catalog)).bread).toBe(20);
  });
  it("never releases expired inventory while a capture outcome is unknown, then commits once", async () => {
    const checkout = await service.startCheckout(shop.id, quote.id);
    transport.order!.status = "APPROVED";
    transport.captureTimeout = true;
    expect((await service.capture(shop.id, checkout.id)).status).toBe(
      "UNKNOWN",
    );
    clock = new Date(clock.getTime() + 4 * 60000);
    transport.readUnavailable = true;
    await service.reconcilePending();
    expect((await inventoryAvailability(store, catalog)).bread).toBe(18);
    expect(
      (await store.list<InventoryReservation>("reservations"))[0].status,
    ).toBe("HELD");
    transport.readUnavailable = false;
    await service.reconcilePending();
    await service.reconcilePending();
    expect((await inventoryAvailability(store, catalog)).bread).toBe(18);
    expect(
      (await store.list<InventoryReservation>("reservations"))[0].status,
    ).toBe("COMMITTED");
    expect(
      (await store.get<Checkout>("checkouts", checkout.id))!.stockCommitted,
    ).toBe(true);
  });
  it("does not replenish sold inventory when a catalog price version is published", async () => {
    await paidCheckout();
    await store.transaction((tx) =>
      initializeCatalogInventory(tx, {
        ...catalog,
        version: 2,
        products: [{ ...catalog.products[0], priceMinor: 600 }],
      }),
    );
    expect((await inventoryAvailability(store, catalog)).bread).toBe(18);
  });
});
