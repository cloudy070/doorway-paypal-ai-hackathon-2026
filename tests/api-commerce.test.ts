import { generateKeyPairSync } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createStore, type Store } from "../src/lib/db";
import { hashToken } from "../src/lib/auth";
import { PaymentService } from "../src/lib/payments";
import { ReceiptSigner } from "../src/lib/receipts";
import type { Catalog, Shop, User } from "../src/lib/domain";
import type {
  Checkout,
  Quote,
  RefundApproval,
} from "../src/lib/domain-commerce";
import {
  PayPalError,
  type PayPalCapture,
  type PayPalCreateInput,
  type PayPalGateway,
  type PayPalOrder,
  type PayPalRefund,
} from "../src/lib/paypal";

const runtimeHarness = vi.hoisted(() => ({ service: undefined as unknown }));
vi.mock("../src/lib/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/runtime")>()),
  getPaymentService: async () => runtimeHarness.service,
}));
import { GET, POST, PUT } from "../src/app/api/[...path]/route";
import { checkoutAccessToken, verifyCheckoutAccess } from "../src/lib/runtime";

/** Gateway replacement is test-only; routing/auth, commerce, inventory, and DB are real. */
class ApiGateway implements PayPalGateway {
  orders = new Map<string, PayPalOrder>();
  captures = new Map<string, PayPalCapture>();
  refunds = new Map<string, PayPalRefund>();
  createCalls = 0;
  captureCalls = 0;
  refundCalls = 0;
  refundError?: PayPalError;
  async createOrder(input: PayPalCreateInput): Promise<PayPalOrder> {
    const id = `ORDER-${++this.createCalls}`;
    const order: PayPalOrder = {
      id,
      intent: "CAPTURE",
      status: "CREATED",
      purchase_units: [
        {
          reference_id: input.paymentId,
          custom_id: input.paymentId,
          invoice_id: input.paymentId,
          amount: {
            currency_code: input.currency,
            value: (input.amountMinor / 100).toFixed(2),
          },
          payee: { merchant_id: input.merchantId },
        },
      ],
      links: [
        {
          rel: "payer-action",
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
        },
      ],
    };
    this.orders.set(id, order);
    return structuredClone(order);
  }
  async readOrder(id: string) {
    return structuredClone(this.orders.get(id)!);
  }
  async captureOrder(id: string): Promise<PayPalOrder> {
    const order = this.orders.get(id)!;
    expect(order.status).toBe("APPROVED");
    this.captureCalls++;
    const capture: PayPalCapture = {
      id: `CAPTURE-${this.captureCalls}`,
      status: "COMPLETED",
      amount: structuredClone(order.purchase_units![0].amount),
      final_capture: true,
      supplementary_data: { related_ids: { order_id: id } },
    };
    this.captures.set(capture.id, capture);
    order.status = "COMPLETED";
    order.purchase_units![0].payments = { captures: [capture] };
    return structuredClone(order);
  }
  async readCapture(id: string) {
    return structuredClone(this.captures.get(id)!);
  }
  async refundCapture(
    captureId: string,
    amountMinor: number,
    currency: string,
  ): Promise<PayPalRefund> {
    if (this.refundError) throw this.refundError;
    const refund: PayPalRefund = {
      id: `REFUND-${++this.refundCalls}`,
      status: "COMPLETED",
      amount: {
        currency_code: currency,
        value: (amountMinor / 100).toFixed(2),
      },
      links: [
        {
          rel: "up",
          href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`,
        },
      ],
    };
    this.refunds.set(refund.id, refund);
    return structuredClone(refund);
  }
  async readRefund(id: string) {
    return structuredClone(this.refunds.get(id)!);
  }
  async verifyWebhook() {
    return false;
  }
}

const origin = "http://127.0.0.1:3000";
const owner: User = {
  id: "api-owner",
  email: "owner@example.test",
  passwordHash: "unused",
  createdAt: "2026-10-23T12:00:00Z",
};
const intruder: User = {
  ...owner,
  id: "api-intruder",
  email: "intruder@example.test",
};
const shop: Shop = {
  id: "api-shop",
  ownerId: owner.id,
  slug: "api-bakery",
  name: "API Bakery",
  siteUrl: "https://merchant.example.test",
  currency: "GBP",
  paypalMerchantId: "MERCHANT1",
  ownershipToken: "private-domain-proof",
  domainVerified: true,
  publishedVersion: 1,
  createdAt: "2026-10-23T12:00:00Z",
};
const catalog: Catalog = {
  id: `${shop.id}:1`,
  shopId: shop.id,
  version: 1,
  status: "APPROVED",
  approvedAt: "2026-10-23T12:00:00Z",
  createdAt: "2026-10-23T12:00:00Z",
  source: "SYNTHETIC",
  sources: [],
  warnings: [],
  products: [
    {
      id: "bread",
      name: "Bread",
      description: "Owner confirmed",
      priceMinor: 500,
      currency: "GBP",
      stock: 20,
      attributes: { dietary: ["vegan"] },
      issues: [],
    },
  ],
  rules: {
    pickupDays: [0, 1, 2, 3, 4, 5, 6],
    leadTimeHours: 0,
    minOrderMinor: 0,
    maxQuantityPerLine: 10,
    deliveryPolicy: "Collect at the shop",
    returnsPolicy: "Ask the owner",
  },
};
const privateKey = generateKeyPairSync("ed25519")
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const signer = new ReceiptSigner(privateKey);
let store: Store,
  gateway: ApiGateway,
  previousGlobal: Promise<Store> | undefined;

beforeAll(async () => {
  process.env.TEST_DB_MEMORY = "1";
  process.env.APP_URL = origin;
  process.env.CHECKOUT_ACCESS_SECRET =
    "test-only-fixed-checkout-secret-at-least-32-bytes";
  process.env.RECEIPT_PRIVATE_KEY = privateKey;
  store = await createStore();
  const globalState = globalThis as typeof globalThis & {
    doorwayStore?: Promise<Store>;
  };
  previousGlobal = globalState.doorwayStore;
  globalState.doorwayStore = Promise.resolve(store);
}, 60000);
afterAll(() => {
  (
    globalThis as typeof globalThis & { doorwayStore?: Promise<Store> }
  ).doorwayStore = previousGlobal;
});
beforeEach(async () => {
  for (const collection of [
    "shops",
    "slugs",
    "catalogs",
    "quotes",
    "checkouts",
    "operations",
    "refundApprovals",
    "refundProposals",
    "refundConfirmations",
    "webhooks",
    "receipts",
    "inventory",
    "reservations",
    "users",
    "sessions",
    "audit",
    "unmetIntents",
  ])
    for (const row of await store.list<{ id: string }>(collection))
      await store.delete(collection, row.id);
  await store.set("users", owner.id, owner);
  await store.set("users", intruder.id, intruder);
  for (const [token, user] of [
    ["owner-session", owner],
    ["intruder-session", intruder],
  ] as const)
    await store.set("sessions", hashToken(token), {
      id: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  await store.set("shops", shop.id, shop);
  await store.set("catalogs", catalog.id, catalog);
  await store.set("slugs", shop.slug, { id: shop.slug, shopId: shop.id });
  gateway = new ApiGateway();
  runtimeHarness.service = new PaymentService(store, gateway, {
    receiptSigner: signer,
  });
});
async function request(
  method: "GET" | "POST" | "PUT",
  path: string[],
  body?: unknown,
  options: {
    session?: "owner" | "intruder";
    query?: string;
    origin?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    headers.origin = options.origin ?? origin;
    headers["content-type"] = "application/json";
  }
  if (options.session)
    headers.cookie = `doorway_session=${options.session}-session`;
  const req = new Request(
    `${origin}/api/${path.map(encodeURIComponent).join("/")}${options.query ? `?${options.query}` : ""}`,
    {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const response = await { GET, POST, PUT }[method](req, {
    params: Promise.resolve({ path }),
  });
  return {
    response,
    json: (await response.json()) as {
      data?: any;
      error?: { code: string; message: string };
    },
  };
}
async function startCheckout(): Promise<{ checkout: Checkout; token: string }> {
  const quoted = await request("POST", ["store", shop.slug, "quote"], {
    lines: [{ productId: "bread", quantity: 2 }],
    pickupDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });
  expect(quoted.response.status).toBe(200);
  const started = await request("POST", ["store", shop.slug, "checkout"], {
    quoteId: (quoted.json.data as Quote).id,
  });
  expect(started.response.status).toBe(200);
  return started.json.data;
}
async function paidCheckout() {
  const started = await startCheckout();
  gateway.orders.get(started.checkout.orderId!)!.status = "APPROVED";
  const paid = await request(
    "POST",
    ["checkouts", started.checkout.id, "capture"],
    { access: started.token },
  );
  expect(paid.json.data.status).toBe("PAID");
  return { ...started, checkout: paid.json.data as Checkout };
}

describe("commerce HTTP authorization and lifecycle", () => {
  it("binds only the configured sandbox recipient after explicit owner action", async () => {
    const previous = Object.fromEntries(
      ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_MERCHANT_ID"].map(
        (key) => [key, process.env[key]],
      ),
    );
    try {
      await store.set("shops", shop.id, { ...shop, paypalMerchantId: "" });
      delete process.env.PAYPAL_MERCHANT_ID;
      expect(
        (
          await request(
            "POST",
            ["shops", shop.id, "connect-paypal"],
            {},
            { session: "owner" },
          )
        ).response.status,
      ).toBe(503);
      process.env.PAYPAL_CLIENT_ID = "test-app";
      process.env.PAYPAL_CLIENT_SECRET = "test-secret";
      process.env.PAYPAL_MERCHANT_ID = "MERCHANT1";
      expect(
        (
          await request(
            "POST",
            ["shops", shop.id, "connect-paypal"],
            {},
            { session: "intruder" },
          )
        ).response.status,
      ).toBe(404);
      const connected = await request(
        "POST",
        ["shops", shop.id, "connect-paypal"],
        { merchantId: "ATTACKER" },
        { session: "owner" },
      );
      expect(connected.response.status).toBe(200);
      expect(connected.json.data.paypalMerchantId).toBe("MERCHANT1");
      process.env.PAYPAL_MERCHANT_ID = "MERCHANT2";
      expect(
        (
          await request(
            "POST",
            ["shops", shop.id, "connect-paypal"],
            {},
            { session: "owner" },
          )
        ).response.status,
      ).toBe(409);
      expect((await store.get<Shop>("shops", shop.id))?.paypalMerchantId).toBe(
        "MERCHANT1",
      );
    } finally {
      for (const [key, value] of Object.entries(previous))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
  });
  it("serves the published catalog and availability without exposing owner proof or owner identity", async () => {
    const result = await request("GET", ["store", shop.slug]);
    expect(result.response.status).toBe(200);
    expect(result.json.data.catalog.products[0].id).toBe("bread");
    expect(result.json.data.availability).toEqual({ bread: 20 });
    const serialized = JSON.stringify(result.json.data);
    expect(serialized).not.toContain(shop.ownershipToken);
    expect(serialized).not.toContain(owner.id);
  });
  it("binds checkout capabilities to one checkout and expiry window", async () => {
    const first = await startCheckout(),
      second = await startCheckout();
    expect(verifyCheckoutAccess(first.checkout.id, first.token)).toBe(true);
    expect(verifyCheckoutAccess(second.checkout.id, first.token)).toBe(false);
    expect(
      verifyCheckoutAccess(
        first.checkout.id,
        checkoutAccessToken(first.checkout.id, Date.now() - 8 * 86400000),
      ),
    ).toBe(false);
    expect(
      verifyCheckoutAccess(
        first.checkout.id,
        checkoutAccessToken(first.checkout.id, Date.now() + 120000),
      ),
    ).toBe(false);
    expect(
      (await request("GET", ["checkouts", first.checkout.id])).response.status,
    ).toBe(401);
    expect(
      (
        await request("GET", ["checkouts", first.checkout.id], undefined, {
          query: `access=${encodeURIComponent(first.token)}`,
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request("GET", ["checkouts", second.checkout.id], undefined, {
          query: `access=${encodeURIComponent(first.token)}`,
        })
      ).response.status,
    ).toBe(401);
    expect(
      (
        await request("GET", ["checkouts", first.checkout.id], undefined, {
          session: "intruder",
        })
      ).response.status,
    ).toBe(404);
    expect(
      (
        await request("GET", ["checkouts", first.checkout.id], undefined, {
          session: "owner",
        })
      ).response.status,
    ).toBe(200);
  });
  it("a manufactured return or cross-origin capture cannot substitute for PayPal approval", async () => {
    const started = await startCheckout();
    const returned = await request(
      "GET",
      ["checkouts", started.checkout.id],
      undefined,
      { query: `access=${encodeURIComponent(started.token)}&returned=1` },
    );
    expect(returned.json.data.status).toBe("AWAITING_APPROVAL");
    const notApproved = await request(
      "POST",
      ["checkouts", started.checkout.id, "capture"],
      { access: started.token },
    );
    expect(notApproved.json.data.status).toBe("AWAITING_APPROVAL");
    expect(gateway.captureCalls).toBe(0);
    gateway.orders.get(started.checkout.orderId!)!.status = "APPROVED";
    expect(
      (
        await request(
          "POST",
          ["checkouts", started.checkout.id, "capture"],
          { access: started.token },
          { origin: "https://attacker.example" },
        )
      ).response.status,
    ).toBe(403);
    expect(gateway.captureCalls).toBe(0);
  });
  it("buyer capabilities cannot execute owner reconciliation or refund operations", async () => {
    const started = await paidCheckout();
    expect(
      (
        await request("POST", ["checkouts", started.checkout.id, "reconcile"], {
          access: started.token,
        })
      ).response.status,
    ).toBe(401);
    expect(
      (
        await request(
          "POST",
          ["checkouts", started.checkout.id, "refund", "propose"],
          { access: started.token, amountMinor: 300 },
        )
      ).response.status,
    ).toBe(401);
    expect(gateway.refundCalls).toBe(0);
  });
  it("retries owner refund confirmation using the original exact proposal and one provider refund", async () => {
    const started = await paidCheckout();
    const proposal = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "propose"],
      { amountMinor: 300 },
      { session: "owner" },
    );
    expect(proposal.response.status).toBe(200);
    const approval = proposal.json.data as RefundApproval;
    const first = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "confirm"],
      { approvalId: approval.id },
      { session: "owner" },
    );
    expect(first.response.status).toBe(200);
    expect(first.json.data.refundedMinor).toBe(300);
    const retry = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "confirm"],
      { approvalId: approval.id },
      { session: "owner" },
    );
    expect(retry.response.status).toBe(200);
    expect(retry.json.data.refundedMinor).toBe(300);
    expect(gateway.refundCalls).toBe(1);
    const changed = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "confirm"],
      { approvalId: approval.id, amountMinor: 700 },
      { session: "owner" },
    );
    expect(changed.response.status).toBe(400);
    expect(gateway.refundCalls).toBe(1);
  });
  it("replaying an old partial-refund confirmation never downgrades a later full refund", async () => {
    const started = await paidCheckout();
    const proposal = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "propose"],
      { amountMinor: 300 },
      { session: "owner" },
    );
    const input = { approvalId: proposal.json.data.id };
    expect(
      (
        await request(
          "POST",
          ["checkouts", started.checkout.id, "refund", "confirm"],
          input,
          { session: "owner" },
        )
      ).json.data.status,
    ).toBe("PARTIALLY_REFUNDED");
    gateway.captures.get(started.checkout.captureId!)!.status = "REFUNDED";
    const observed = await request(
      "POST",
      ["checkouts", started.checkout.id, "reconcile"],
      {},
      { session: "owner" },
    );
    expect(observed.json.data.status).toBe("REFUNDED");
    expect(observed.json.data.refundedMinor).toBe(1000);
    const replay = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "confirm"],
      input,
      { session: "owner" },
    );
    expect(replay.json.data.status).toBe("REFUNDED");
    expect(replay.json.data.refundedMinor).toBe(1000);
    expect(gateway.refundCalls).toBe(1);
  });
  it("a rejected refund preserves the verified original payment", async () => {
    const started = await paidCheckout();
    const proposal = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "propose"],
      { amountMinor: 300 },
      { session: "owner" },
    );
    gateway.refundError = new PayPalError("PAYPAL_REQUEST_FAILED", false, 422);
    const result = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "confirm"],
      { approvalId: proposal.json.data.id },
      { session: "owner" },
    );
    expect(result.response.status).toBe(200);
    expect(result.json.data.status).toBe("PAID");
    expect(result.json.data.refundedMinor).toBe(0);
    expect(result.json.data.reason).toContain("REFUND_REJECTED");
  });
  it("an order read cannot clear an unresolved refund outcome", async () => {
    const started = await paidCheckout();
    const proposal = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "propose"],
      { amountMinor: 300 },
      { session: "owner" },
    );
    gateway.refundError = new PayPalError(
      "PAYPAL_NETWORK_OR_RESPONSE_ERROR",
      true,
    );
    const result = await request(
      "POST",
      ["checkouts", started.checkout.id, "refund", "confirm"],
      { approvalId: proposal.json.data.id },
      { session: "owner" },
    );
    expect(result.json.data.status).toBe("UNKNOWN");
    const reread = await request(
      "POST",
      ["checkouts", started.checkout.id, "reconcile"],
      {},
      { session: "owner" },
    );
    expect(reread.json.data.status).toBe("UNKNOWN");
    expect(reread.json.data.reason).toBe("REFUND_RESULT_UNCONFIRMED");
  });
  it("a stale completed capture read cannot undo an authenticated reversal", async () => {
    const started = await paidCheckout();
    const capture = gateway.captures.get(started.checkout.captureId!)!;
    capture.status = "REVERSED";
    expect(
      (
        await request(
          "POST",
          ["checkouts", started.checkout.id, "reconcile"],
          {},
          { session: "owner" },
        )
      ).json.data.status,
    ).toBe("REVERSED");
    capture.status = "COMPLETED";
    expect(
      (
        await request(
          "POST",
          ["checkouts", started.checkout.id, "reconcile"],
          {},
          { session: "owner" },
        )
      ).json.data.status,
    ).toBe("REVERSED");
  });
  it("requires owner control, completed rule review and domain proof before publication", async () => {
    await store.set("shops", shop.id, {
      ...shop,
      domainVerified: false,
      publishedVersion: null,
    });
    await store.set("catalogs", catalog.id, {
      ...catalog,
      status: "DRAFT",
      approvedAt: undefined,
      warnings: [
        "UNKNOWN_RULE_LEAD_TIME_HOURS: owner must confirm this rule before approval.",
      ],
    });
    expect(
      (
        await request(
          "POST",
          ["shops", shop.id, "approve"],
          {},
          { session: "intruder" },
        )
      ).response.status,
    ).toBe(404);
    const unconfirmed = await request(
      "POST",
      ["shops", shop.id, "approve"],
      {},
      { session: "owner" },
    );
    expect([400, 409]).toContain(unconfirmed.response.status);
    expect(
      (
        await request(
          "POST",
          ["shops", shop.id, "publish"],
          {},
          { session: "owner" },
        )
      ).response.status,
    ).toBe(409);
    const reviewed = await request(
      "PUT",
      ["shops", shop.id, "catalog"],
      {
        products: catalog.products,
        rules: catalog.rules,
        confirmedRules: ["leadTimeHours"],
      },
      { session: "owner" },
    );
    expect(reviewed.response.status).toBe(200);
    expect(
      (
        await request(
          "POST",
          ["shops", shop.id, "approve"],
          {},
          { session: "owner" },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          ["shops", shop.id, "publish"],
          {},
          { session: "owner" },
        )
      ).response.status,
    ).toBe(409);
    expect(
      (await store.list<{ action: string }>("audit", { shopId: shop.id })).some(
        (row) => row.action === "CATALOG_APPROVED",
      ),
    ).toBe(true);
  });
  it("does not publish an owner stock adjustment that would invalidate a live reservation", async () => {
    await startCheckout(); // two bread are durably held
    const revised = {
      ...catalog,
      id: `${shop.id}:2`,
      version: 2,
      products: [{ ...catalog.products[0], stock: 1 }],
    };
    await store.set("catalogs", revised.id, revised);
    const result = await request(
      "POST",
      ["shops", shop.id, "publish"],
      {},
      { session: "owner" },
    );
    expect(result.response.status).toBe(409);
    expect((await store.get<Shop>("shops", shop.id))!.publishedVersion).toBe(1);
  });
  it("rejects malformed dietary attributes at the owner review boundary", async () => {
    const result = await request(
      "PUT",
      ["shops", shop.id, "catalog"],
      {
        products: [
          { ...catalog.products[0], attributes: { dietary: "not vegan" } },
        ],
        rules: catalog.rules,
      },
      { session: "owner" },
    );
    expect(result.response.status).toBe(400);
  });
});
