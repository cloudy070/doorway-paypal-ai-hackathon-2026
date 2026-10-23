import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getStore } from "./db";
import { PaymentService } from "./payments";
import { SandboxPayPal } from "./paypal";
import { AppError } from "./errors";
import { appUrl } from "./shops";
let localSecret: string | undefined;
function accessSecret() {
  if (process.env.CHECKOUT_ACCESS_SECRET)
    return process.env.CHECKOUT_ACCESS_SECRET;
  if (process.env.NODE_ENV === "production")
    throw new AppError(
      "CHECKOUT_ACCESS_SECRET_REQUIRED",
      "Configure the checkout signing secret.",
      503,
    );
  if (localSecret) return localSecret;
  const file = path.resolve(process.env.DATA_DIR || ".data", "checkout-secret");
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    localSecret = readFileSync(file, "utf8");
  } catch {
    try {
      writeFileSync(file, randomBytes(48).toString("base64url"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    localSecret = readFileSync(file, "utf8");
  }
  return localSecret;
}
export function checkoutAccessToken(id: string, timestamp = Date.now()) {
  const time = String(timestamp);
  return (
    time +
    "." +
    createHmac("sha256", accessSecret())
      .update("checkout:" + id + ":" + time)
      .digest("base64url")
  );
}
export function verifyCheckoutAccess(id: string, token: unknown) {
  if (typeof token !== "string" || token.length > 200) return false;
  const [time] = token.split(".");
  const n = Number(time);
  if (
    !Number.isSafeInteger(n) ||
    n > Date.now() + 60000 ||
    n < Date.now() - 7 * 86400000
  )
    return false;
  const actual = Buffer.from(token),
    expected = Buffer.from(checkoutAccessToken(id, n));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function checkoutReturnUrl(id: string, cancelled = false) {
  const url = new URL("/checkout/" + encodeURIComponent(id), appUrl());
  url.searchParams.set("access", checkoutAccessToken(id));
  url.searchParams.set(cancelled ? "cancelled" : "returned", "1");
  return url.href;
}
export async function getPaymentService(): Promise<PaymentService> {
  if (
    !process.env.PAYPAL_CLIENT_ID ||
    !process.env.PAYPAL_CLIENT_SECRET ||
    !process.env.PAYPAL_MERCHANT_ID
  )
    throw new AppError(
      "PAYPAL_NOT_CONFIGURED",
      "Configure a PayPal sandbox application and its merchant ID. No payment was created.",
      503,
    );
  const gateway = new SandboxPayPal({
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
    returnUrl: new URL("/checkout/return", appUrl()).href,
    cancelUrl: new URL("/checkout/cancel", appUrl()).href,
    returnUrlFor: (id) => checkoutReturnUrl(id),
    cancelUrlFor: (id) => checkoutReturnUrl(id, true),
  });
  return new PaymentService(await getStore(), gateway);
}
