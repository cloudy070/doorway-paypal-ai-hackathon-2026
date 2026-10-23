import type { Store } from "./db";
import type { Catalog, Shop } from "./domain";
import { CommerceError, type Checkout } from "./domain-commerce";

export type InventoryItem = {
  id: string;
  shopId: string;
  productId: string;
  onHand: number;
  initializedCatalogVersion: number;
  updatedAt: string;
};
export type InventoryReservation = {
  id: string;
  shopId: string;
  checkoutId: string;
  lines: Array<{ productId: string; quantity: number }>;
  status: "HELD" | "COMMITTED" | "EXPIRED" | "RELEASED";
  createdAt: string;
  expiresAt: string;
  captureStartedAt?: string;
  updatedAt: string;
};
const inventoryId = (shopId: string, productId: string) =>
  `stock:${shopId}:${productId}`;
const reservationId = (checkoutId: string) => `reservation:${checkoutId}`;

/** Call inside a transaction. A catalog price edit never replenishes sold inventory. */
export async function initializeCatalogInventory(
  tx: Store,
  catalog: Catalog,
): Promise<void> {
  await tx.get<Shop>("shops", catalog.shopId); // shared per-shop lock, also used for reserve/commit
  for (const product of catalog.products) {
    const id = inventoryId(catalog.shopId, product.id);
    if (await tx.get<InventoryItem>("inventory", id)) continue;
    if (!Number.isSafeInteger(product.stock) || product.stock < 0)
      throw new CommerceError("INVALID_INITIAL_STOCK", 400);
    await tx.set("inventory", id, {
      id,
      shopId: catalog.shopId,
      productId: product.id,
      onHand: product.stock,
      initializedCatalogVersion: catalog.version,
      updatedAt: new Date().toISOString(),
    });
  }
}

/** Exact owner-confirmed physical stock; cannot remove units held by an existing checkout. */
export async function setInventoryStock(
  tx: Store,
  shopId: string,
  productId: string,
  onHand: number,
): Promise<void> {
  await tx.get<Shop>("shops", shopId);
  const id = inventoryId(shopId, productId),
    current = await tx.get<InventoryItem>("inventory", id);
  if (!current || !Number.isSafeInteger(onHand) || onHand < 0)
    throw new CommerceError("INVALID_STOCK_ADJUSTMENT", 400);
  const held = (await tx.list<InventoryReservation>("reservations", { shopId }))
    .filter((item) => item.status === "HELD")
    .reduce(
      (sum, reservation) =>
        sum +
        (reservation.lines.find((line) => line.productId === productId)
          ?.quantity ?? 0),
      0,
    );
  if (onHand < held)
    throw new CommerceError("STOCK_RESERVED_BY_EXISTING_CHECKOUT");
  await tx.set("inventory", id, {
    ...current,
    onHand,
    updatedAt: new Date().toISOString(),
  });
}

/** Expired holds remain unavailable until the reconciler explicitly proves safe release. */
export async function inventoryAvailability(
  store: Store,
  catalog: Catalog,
): Promise<Record<string, number>> {
  const ledgers = await store.list<InventoryItem>("inventory", {
    shopId: catalog.shopId,
  });
  const reservations = (
    await store.list<InventoryReservation>("reservations", {
      shopId: catalog.shopId,
    })
  ).filter((item) => item.status === "HELD");
  return Object.fromEntries(
    catalog.products.map((product) => [
      product.id,
      Math.max(
        0,
        (ledgers.find((item) => item.productId === product.id)?.onHand ??
          product.stock) -
          reservations.reduce(
            (sum, reservation) =>
              sum +
              (reservation.lines.find((line) => line.productId === product.id)
                ?.quantity ?? 0),
            0,
          ),
      ),
    ]),
  );
}

