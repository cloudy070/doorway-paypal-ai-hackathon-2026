import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { getStore, type Store } from "./db";
import type { User, Session, Shop } from "./domain";
import { AppError, invariant } from "./errors";
const scrypt = promisify(scryptCallback);
export const sessionCookie = "doorway_session";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}
export async function checkPassword(password: string, stored: string) {
  try {
    const [salt, hex] = stored.split(":");
    const expected = Buffer.from(hex, "hex");
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export function publicUser(user: User) {
  return { id: user.id, email: user.email };
}
export async function register(email: string, password: string) {
  const store = await getStore();
  const key = hashToken(email.toLowerCase());
  const passwordHash = await hashPassword(password);
  return store.transaction(async (tx) => {
    invariant(
      !(await tx.get("emails", key)),
      "EMAIL_UNAVAILABLE",
      "This email cannot be registered.",
      409,
    );
    const user: User = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    await tx.set("users", user.id, user);
    await tx.set("emails", key, { id: key, userId: user.id });
    return user;
  });
}
export async function login(email: string, password: string) {
  const store = await getStore();
  const link = await store.get<{ userId: string }>(
    "emails",
    hashToken(email.toLowerCase()),
  );
  const user = link ? await store.get<User>("users", link.userId) : null;
  if (!user || !(await checkPassword(password, user.passwordHash)))
    throw new AppError("INVALID_LOGIN", "Email or password is incorrect.", 401);
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const session: Session = {
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  await (await getStore()).set("sessions", session.id, session);
  return token;
}
export function cookieToken(request: Request) {
  const raw = request.headers.get("cookie") || "";
  return raw
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(sessionCookie + "="))
    ?.slice(sessionCookie.length + 1);
}
export async function getUser(request: Request) {
  const token = cookieToken(request);
  if (!token) return null;
  const store = await getStore();
  const session = await store.get<Session>("sessions", hashToken(token));
  if (!session || Date.parse(session.expiresAt) < Date.now()) return null;
  return store.get<User>("users", session.userId);
}
export async function requireUser(request: Request) {
  const user = await getUser(request);
  invariant(user, "AUTH_REQUIRED", "Sign in to manage your shop.", 401);
  return user;
}
export async function ownShop(store: Store, id: string, ownerId: string) {
  const shop = await store.get<Shop>("shops", id);
  invariant(
    shop && shop.ownerId === ownerId,
    "SHOP_NOT_FOUND",
    "Shop not found.",
    404,
  );
  return shop;
}
export function sessionHeader(token: string, maxAge = 604800) {
  return `${sessionCookie}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.APP_URL?.startsWith("https:") ? "; Secure" : ""}`;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || "http://127.0.0.1:3000")
    .origin;
  if (!origin || origin !== expected)
    throw new AppError(
      "ORIGIN_REJECTED",
      "This action must come from the Doorway app.",
      403,
    );
}
const buckets = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, limit = 60) {
  const now = Date.now();
  if (buckets.size > 10000) {
    for (const [k, b] of buckets) if (b.until < now) buckets.delete(k);
  }
  const current = buckets.get(key);
  if (!current || current.until < now) {
    buckets.set(key, { count: 1, until: now + 60000 });
    return;
  }
  if (current.count >= limit)
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Please try again in a minute.",
      429,
    );
  current.count++;
}
