import { randomUUID, timingSafeEqual } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";
import { getStore } from "@/lib/db";
import { AppError, invariant } from "@/lib/errors";
import {
  register,
  login,
  publicUser,
  createSession,
  sessionHeader,
  getUser,
  requireUser,
  ownShop,
  checkOrigin,
  rateLimit,
  cookieToken,
  hashToken,
} from "@/lib/auth";
import {
  appUrl,
  createShop,
  latestCatalog,
  writeDraft,
  resolveShop,
  approveCatalog,
  productSchema,
  rulesSchema,
  escapeHtml,
} from "@/lib/shops";
import type { Shop, Catalog, AgentRun, Product } from "@/lib/domain";
import type { Checkout, RefundApproval } from "@/lib/domain-commerce";
import { CommerceError } from "@/lib/domain-commerce";
import { publicCommerceDetails } from "@/lib/public-errors";
import { importCatalog } from "@/lib/importer";
import { runStorePreflight } from "@/lib/ai";
import { safeFetchText, UrlSecurityError } from "@/lib/url-security";
import { getCommerceCatalog, createQuote } from "@/lib/commerce";
import {
  initializeCatalogInventory,
  setInventoryStock,
  inventoryAvailability,
} from "@/lib/inventory";
import {
  getPaymentService,
  checkoutAccessToken,
  verifyCheckoutAccess,
} from "@/lib/runtime";
import {
  getReceiptSigner,
  verifyReceipt,
  type SignedReceipt,
} from "@/lib/receipts";
import { PayPalError, type WebhookEvent } from "@/lib/paypal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ok = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(
    { data },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
