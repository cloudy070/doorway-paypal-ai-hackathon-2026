import { randomUUID } from "node:crypto";
import type { Store } from "./db";
import type { Catalog, Product, Shop } from "./domain";
import {
  CommerceError,
  type CartLineInput,
  type Quote,
} from "./domain-commerce";
import { PILOT_CURRENCIES } from "./paypal";
import { inventoryAvailability } from "./inventory";
export { CommerceError } from "./domain-commerce";
export type { Quote, CartLineInput } from "./domain-commerce";

export type QuoteOptions = {
  pickupDate: string;
  dietary?: string[];
  preview?: boolean;
  now?: Date;
};

export async function getCommerceCatalog(
  store: Store,
  shopId: string,
  preview = false,
): Promise<{ shop: Shop; catalog: Catalog }> {
  const shop = await store.get<Shop>("shops", shopId);
  if (!shop) throw new CommerceError("SHOP_NOT_FOUND", 404);
  const catalogs = await store.list<Catalog>("catalogs", { shopId });
  const catalog = preview
    ? catalogs.sort((a, b) => b.version - a.version)[0]
    : catalogs.find(
        (item) =>
          item.version === shop.publishedVersion &&
          item.status === "APPROVED" &&
          item.approvedAt,
      );
  if (!preview && (!shop.domainVerified || !shop.publishedVersion))
    throw new CommerceError("SHOP_NOT_PUBLISHED", 403);
  if (!catalog) throw new CommerceError("CATALOG_NOT_AVAILABLE", 409);
  return { shop, catalog };
}

export async function searchProducts(
  store: Store,
  shopId: string,
  query: string,
  options: { preview?: boolean; dietary?: string[] } = {},
): Promise<Product[]> {
  if (typeof query !== "string" || query.length > 300)
    throw new CommerceError("INVALID_SEARCH", 400);
  const { catalog } = await getCommerceCatalog(store, shopId, options.preview);
  const availability = options.preview
    ? undefined
    : await inventoryAvailability(store, catalog);
  const terms = query.toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
  return catalog.products
    .filter(
      (product) =>
        terms.every((term) =>
          `${product.name} ${product.description}`
            .toLocaleLowerCase("en")
            .includes(term),
        ) &&
        (options.dietary ?? []).every((label) =>
          confirmedDietary(product).includes(label),
        ),
    )
    .slice(0, 30)
    .map((product) => ({
      ...product,
      stock: availability?.[product.id] ?? product.stock,
    }));
}

export async function createQuote(
  store: Store,
  shopId: string,
  inputs: CartLineInput[],
  options: QuoteOptions,
): Promise<Quote> {
  return store.transaction(async (tx) => {
    const { shop, catalog } = await getCommerceCatalog(
      tx,
      shopId,
      options.preview,
    );
    const now = options.now ?? new Date();
    const availability = options.preview
      ? undefined
      : await inventoryAvailability(tx, catalog);
    const pricedCatalog = availability
      ? {
          ...catalog,
          products: catalog.products.map((product) => ({
            ...product,
            stock: availability[product.id] ?? 0,
          })),
        }
      : catalog;
    const quote = priceQuote(shop, pricedCatalog, inputs, options, now);
    // Preview is read-only and cannot produce a checkout-capable saved quote.
    if (!options.preview) await tx.set("quotes", quote.id, quote);
    return quote;
  });
}

