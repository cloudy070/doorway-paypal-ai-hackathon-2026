import { describe, expect, it } from "vitest";
import type { Catalog, Shop } from "../src/lib/domain";
import { allowedAlternatives, priceQuote } from "../src/lib/commerce";

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
      priceMinor: 399,
      currency: "GBP",
      stock: 20,
      attributes: { dietary: ["vegan"] },
      allowedAlternatives: ["roll", "unknown"],
    },
    {
      id: "roll",
      name: "Roll",
      description: "Roll",
      priceMinor: 150,
      currency: "GBP",
      stock: 4,
      attributes: { dietary: ["vegan"] },
    },
    {
      id: "unknown",
      name: "Unknown",
      description: "An unverified claim of vegan",
      priceMinor: 150,
      currency: "GBP",
      stock: 4,
      attributes: {},
    },
  ],
  rules: {
    pickupDays: [6],
    leadTimeHours: 12,
    minOrderMinor: 100,
    maxQuantityPerLine: 10,
    bulkDiscount: { minQuantity: 5, percentOff: 10, maxDiscountMinor: 300 },
    deliveryPolicy: "Pickup",
    returnsPolicy: "Contact owner",
  },
};
const now = new Date("2026-10-23T12:00:00Z");
const options = { pickupDate: "2026-10-24", dietary: ["vegan"] };

describe("server quote and owner house rules", () => {
  it("uses approved integer prices and one server-owned capped bulk rule", () => {
    const quote = priceQuote(
      shop,
      catalog,
      [{ productId: "bread", quantity: 8 }],
      options,
      now,
    );
    expect(quote.subtotalMinor).toBe(3192);
    expect(quote.discountMinor).toBe(300);
    expect(quote.totalMinor).toBe(2892);
    expect(quote.catalogVersion).toBe(1);
    expect(quote.checkedRules).toContain("owner_bulk_discount");
  });
  it("rejects duplicate-line tricks, quantity overflow, and stock overflow", () => {
    expect(() =>
      priceQuote(
        shop,
        catalog,
        [
          { productId: "bread", quantity: 6 },
          { productId: "bread", quantity: 6 },
        ],
        options,
        now,
      ),
    ).toThrow("INVALID_CART_LINE");
    expect(() =>
      priceQuote(
        shop,
        catalog,
        [{ productId: "bread", quantity: 11 }],
        options,
        now,
      ),
    ).toThrow("INVALID_CART_LINE");
    expect(() =>
      priceQuote(
        shop,
        catalog,
        [{ productId: "roll", quantity: 5 }],
        options,
        now,
      ),
    ).toThrow("OUT_OF_STOCK");
  });
  it("enforces pickup day and lead time", () => {
    expect(() =>
      priceQuote(
        shop,
        catalog,
        [{ productId: "bread", quantity: 1 }],
        { pickupDate: "2026-10-23" },
        now,
      ),
    ).toThrow("PICKUP_DAY_UNAVAILABLE");
    expect(() =>
      priceQuote(
        shop,
        catalog,
        [{ productId: "bread", quantity: 1 }],
        options,
        new Date("2026-10-24T08:00:00Z"),
      ),
    ).toThrow("LEAD_TIME_NOT_MET");
  });
  it("never infers dietary safety from product descriptions or substitutes silently", () => {
    expect(() =>
      priceQuote(
        shop,
        catalog,
        [{ productId: "unknown", quantity: 1 }],
        options,
        now,
      ),
    ).toThrow("DIETARY_ATTRIBUTE_UNCONFIRMED");
    expect(
      allowedAlternatives(catalog, catalog.products[0], ["vegan"]),
    ).toEqual([{ productId: "roll", name: "Roll" }]);
    expect(
      allowedAlternatives(catalog, catalog.products[0], ["gluten-free"]),
    ).toEqual([]);
  });
  it("rejects unsupported currency and invalid calendar dates", () => {
    expect(() =>
      priceQuote(
        { ...shop, currency: "JPY" },
        catalog,
        [{ productId: "bread", quantity: 1 }],
        options,
        now,
      ),
    ).toThrow("UNSUPPORTED_CURRENCY");
    expect(() =>
      priceQuote(
        shop,
        catalog,
        [{ productId: "bread", quantity: 1 }],
        { pickupDate: "2026-02-31" },
        now,
      ),
    ).toThrow("INVALID_PICKUP_DATE");
  });
});