export async function reserveInventory(
  tx: Store,
  checkout: Checkout,
  now: Date,
): Promise<InventoryReservation> {
  await tx.get<Shop>("shops", checkout.shopId);
  const id = reservationId(checkout.id),
    current = await tx.get<InventoryReservation>("reservations", id);
  if (current) return current;
  const catalog = await tx.get<Catalog>("catalogs", checkout.quote.catalogId);
  if (!catalog || catalog.shopId !== checkout.shopId)
    throw new CommerceError("CATALOG_NOT_AVAILABLE");
  await initializeCatalogInventory(tx, catalog);
  const availability = await inventoryAvailability(tx, catalog);
  for (const line of checkout.quote.lines)
    if ((availability[line.productId] ?? 0) < line.quantity)
      throw new CommerceError("OUT_OF_STOCK", 409, {
        productId: line.productId,
      });
  const result: InventoryReservation = {
    id,
    shopId: checkout.shopId,
    checkoutId: checkout.id,
    lines: checkout.quote.lines.map(({ productId, quantity }) => ({
      productId,
      quantity,
    })),
    status: "HELD",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(
      Math.min(now.getTime() + 3 * 60000, Date.parse(checkout.quote.expiresAt)),
    ).toISOString(),
  };
  await tx.set("reservations", id, result);
  return result;
}

/** Must commit before capture HTTP. Once pinned, ambiguity keeps the stock held. */
export async function pinInventoryForCapture(
  tx: Store,
  checkout: Checkout,
  now: Date,
): Promise<boolean> {
  await tx.get<Shop>("shops", checkout.shopId);
  const current = await tx.get<InventoryReservation>(
    "reservations",
    reservationId(checkout.id),
  );
  if (!current || current.status !== "HELD") return false;
  if (
    !current.captureStartedAt &&
    Date.parse(current.expiresAt) <= now.getTime()
  ) {
    await tx.set("reservations", current.id, {
      ...current,
      status: "EXPIRED",
      updatedAt: now.toISOString(),
    });
    return false;
  }
  if (!current.captureStartedAt)
    await tx.set("reservations", current.id, {
      ...current,
      captureStartedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  return true;
}

/** Authenticated no-capture observations may release an expired unpinned hold. */
export async function releaseExpiredInventory(
  tx: Store,
  checkout: Checkout,
  now: Date,
  definiteCancellation = false,
): Promise<boolean> {
  await tx.get<Shop>("shops", checkout.shopId);
  const current = await tx.get<InventoryReservation>(
    "reservations",
    reservationId(checkout.id),
  );
  if (!current || current.status !== "HELD")
    return current?.status === "EXPIRED" || current?.status === "RELEASED";
  if (
    !definiteCancellation &&
    (current.captureStartedAt || Date.parse(current.expiresAt) > now.getTime())
  )
    return false;
  await tx.set("reservations", current.id, {
    ...current,
    status: definiteCancellation ? "RELEASED" : "EXPIRED",
    updatedAt: now.toISOString(),
  });
  return true;
}

/** Money truth remains PAID even if a manual outside action violated the local hold. */
export async function commitInventory(
  tx: Store,
  checkout: Checkout,
  now: Date,
): Promise<boolean> {
  await tx.get<Shop>("shops", checkout.shopId);
  const current = await tx.get<InventoryReservation>(
    "reservations",
    reservationId(checkout.id),
  );
  if (current?.status === "COMMITTED") return true;
  if (!current || current.status !== "HELD") return false;
  const ledgers: InventoryItem[] = [];
  for (const line of current.lines) {
    const ledger = await tx.get<InventoryItem>(
      "inventory",
      inventoryId(checkout.shopId, line.productId),
    );
    if (!ledger || ledger.onHand < line.quantity) return false;
    ledgers.push(ledger);
  }
  for (const [index, line] of current.lines.entries())
    await tx.set("inventory", ledgers[index].id, {
      ...ledgers[index],
      onHand: ledgers[index].onHand - line.quantity,
      updatedAt: now.toISOString(),
    });
  await tx.set("reservations", current.id, {
    ...current,
    status: "COMMITTED",
    updatedAt: now.toISOString(),
  });
  return true;
}
