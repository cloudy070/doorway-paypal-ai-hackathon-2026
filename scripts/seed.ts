import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { getStore } = await import("../src/lib/db");
const { register, login } = await import("../src/lib/auth");
const { createShop, latestCatalog, approveCatalog } =
  await import("../src/lib/shops");
const { initializeCatalogInventory } = await import("../src/lib/inventory");
const store = await getStore();
const existing = (
  await store.list<{ id: string; fixture?: boolean }>("shops")
).find((s) => s.fixture);
if (existing) {
  console.log(
    "An existing synthetic fixture is preserved. Shop ID: " + existing.id,
  );
  await store.close?.();
  process.exit(0);
}
const email =
  process.env.DEMO_OWNER_EMAIL || "reviewer@doorway.example.invalid";
const password =
  process.env.DEMO_OWNER_PASSWORD || randomBytes(20).toString("base64url");
let user;
try {
  user = await register(email, password);
} catch {
  user = await login(email, password);
}
const shop = await createShop(store, user.id, {
  name: "Saturday & Crumb",
  siteUrl: "",
  currency: "GBP",
  fixture: true,
});
const approved = await approveCatalog(store, shop);
await store.transaction(async (tx) => {
  await initializeCatalogInventory(tx, approved);
  await tx.set("shops", shop.id, {
    ...shop,
    domainVerified: true,
    verifiedAt: new Date().toISOString(),
    publishedVersion: approved.version,
  });
  const id = randomUUID();
  await tx.set("audit", id, {
    id,
    shopId: shop.id,
    ownerId: user.id,
    action: "SYNTHETIC_FIXTURE_SEEDED",
    source: "SYNTHETIC",
    createdAt: new Date().toISOString(),
  });
});
mkdirSync(".data", { recursive: true });
writeFileSync(
  ".data/local-reviewer.txt",
  `LOCAL SYNTHETIC DEMONSTRATION ONLY\nEmail: ${email}\nPassword: ${password}\nStore: ${process.env.APP_URL || "http://127.0.0.1:3000"}/store/${shop.slug}\nShop ID: ${shop.id}\nMCP: ${process.env.APP_URL || "http://127.0.0.1:3000"}/api/mcp/${shop.slug}\n`,
  { mode: 0o600 },
);
console.log(
  "Synthetic fixture seeded. Local reviewer credentials are in ignored .data/local-reviewer.txt. No AI extraction, external ownership proof or payment is implied.",
);
console.log("Store: /store/" + shop.slug + "; MCP: /api/mcp/" + shop.slug);
await store.close?.();
process.exit(0);
