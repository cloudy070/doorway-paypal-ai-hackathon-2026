import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Store } from "./db";
import {
  defaultRules,
  type Shop,
  type Catalog,
  type Product,
  type Rules,
} from "./domain";
import { invariant } from "./errors";
export const appUrl = () => process.env.APP_URL || "http://127.0.0.1:3000";
export const rulesSchema = z.object({
  pickupDays: z.array(z.number().int().min(0).max(6)).min(1),
  leadTimeHours: z.number().min(0).max(720),
  minOrderMinor: z.number().int().min(0).max(10000000),
  maxQuantityPerLine: z.number().int().min(1).max(1000),
  bulkDiscount: z
    .object({
      minQuantity: z.number().int().min(2),
      percentOff: z.number().int().min(0).max(90),
      maxDiscountMinor: z.number().int().min(0).optional(),
    })
    .optional(),
  deliveryPolicy: z.string().min(5).max(2000),
  returnsPolicy: z.string().min(5).max(2000),
});
export const productSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(160),
  description: z.string().max(4000),
  priceMinor: z.number().int().min(0).max(10000000),
  currency: z.enum(["GBP", "USD", "EUR"]),
  stock: z.number().int().min(0).max(1000000),
  attributes: z
    .object({
      dietary: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    })
    .catchall(z.unknown()),
  sources: z
    .array(
      z.object({
        url: z.string(),
        quote: z.string(),
        fetchedAt: z.string().optional(),
      }),
    )
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  issues: z.array(z.string()).optional(),
  allowedAlternatives: z.array(z.string()).optional(),
});
export async function latestCatalog(store: Store, shopId: string) {
  const rows = await store.list<Catalog>("catalogs", { shopId });
  return rows.sort((a, b) => b.version - a.version)[0] ?? null;
}
export async function writeDraft(
  store: Store,
  shop: Shop,
  data: Pick<
    Catalog,
    "products" | "rules" | "sources" | "warnings" | "source"
  > &
    Partial<Catalog>,
) {
  return store.transaction(async (tx) => {
    await tx.get("shops", shop.id);
    const previous = await latestCatalog(tx, shop.id);
    const version = (previous?.version || 0) + 1;
    const catalog: Catalog = {
      ...data,
      id: `${shop.id}:${version}`,
      shopId: shop.id,
      version,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
    };
    delete catalog.approvedAt;
    await tx.set("catalogs", catalog.id, catalog);
    return catalog;
  });
}
export async function createShop(
  store: Store,
  ownerId: string,
  input: { name: string; siteUrl: string; currency: string; fixture?: boolean },
) {
  const id = randomUUID();
  const fixture = !!input.fixture;
  const shop: Shop = {
    id,
    ownerId,
    slug:
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) +
      "-" +
      id.slice(0, 6),
    name: input.name,
    siteUrl: fixture ? `${appUrl()}/api/demo/site/${id}` : input.siteUrl,
    currency: input.currency,
    paypalMerchantId: process.env.PAYPAL_MERCHANT_ID || "",
    ownershipToken: randomBytes(24).toString("base64url"),
    domainVerified: false,
    publishedVersion: null,
    createdAt: new Date().toISOString(),
    fixture,
  };
  await store.transaction(async (tx) => {
    await tx.set("shops", id, shop);
    await tx.set("slugs", shop.slug, { id: shop.slug, shopId: id });
  });
  if (fixture)
    await writeDraft(store, shop, {
      products: fixtureProducts(shop.currency),
      rules: {
        ...defaultRules,
        pickupDays: [6],
        bulkDiscount: { minQuantity: 5, percentOff: 10 },
      },
      sources: [
        {
          url: shop.siteUrl,
          quote: "Fictional demonstration catalog created by Doorway.",
        },
      ],
      warnings: [
        "FICTIONAL_DEMO_STORE — these are synthetic products, not a real merchant pilot.",
      ],
      source: "SYNTHETIC",
    });
  return shop;
}
export async function resolveShop(store: Store, slugOrId: string) {
  const direct = await store.get<Shop>("shops", slugOrId);
  if (direct) return direct;
  const alias = await store.get<{ shopId: string }>("slugs", slugOrId);
  return alias ? store.get<Shop>("shops", alias.shopId) : null;
}
export async function approveCatalog(store: Store, shop: Shop) {
  return store.transaction(async (tx) => {
    await tx.get("shops", shop.id);
    const catalog = await latestCatalog(tx, shop.id);
    invariant(catalog, "CATALOG_REQUIRED", "Import or create a catalog first.");
    invariant(
      catalog.products.length > 0,
      "EMPTY_CATALOG",
      "Add at least one product.",
    );
    invariant(
      !catalog.warnings.some((w) => /^(UNKNOWN|CONFLICT)_RULE_/.test(w)),
      "UNRESOLVED_RULES",
      "Explicitly review unknown and conflicting rules before approval.",
    );
    const ids = new Set<string>();
    for (const p of catalog.products) {
      productSchema.parse(p);
      invariant(
        !ids.has(p.id),
        "DUPLICATE_PRODUCT",
        "Every product needs a unique ID.",
      );
      ids.add(p.id);
      invariant(
        p.currency === shop.currency && p.priceMinor > 0,
        "INVALID_PRICE",
        "Every product needs a confirmed positive price in the shop currency.",
      );
      invariant(
        !p.issues?.length,
        "UNRESOLVED_FIELDS",
        `Review ${p.name}: ${p.issues?.join(", ")}.`,
      );
    }
    rulesSchema.parse(catalog.rules);
    const approved: Catalog = {
      ...catalog,
      status: "APPROVED",
      approvedAt: new Date().toISOString(),
    };
    await tx.set("catalogs", catalog.id, approved);
    const auditId = randomUUID();
    await tx.set("audit", auditId, {
      id: auditId,
      shopId: shop.id,
      ownerId: shop.ownerId,
      action: "CATALOG_APPROVED",
      catalogId: catalog.id,
      createdAt: approved.approvedAt,
    });
    return approved;
  });
}
export function fixtureProducts(currency: string): Product[] {
  return [
    {
      id: "gluten-free-loaf",
      name: "Saturday gluten-free loaf",
      description:
        "A fictional bakery loaf for the sandbox demonstration. Saturday collection.",
      priceMinor: 650,
      currency,
      stock: 12,
      attributes: { dietary: ["gluten-free"] },
      issues: [],
    },
    {
      id: "sourdough",
      name: "Country sourdough",
      description:
        "Slow-fermented, golden crust. Fictional demonstration product.",
      priceMinor: 520,
      currency,
      stock: 18,
      attributes: {},
      issues: [],
    },
    {
      id: "cinnamon-bun",
      name: "Cinnamon bun",
      description:
        "Brown sugar, cinnamon, soft dough. Fictional demonstration product.",
      priceMinor: 320,
      currency,
      stock: 24,
      attributes: {},
      issues: [],
    },
    {
      id: "olive-focaccia",
      name: "Olive focaccia",
      description: "Olive oil and rosemary. Fictional demonstration product.",
      priceMinor: 490,
      currency,
      stock: 8,
      attributes: {},
      issues: [],
    },
  ];
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