export function priceQuote(
  shop: Shop,
  catalog: Catalog,
  inputs: CartLineInput[],
  options: QuoteOptions,
  now = new Date(),
): Quote {
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 30)
    throw new CommerceError("INVALID_CART", 400);
  if (!(PILOT_CURRENCIES as readonly string[]).includes(shop.currency))
    throw new CommerceError("UNSUPPORTED_CURRENCY", 400);
  const rules = catalog.rules;
  if (
    !Array.isArray(rules.pickupDays) ||
    !rules.pickupDays.length ||
    rules.pickupDays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    !Number.isFinite(rules.leadTimeHours) ||
    rules.leadTimeHours < 0 ||
    rules.leadTimeHours > 8760 ||
    !Number.isSafeInteger(rules.minOrderMinor) ||
    rules.minOrderMinor < 0 ||
    !Number.isSafeInteger(rules.maxQuantityPerLine) ||
    rules.maxQuantityPerLine < 1 ||
    rules.maxQuantityPerLine > 1000
  )
    throw new CommerceError("INVALID_HOUSE_RULE", 409);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.pickupDate))
    throw new CommerceError("INVALID_PICKUP_DATE", 400);
  const pickup = new Date(`${options.pickupDate}T12:00:00.000Z`);
  if (
    !Number.isFinite(pickup.getTime()) ||
    pickup.toISOString().slice(0, 10) !== options.pickupDate
  )
    throw new CommerceError("INVALID_PICKUP_DATE", 400);
  if (!catalog.rules.pickupDays.includes(pickup.getUTCDay()))
    throw new CommerceError("PICKUP_DAY_UNAVAILABLE", 409, {
      allowedDays: catalog.rules.pickupDays,
    });
  if (pickup.getTime() < now.getTime() + catalog.rules.leadTimeHours * 3600000)
    throw new CommerceError("LEAD_TIME_NOT_MET", 409);
  const seen = new Set<string>();
  const lines = inputs.map((input) => {
    if (
      !input ||
      typeof input.productId !== "string" ||
      !Number.isSafeInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > catalog.rules.maxQuantityPerLine ||
      seen.has(input.productId)
    )
      throw new CommerceError("INVALID_CART_LINE", 400);
    seen.add(input.productId);
    const product = catalog.products.find(
      (item) => item.id === input.productId,
    );
    if (!product) throw new CommerceError("PRODUCT_NOT_FOUND", 404);
    if (
      product.currency !== shop.currency ||
      !Number.isSafeInteger(product.priceMinor) ||
      product.priceMinor <= 0 ||
      !Number.isSafeInteger(product.stock) ||
      product.stock < 0
    )
      throw new CommerceError("PRODUCT_DATA_UNCONFIRMED", 409);
    if (input.quantity > product.stock)
      throw new CommerceError("OUT_OF_STOCK", 409, {
        productId: product.id,
        alternatives: allowedAlternatives(catalog, product, options.dietary),
      });
    if (
      !(options.dietary ?? []).every((label) =>
        confirmedDietary(product).includes(label),
      )
    )
      throw new CommerceError("DIETARY_ATTRIBUTE_UNCONFIRMED", 409, {
        productId: product.id,
        alternatives: allowedAlternatives(catalog, product, options.dietary),
      });
    const lineTotalMinor = product.priceMinor * input.quantity;
    if (!Number.isSafeInteger(lineTotalMinor))
      throw new CommerceError("CART_TOTAL_OVERFLOW", 400);
    return {
      productId: product.id,
      name: product.name,
      quantity: input.quantity,
      unitPriceMinor: product.priceMinor,
      lineTotalMinor,
    };
  });
  const subtotalMinor = lines.reduce(
    (sum, line) => sum + line.lineTotalMinor,
    0,
  );
  if (!Number.isSafeInteger(subtotalMinor))
    throw new CommerceError("CART_TOTAL_OVERFLOW", 400);
  let discountMinor = 0;
  const rule = catalog.rules.bulkDiscount;
  const checkedRules = [
    "published_catalog_version",
    "confirmed_price_and_stock",
    "pickup_day",
    "lead_time",
    "quantity_limit",
    "minimum_order",
  ];
  if (rule) {
    if (
      !Number.isSafeInteger(rule.minQuantity) ||
      rule.minQuantity < 1 ||
      !Number.isSafeInteger(rule.percentOff) ||
      rule.percentOff < 0 ||
      rule.percentOff > 90 ||
      (rule.maxDiscountMinor !== undefined &&
        (!Number.isSafeInteger(rule.maxDiscountMinor) ||
          rule.maxDiscountMinor < 0))
    )
      throw new CommerceError("INVALID_HOUSE_RULE", 409);
    if (
      lines.reduce((sum, line) => sum + line.quantity, 0) >= rule.minQuantity
    ) {
      discountMinor = Math.min(
        Number((BigInt(subtotalMinor) * BigInt(rule.percentOff)) / 100n),
        rule.maxDiscountMinor ?? subtotalMinor,
      );
      checkedRules.push("owner_bulk_discount");
    }
  }
  const totalMinor = subtotalMinor - discountMinor;
  if (totalMinor <= 0 || totalMinor < catalog.rules.minOrderMinor)
    throw new CommerceError("MINIMUM_ORDER_NOT_MET", 409, {
      minimumMinor: catalog.rules.minOrderMinor,
    });
  return {
    id: randomUUID(),
    shopId: shop.id,
    catalogId: catalog.id,
    catalogVersion: catalog.version,
    rulesVersion: catalog.version,
    lines,
    subtotalMinor,
    discountMinor,
    totalMinor,
    currency: shop.currency,
    pickupDate: options.pickupDate,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
    status: "QUOTED",
    checkedRules,
  };
}

export function allowedAlternatives(
  catalog: Catalog,
  product: Product,
  dietary: string[] = [],
): Array<{ productId: string; name: string }> {
  return catalog.products
    .filter(
      (item) =>
        product.allowedAlternatives?.includes(item.id) &&
        item.stock > 0 &&
        item.currency === product.currency &&
        dietary.every((label) => confirmedDietary(item).includes(label)),
    )
    .map((item) => ({ productId: item.id, name: item.name }));
}
function confirmedDietary(product: Product): string[] {
  const value = product.attributes?.dietary;
  return Array.isArray(value) &&
    value.every((label) => typeof label === "string")
    ? value
    : [];
}

export const createCart = createQuote;

/** Reprice at checkout, without silently changing the immutable buyer quote. */
export async function validateCheckoutQuote(
  tx: Store,
  quote: Quote,
  now: Date,
): Promise<Shop> {
  const { shop, catalog } = await getCommerceCatalog(tx, quote.shopId);
  if (Date.parse(quote.expiresAt) <= now.getTime())
    throw new CommerceError("QUOTE_EXPIRED");
  if (
    catalog.version !== quote.catalogVersion ||
    catalog.id !== quote.catalogId
  )
    throw new CommerceError("CATALOG_CHANGED_REQUOTE_REQUIRED");
  const availability = await inventoryAvailability(tx, catalog);
  const pricedCatalog = {
    ...catalog,
    products: catalog.products.map((product) => ({
      ...product,
      stock: availability[product.id] ?? 0,
    })),
  };
  const current = priceQuote(
    shop,
    pricedCatalog,
    quote.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    })),
    { pickupDate: quote.pickupDate },
    now,
  );
  if (
    current.totalMinor !== quote.totalMinor ||
    current.discountMinor !== quote.discountMinor ||
    current.currency !== quote.currency ||
    current.lines.some(
      (line, index) =>
        line.unitPriceMinor !== quote.lines[index].unitPriceMinor,
    )
  )
    throw new CommerceError("QUOTE_CHANGED_REQUOTE_REQUIRED");
  if (!shop.paypalMerchantId)
    throw new CommerceError("PAYPAL_MERCHANT_NOT_CONFIGURED", 409);
  return shop;
}