const credentials = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(12).max(128),
});
async function body(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  invariant(
    length <= 256000,
    "BODY_TOO_LARGE",
    "Request body is too large.",
    413,
  );
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 256000) {
          await reader.cancel();
          throw new AppError(
            "BODY_TOO_LARGE",
            "Request body is too large.",
            413,
          );
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text || "{}") as unknown;
  } catch {
    throw new AppError("INVALID_JSON", "Provide a JSON request body.");
  }
}
const ruleKeys = [
  "pickupDays",
  "leadTimeHours",
  "minOrderMinor",
  "maxQuantityPerLine",
  "deliveryPolicy",
  "returnsPolicy",
] as const;
const warningKey = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
async function audit(
  shopId: string,
  ownerId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  const id = randomUUID();
  await (
    await getStore()
  ).set("audit", id, {
    id,
    shopId,
    ownerId,
    action,
    ...details,
    createdAt: new Date().toISOString(),
  });
}
async function checkoutPermission(
  request: Request,
  id: string,
  input?: unknown,
) {
  const store = await getStore();
  const checkout = await store.get<Checkout>("checkouts", id);
  invariant(checkout, "CHECKOUT_NOT_FOUND", "Checkout not found.", 404);
  const url = new URL(request.url);
  const data = input as Record<string, unknown> | undefined;
  const access =
    data?.access ??
    data?.token ??
    url.searchParams.get("access") ??
    url.searchParams.get("token");
  if (!verifyCheckoutAccess(id, access)) {
    const user = await requireUser(request);
    await ownShop(store, checkout.shopId, user.id);
  }
  return checkout;
}
async function handler(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: p } = await context.params;
    const [root, id, action, sub] = p;
    const method = request.method;
    const store = await getStore();
    rateLimit("api-total", 600);
    if (root === "status" && method === "GET") {
      await store.list("health");
      return ok({
        services: {
          database: true,
          paypal: !!(
            process.env.PAYPAL_CLIENT_ID &&
            process.env.PAYPAL_CLIENT_SECRET &&
            process.env.PAYPAL_MERCHANT_ID
          ),
          ai: !!process.env.ANTHROPIC_API_KEY,
          agStudio: true,
          agStudioLicenceConfigured:
            !!process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY,
          agStudioMode: process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY
            ? "LICENCE_CONFIGURED"
            : "LOCAL_EVALUATION",
        },
        database: process.env.DATABASE_URL
          ? "PostgreSQL"
          : "Embedded PostgreSQL (local development)",
        environment: "PAYPAL_SANDBOX",
        webhookConfigured: !!process.env.PAYPAL_WEBHOOK_ID,
      });
    }
    if (root === "auth") {
      if (id === "me" && method === "GET") {
        const user = await getUser(request);
        return ok({ user: user ? publicUser(user) : null });
      }
      if (method === "POST" && ["register", "login"].includes(id)) {
        checkOrigin(request);
        rateLimit("auth", 20);
        const input = credentials.parse(await body(request));
        const user =
          id === "register"
            ? await register(input.email, input.password)
            : await login(input.email, input.password);
        const token = await createSession(user.id);
        return ok({ user: publicUser(user) }, 200, {
          "Set-Cookie": sessionHeader(token),
        });
      }
      if (id === "logout" && method === "POST") {
        checkOrigin(request);
        const token = cookieToken(request);
        if (token) await store.delete("sessions", hashToken(token));
        return ok({ loggedOut: true }, 200, {
          "Set-Cookie": sessionHeader("", 0),
        });
      }
    }
    if (root === "shops") {
      const user = await requireUser(request);
      if (method !== "GET") checkOrigin(request);
      if (!id && method === "GET")
        return ok(await store.list<Shop>("shops", { ownerId: user.id }));
      if (!id && method === "POST") {
        const input = z
          .strictObject({
            name: z.string().trim().min(2).max(100),
            siteUrl: z.string().max(2048).default(""),
            currency: z.enum(["GBP", "USD", "EUR"]).default("GBP"),
            fixture: z.boolean().optional(),
          })
          .parse(await body(request));
        if (!input.fixture) {
          const target = new URL(input.siteUrl);
          invariant(
            target.protocol === "https:",
            "HTTPS_REQUIRED",
            "A real store needs a public HTTPS website.",
          );
        }
        return ok(await createShop(store, user.id, input), 201);
      }
      const shop = await ownShop(store, id, user.id);
      if (!action && method === "GET") {
        const runs = await store.list<AgentRun>("runs", { shopId: id });
        return ok({
          shop,
          catalog: await latestCatalog(store, id),
          orders: await store.list<Checkout>("checkouts", { shopId: id }),
          runs,
          unmetIntents: await store.list("unmetIntents", { shopId: id }),
        });
      }
      if (action === "connect-paypal" && method === "POST") {
        const merchantId = process.env.PAYPAL_MERCHANT_ID?.trim();
        invariant(
          merchantId &&
            process.env.PAYPAL_CLIENT_ID &&
            process.env.PAYPAL_CLIENT_SECRET,
          "PAYPAL_NOT_CONFIGURED",
          "Configure a sandbox application and merchant ID on the server before connecting.",
          503,
        );
        invariant(
          /^[A-Za-z0-9]{3,64}$/.test(merchantId),
          "INVALID_MERCHANT_CONFIGURATION",
          "The configured sandbox merchant ID is invalid.",
          503,
        );
        const connected = await store.transaction(async (tx) => {
          const current = await ownShop(tx, id, user.id);
          invariant(
            !current.paypalMerchantId ||
              current.paypalMerchantId === merchantId,
            "MERCHANT_REBIND_REQUIRES_ONBOARDING",
            "This shop already binds another recipient. Create and review a new shop rather than silently replacing its payee.",
            409,
          );
          const result = { ...current, paypalMerchantId: merchantId };
          await tx.set("shops", id, result);
          return result;
        });
        await audit(id, user.id, "SANDBOX_RECIPIENT_BOUND", {
          merchantId,
          verification: "SERVER_CONFIGURATION_ONLY",
        });
        return ok(connected);
      }
      if (action === "import" && method === "POST") {
        rateLimit("import:" + user.id, 5);
        const input = z
          .strictObject({ url: z.string().url().optional() })
          .parse(await body(request));
        const url = input.url || shop.siteUrl;
        invariant(
          !shop.fixture,
          "FIXTURE_IMPORT_UNAVAILABLE",
          "The fixture is pre-seeded and labeled synthetic. Use a public HTTPS store for real AI extraction.",
        );
        invariant(
          new URL(url).origin === new URL(shop.siteUrl).origin,
          "IMPORT_DOMAIN_MISMATCH",
          "Import only the shop domain you will verify.",
        );
        const result = await importCatalog({ url, shopId: id });
        invariant(
          new URL(result.sourceUrl).origin === new URL(shop.siteUrl).origin,
          "IMPORT_REDIRECT_DOMAIN",
          "The import redirected to another domain; create and verify that shop instead.",
        );
        return ok(await writeDraft(store, shop, result));
      }
      if (action === "catalog" && method === "PUT") {
        const previous = await latestCatalog(store, id);
        invariant(
          previous,
          "CATALOG_REQUIRED",
          "Import or create a draft first.",
        );
        const input = z
          .strictObject({
            products: z.array(productSchema).max(100),
            rules: rulesSchema,
            confirmedRules: z.array(z.enum(ruleKeys)).default([]),
          })
          .parse(await body(request));
        const warnings = previous.warnings.filter(
          (w) =>
            !input.confirmedRules.some((key) =>
              new RegExp(
                "^(UNKNOWN|CONFLICT)_RULE_" + warningKey(key) + ":",
              ).test(w),
            ),
        );
        const fieldEvidence = structuredClone(previous.fieldEvidence || {});
        const ruleEvidence = (fieldEvidence.rules || {}) as Record<
          string,
          unknown
        >;
        for (const key of input.confirmedRules)
          ruleEvidence[key] = {
            previous: ruleEvidence[key],
            status: "owner_confirmed",
            value: input.rules[key],
            ownerId: user.id,
            confirmedAt: new Date().toISOString(),
          };
        fieldEvidence.rules = ruleEvidence;
        const draft = await writeDraft(store, shop, {
          ...previous,
          ...input,
          warnings,
          fieldEvidence,
        });
        await audit(id, user.id, "DRAFT_REVIEWED", {
          catalogId: draft.id,
          confirmedRules: input.confirmedRules,
        });
        return ok(draft);
      }
      if (action === "approve" && method === "POST")
        return ok(await approveCatalog(store, shop));
      if (action === "verify" && method === "POST") {
        let html: string;
        if (shop.fixture) {
          invariant(
            shop.siteUrl === `${appUrl()}/api/demo/site/${id}`,
            "INVALID_FIXTURE",
            "Invalid fixture route.",
          );
          html = demoSite(shop, await latestCatalog(store, id));
        } else {
          const page = await safeFetchText(shop.siteUrl, {
            maxBytes: 200000,
            timeoutMs: 10000,
            maxRedirects: 2,
            allowedOrigin: new URL(shop.siteUrl).origin,
          });
          html = page.text;
        }
        const $ = load(html);
        const proof = $('meta[name="doorway-verification"]').attr("content");
        invariant(
          proof === shop.ownershipToken,
          "DOMAIN_PROOF_MISSING",
          "Add the exact Doorway verification meta tag to your website, then retry.",
          422,
        );
        const updated = await store.transaction(async (tx) => {
          const current = await ownShop(tx, id, user.id);
          invariant(
            current.ownershipToken === proof &&
              current.siteUrl === shop.siteUrl,
            "DOMAIN_CHANGED",
            "The website changed during verification; retry.",
            409,
          );
          const result = {
            ...current,
            domainVerified: true,
            verifiedAt: new Date().toISOString(),
          };
          await tx.set("shops", id, result);
          return result;
        });
        await audit(
          id,
          user.id,
          shop.fixture ? "LOCAL_FIXTURE_VERIFIED" : "DOMAIN_VERIFIED",
        );
        return ok(updated);
      }
      if (action === "publish" && method === "POST") {
        const published = await store.transaction(async (tx) => {
          const current = await tx.get<Shop>("shops", id);
          invariant(
            current?.domainVerified,
            "DOMAIN_REQUIRED",
            "Verify website control before publishing.",
            409,
          );
          const catalog = await latestCatalog(tx, id);
          invariant(
            catalog?.status === "APPROVED",
            "APPROVAL_REQUIRED",
            "Approve the current catalog before publishing.",
            409,
          );
          const previous = current.publishedVersion
            ? await tx.get<Catalog>(
                "catalogs",
                `${id}:${current.publishedVersion}`,
              )
            : null;
          await initializeCatalogInventory(tx, catalog);
          if (previous)
            for (const product of catalog.products) {
              const old = previous.products.find((p) => p.id === product.id);
              if (old && old.stock !== product.stock)
                await setInventoryStock(tx, id, product.id, product.stock);
            }
          const result = { ...current, publishedVersion: catalog.version };
          await tx.set("shops", id, result);
          return result;
        });
        await audit(id, user.id, "CATALOG_PUBLISHED", {
          version: published.publishedVersion,
        });
        return ok(published);
      }
      if (action === "preflight" && method === "POST") {
        rateLimit("preflight:" + user.id, 8);
        const input = z
          .strictObject({ intent: z.string().trim().min(3).max(1000) })
          .parse(await body(request));
        const catalog = await latestCatalog(store, id);
        invariant(catalog, "CATALOG_REQUIRED", "Create a catalog first.");
        const runId = randomUUID();
        const run: AgentRun = {
          id: runId,
          shopId: id,
          ownerId: user.id,
          intent: input.intent,
          kind: "PREFLIGHT",
          source: "LOCAL_VALIDATION",
          status: "RUNNING",
          findings: [],
          steps: [],
          catalogVersion: catalog.version,
          createdAt: new Date().toISOString(),
        };
        await store.set("runs", runId, run);
        try {
          const result = await runStorePreflight({
            shop,
            catalog,
            ownerId: user.id,
            intent: input.intent,
          });
          const complete = { ...run, ...result };
          await store.set("runs", runId, complete);
          return ok(complete);
        } catch (error) {
          await store.set("runs", runId, {
            ...run,
            status: "FAILED",
            findings: [
              {
                code:
                  error instanceof AppError ? error.code : "PREFLIGHT_FAILED",
                message: "Preflight did not complete; no payment was created.",
              },
            ],
          });
          throw error;
        }
      }
    }
    if (root === "store") {
      const shop = await resolveShop(store, id);
      invariant(shop, "SHOP_NOT_FOUND", "Store not found.", 404);
      const { catalog } = await getCommerceCatalog(store, shop.id);
      if (!action && method === "GET")
        return ok({
          shop: {
            id: shop.id,
            slug: shop.slug,
            name: shop.name,
            currency: shop.currency,
            fixture: shop.fixture,
            domainVerified: shop.domainVerified,
            publishedVersion: shop.publishedVersion,
          },
          catalog: {
            id: catalog.id,
            shopId: catalog.shopId,
            version: catalog.version,
            status: catalog.status,
            products: catalog.products,
            rules: catalog.rules,
            source: catalog.source,
            approvedAt: catalog.approvedAt,
            warnings: catalog.warnings,
          },
          availability: await inventoryAvailability(store, catalog),
        });
      if (action === "quote" && method === "POST") {
        checkOrigin(request);
        const input = z
          .strictObject({
            lines: z
              .array(
                z.strictObject({
                  productId: z.string().min(1).max(100),
                  quantity: z.number().int().min(1).max(1000),
                }),
              )
              .min(1)
              .max(50),
            pickupDate: z.string().optional(),
            dietary: z.array(z.string()).optional(),
          })
          .parse(await body(request));
        try {
          return ok(
            await createQuote(store, shop.id, input.lines, {
              pickupDate:
                input.pickupDate || new Date().toISOString().slice(0, 10),
              dietary: input.dietary,
            }),
          );
        } catch (error) {
          const eventId = randomUUID();
          await store.set("unmetIntents", eventId, {
            id: eventId,
            shopId: shop.id,
            createdAt: new Date().toISOString(),
            source: "LOCAL_VALIDATION",
            kind: "REJECTED_QUOTE",
            code:
              error instanceof CommerceError ? error.code : "INVALID_REQUEST",
            requestedProductIds: input.lines.map((l) => l.productId),
            message:
              "An observed quote request was rejected. This is not lost revenue or validated buyer demand.",
          });
          throw error;
        }
      }
      if (action === "checkout" && method === "POST") {
        checkOrigin(request);
        const input = z
          .strictObject({ quoteId: z.string().min(1).max(200) })
          .parse(await body(request));
        const checkout = await (
          await getPaymentService()
        ).startCheckout(shop.id, input.quoteId);
        const access = checkoutAccessToken(checkout.id);
        return ok({
          checkout,
          approvalUrl: checkout.approvalUrl,
          token: access,
          access,
        });
      }
    }
    if (root === "checkouts") {
      const input = method === "POST" ? await body(request) : undefined;
      if (method === "POST") checkOrigin(request);
      const checkout = await checkoutPermission(request, id, input);
      if (!action && method === "GET") return ok(checkout);
      if (action === "capture" && method === "POST")
        return ok(
          await (await getPaymentService()).capture(checkout.shopId, id),
        );
      const user = await requireUser(request);
      await ownShop(store, checkout.shopId, user.id);
      if (action === "reconcile" && method === "POST")
        return ok(await (await getPaymentService()).reconcile(id));
      if (action === "refund" && sub === "propose" && method === "POST") {
        const data = z
          .strictObject({ amountMinor: z.number().int().positive() })
          .parse(input);
        invariant(
          data.amountMinor <=
            checkout.quote.totalMinor - checkout.refundedMinor,
          "REFUND_TOO_LARGE",
          "Refund exceeds the remaining captured amount.",
        );
        const approval: RefundApproval = {
          id: randomUUID(),
          shopId: checkout.shopId,
          checkoutId: id,
          ownerId: user.id,
          amountMinor: data.amountMinor,
          currency: checkout.quote.currency,
          confirmedAt: "",
        };
        await store.set("refundProposals", approval.id, approval);
        return ok(approval);
      }
      if (action === "refund" && sub === "confirm" && method === "POST") {
        const data = z
          .strictObject({ approvalId: z.string().min(1) })
          .parse(input);
        const proposal = await store.get<RefundApproval>(
          "refundProposals",
          data.approvalId,
        );
        invariant(
          proposal &&
            proposal.ownerId === user.id &&
            proposal.checkoutId === id,
          "REFUND_PROPOSAL_NOT_FOUND",
          "Refund proposal not found.",
          404,
        );
        const service = await getPaymentService();
        let approval = await store.get<RefundApproval>(
          "refundConfirmations",
          proposal.id,
        );
        if (!approval) {
          approval = await service.approveRefund(
            checkout.shopId,
            user.id,
            id,
            proposal.amountMinor,
          );
          await store.set("refundConfirmations", proposal.id, {
            ...approval,
            id: proposal.id,
            serviceApprovalId: approval.id,
          });
        }
        const serviceId =
          (approval as RefundApproval & { serviceApprovalId?: string })
            .serviceApprovalId || approval.id;
        await audit(checkout.shopId, user.id, "REFUND_CONFIRMED", {
          checkoutId: id,
          amountMinor: proposal.amountMinor,
          currency: proposal.currency,
        });
        return ok(await service.refund(checkout.shopId, serviceId));
      }
    }
    if (root === "receipts" && id && method === "GET") {
      const receipt = await store.get<SignedReceipt>("receipts", id);
      invariant(receipt, "RECEIPT_NOT_FOUND", "Receipt not found.", 404);
      return ok({
        receipt,
        valid: verifyReceipt(receipt, getReceiptSigner().publicKey),
      });
    }
    if (root === "paypal" && id === "webhook" && method === "POST") {
      const event = z
        .object({ id: z.string().min(1), event_type: z.string().min(1) })
        .passthrough()
        .parse(await body(request)) as WebhookEvent;
      return ok(
        await (
          await getPaymentService()
        ).handleWebhook(Object.fromEntries(request.headers), event),
      );
    }
    if (root === "internal" && id === "reconcile" && method === "POST") {
      const secret = process.env.RECONCILE_SECRET;
      const actual = Buffer.from(request.headers.get("authorization") || "");
      const expected = Buffer.from("Bearer " + (secret || ""));
      invariant(
        secret &&
          actual.length === expected.length &&
          timingSafeEqual(actual, expected),
        "WORKER_UNAUTHORIZED",
        "Worker authentication required.",
        401,
      );
      return ok(await (await getPaymentService()).reconcilePending());
    }
    if (root === "demo" && id === "site" && action && method === "GET") {
      const shop = await store.get<Shop>("shops", action);
      invariant(
        shop?.fixture,
        "FIXTURE_NOT_FOUND",
        "Demonstration store not found.",
        404,
      );
      return new Response(demoSite(shop, await latestCatalog(store, shop.id)), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    throw new AppError("NOT_FOUND", "API route not found.", 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .slice(0, 4)
              .join("; "),
          },
        },
        { status: 400 },
      );
    if (error instanceof AppError || error instanceof CommerceError)
      return Response.json(
        {
          error: {
            code: error.code,
            message:
              error instanceof CommerceError
                ? error.code.replaceAll("_", " ")
                : error.message,
            details:
              error instanceof CommerceError
                ? publicCommerceDetails(error.details)
                : undefined,
          },
        },
        { status: error.status },
      );
    if (error instanceof UrlSecurityError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: 422 },
      );
    if (error instanceof PayPalError)
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.ambiguous
              ? "The provider result is uncertain. Reconcile the existing checkout; do not create another payment."
              : "PayPal could not complete the request.",
          },
        },
        { status: 502 },
      );
    console.error("API request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            "The request could not complete. No successful payment is implied.",
        },
      },
      { status: 500 },
    );
  }
}
function demoSite(shop: Shop, catalog: Catalog | null) {
  const products = catalog?.products || [];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="doorway-verification" content="${escapeHtml(shop.ownershipToken)}"><title>${escapeHtml(shop.name)} — fictional sandbox bakery</title><style>body{font:18px system-ui;background:#fff8ec;color:#142e30;max-width:960px;margin:60px auto;padding:24px}article{border-top:1px solid #c7c9bd;padding:20px 0}a{color:#007d70}small{background:#f9d983;padding:8px}</style></head><body><small>SYNTHETIC — fictional merchant; PayPal sandbox only</small><h1>${escapeHtml(shop.name)}</h1><p>A quiet corner for Saturday bread.</p>${products.map((p: Product) => `<article><h2>${escapeHtml(p.name)}</h2><p>${escapeHtml(p.description)}</p><b>${(p.priceMinor / 100).toFixed(2)} ${escapeHtml(p.currency)}</b><p>Stock: ${p.stock}. ${escapeHtml((p.attributes.dietary || []).join(", "))}</p></article>`).join("")}<h2>House rules</h2><p>Saturday pickup only. Zero hours lead time. No minimum order. Maximum 20 items per line. Bulk order 5+ items: 10% discount.</p><p>${escapeHtml(catalog?.rules.deliveryPolicy || "Collect from the shop.")}</p><p>${escapeHtml(catalog?.rules.returnsPolicy || "Contact the owner for a refund.")}</p><a href="/store/${encodeURIComponent(shop.slug)}">Open normal storefront checkout</a><p>This controlled fixture proof is not external domain verification, merchant identity verification, or PayPal ownership verification.</p></body></html>`;
}
export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
