import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createStore } = await import("../src/lib/db");
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "TEST_DATABASE_URL required; no embedded fallback for this check.",
  );
const a = await createStore(process.env.TEST_DATABASE_URL),
  b = await createStore(process.env.TEST_DATABASE_URL),
  id = "pg-smoke:" + randomUUID();
const { Client } = await import("pg");
const info = new Client({
  connectionString: process.env.TEST_DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
await info.connect();
const serverVersion = String(
  (await info.query("SHOW server_version")).rows[0].server_version,
);
await info.end();
await a.set("integration", id, { id, value: 0 });
try {
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? a : b).transaction(async (tx) => {
        const record = await tx.get<{ id: string; value: number }>(
          "integration",
          id,
        );
        if (!record) throw new Error("PERSISTENCE_FAILED");
        await tx.set("integration", id, { ...record, value: record.value + 1 });
      }),
    ),
  );
  const count = await b.get<{ id: string; value: number }>("integration", id);
  if (count?.value !== 12) throw new Error("CONCURRENT_INCREMENT_LOST");
  try {
    await a.transaction(async (tx) => {
      await tx.set("integration", id, { id, value: 999 });
      throw new Error("ROLLBACK_PROBE");
    });
  } catch (error) {
    if ((error as Error).message !== "ROLLBACK_PROBE") throw error;
  }
  if ((await b.get<{ value: number }>("integration", id))?.value !== 12)
    throw new Error("ROLLBACK_FAILED");
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        source: "LOCAL_VALIDATION",
        method: "REAL_POSTGRES",
        at: new Date().toISOString(),
        proof: {
          kind: "postgresql",
          server_version: serverVersion,
          independent_clients: 2,
          checks: { rollback: true, concurrent_locking: true },
        },
        checks: [
          "two independent pools share durable data",
          "12 concurrent locked increments preserve all writes",
          "exception rolls transaction back",
        ],
        externalProviderProven: false,
      },
      null,
      2,
    ),
  );
} finally {
  await a.delete("integration", id);
  await a.close?.();
  await b.close?.();
}
process.exit(0);
