import { mkdir } from "node:fs/promises";
import path from "node:path";
export interface Store {
  get<T>(collection: string, id: string): Promise<T | null>;
  set<T extends { id: string }>(
    collection: string,
    id: string,
    value: T,
  ): Promise<void>;
  list<T>(
    collection: string,
    filter?: { shopId?: string; ownerId?: string },
  ): Promise<T[]>;
  delete(collection: string, id: string): Promise<void>;
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}
type Query = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
const schema = `CREATE TABLE IF NOT EXISTS doorway_records (
  collection text NOT NULL, id text NOT NULL, payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(collection,id)
); CREATE INDEX IF NOT EXISTS doorway_shop_idx ON doorway_records(collection,(payload->>'shopId'));
CREATE INDEX IF NOT EXISTS doorway_owner_idx ON doorway_records(collection,(payload->>'ownerId'));
CREATE UNIQUE INDEX IF NOT EXISTS doorway_operation_key_unique ON doorway_records((payload->>'idempotencyKey')) WHERE collection='operations';
CREATE UNIQUE INDEX IF NOT EXISTS doorway_checkout_order_unique ON doorway_records((payload->>'orderId')) WHERE collection='checkouts' AND payload->>'orderId' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS doorway_checkout_quote_unique ON doorway_records((payload->>'quoteId')) WHERE collection='checkouts';
CREATE UNIQUE INDEX IF NOT EXISTS doorway_capture_unique ON doorway_records((payload->>'captureId')) WHERE collection='checkouts' AND payload->>'captureId' IS NOT NULL;`;
function repository(
  query: Query,
  transact: <T>(fn: (tx: Store) => Promise<T>) => Promise<T>,
  locked = false,
): Store {
  return {
    async get<T>(collection: string, id: string) {
      if (locked)
        await query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          collection + ":" + id,
        ]);
      const r = await query(
        "SELECT payload FROM doorway_records WHERE collection=$1 AND id=$2" +
          (locked ? " FOR UPDATE" : ""),
        [collection, id],
      );
      return (r.rows[0]?.payload as T) ?? null;
    },
    async set(collection, id, value) {
      if (value.id !== id) throw new Error("Record identity mismatch");
      await query(
        `INSERT INTO doorway_records(collection,id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload,revision=doorway_records.revision+1,updated_at=now()`,
        [collection, id, JSON.stringify(value)],
      );
    },
    async list<T>(
      collection: string,
      filter?: { shopId?: string; ownerId?: string },
    ) {
      const params: unknown[] = [collection];
      let clause = "collection=$1";
      for (const key of ["shopId", "ownerId"] as const) {
        if (filter?.[key] !== undefined) {
          params.push(filter[key]);
          clause += ` AND payload->>'${key}'=$${params.length}`;
        }
      }
      const r = await query(
        "SELECT payload FROM doorway_records WHERE " +
          clause +
          " ORDER BY created_at DESC",
        params,
      );
      return r.rows.map((row) => row.payload as T);
    },
    async delete(collection, id) {
      await query("DELETE FROM doorway_records WHERE collection=$1 AND id=$2", [
        collection,
        id,
      ]);
    },
    transaction: transact,
  };
}
export async function createStore(databaseUrl?: string): Promise<Store> {
  if (databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      query_timeout: 10000,
      statement_timeout: 10000,
    });
    try {
      await pool.query(schema);
    } catch (error) {
      await pool.end();
      throw error;
    }
    const transact = async <T>(fn: (tx: Store) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx = repository(
          async (s, p) => client.query(s, p),
          async (f) => f(tx),
          true,
        );
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    };
    return {
      ...repository(async (s, p) => pool.query(s, p), transact),
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir =
    process.env.TEST_DB_MEMORY === "1"
      ? undefined
      : path.resolve(process.env.DATA_DIR || ".data", "pglite");
  if (dir) await mkdir(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.exec(schema);
  const transact = async <T>(fn: (tx: Store) => Promise<T>): Promise<T> =>
    db.transaction(async (client) => {
      const tx = repository(
        async (s, p) => {
          if (s.includes("pg_advisory_xact_lock")) return { rows: [] };
          return client.query(s, p);
        },
        async (f) => f(tx),
        true,
      );
      return fn(tx);
    });
  return {
    ...repository(async (s, p) => db.query(s, p), transact),
    close: () => db.close(),
  };
}
const state = globalThis as typeof globalThis & {
  doorwayStore?: Promise<Store>;
};
export function getStore(): Promise<Store> {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
    throw new Error("DATABASE_URL_REQUIRED");
  const pending = (state.doorwayStore ??= createStore(
    process.env.DATABASE_URL,
  ));
  return pending.catch((error) => {
    if (state.doorwayStore === pending) delete state.doorwayStore;
    throw error;
  });
}
