import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStore, type Store } from "../src/lib/db";
import {
  register,
  login,
  createSession,
  getUser,
  hashToken,
  hashPassword,
  checkPassword,
  ownShop,
  publicUser,
} from "../src/lib/auth";
import type { User, Session } from "../src/lib/domain";
let store: Store, previous: Promise<Store> | undefined;
const globalState = globalThis as typeof globalThis & {
  doorwayStore?: Promise<Store>;
};
beforeAll(async () => {
  process.env.TEST_DB_MEMORY = "1";
  store = await createStore();
  previous = globalState.doorwayStore;
  globalState.doorwayStore = Promise.resolve(store);
});
afterAll(() => {
  globalState.doorwayStore = previous;
});
describe("persistent owner authentication", () => {
  it("uses salted scrypt and rejects an incorrect password or corrupted hash", async () => {
    const a = await hashPassword("local-test-password-2026"),
      b = await hashPassword("local-test-password-2026");
    expect(a).not.toBe(b);
    expect(a).not.toContain("local-test-password");
    expect(await checkPassword("local-test-password-2026", a)).toBe(true);
    expect(await checkPassword("wrong-password", a)).toBe(false);
    expect(await checkPassword("anything", "malformed")).toBe(false);
  });
  it("registers one owner under concurrent case-insensitive email attempts", async () => {
    const results = await Promise.allSettled([
      register("Same@Example.invalid", "local-test-password-2026"),
      register("same@example.invalid", "different-password-2026"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const users = await store.list<User>("users");
    expect(
      users.filter((u) => u.email === "same@example.invalid"),
    ).toHaveLength(1);
    expect(publicUser(users[0])).not.toHaveProperty("passwordHash");
  });
  it("authenticates correctly and gives one generic rejection for missing users and bad passwords", async () => {
    const user = await register(
      "login@example.invalid",
      "local-test-password-2026",
    );
    expect(
      (await login("LOGIN@example.invalid", "local-test-password-2026")).id,
    ).toBe(user.id);
    await expect(
      login("login@example.invalid", "wrong-password"),
    ).rejects.toMatchObject({ code: "INVALID_LOGIN", status: 401 });
    await expect(
      login("absent@example.invalid", "wrong-password"),
    ).rejects.toMatchObject({ code: "INVALID_LOGIN", status: 401 });
  });
  it("stores a session hash, rejects expired/deleted sessions and keeps owner isolation", async () => {
    const owner = await register(
      "session@example.invalid",
      "local-test-password-2026",
    );
    const token = await createSession(owner.id);
    const saved = await store.get<Session>("sessions", hashToken(token));
    expect(saved?.id).not.toBe(token);
    const req = new Request("http://127.0.0.1:3000/api/auth/me", {
      headers: { cookie: "doorway_session=" + token },
    });
    expect((await getUser(req))?.id).toBe(owner.id);
    await store.set("sessions", saved!.id, {
      ...saved!,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await getUser(req)).toBeNull();
    await store.delete("sessions", saved!.id);
    expect(await getUser(req)).toBeNull();
    await store.set("shops", "owned-shop", {
      id: "owned-shop",
      ownerId: owner.id,
    });
    await expect(
      ownShop(store, "owned-shop", "another-owner"),
    ).rejects.toMatchObject({ code: "SHOP_NOT_FOUND", status: 404 });
  });
});
