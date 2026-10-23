import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  RECEIPT_STATEMENT,
  ReceiptSigner,
  verifyReceipt,
  type ReceiptObservation,
} from "../src/lib/receipts";

const makeSigner = () =>
  new ReceiptSigner(
    generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  );
const observation: ReceiptObservation = {
  schema: "doorway.receipt.v1",
  issuer: "Doorway",
  environment: "PAYPAL_SANDBOX",
  checkoutId: "checkout-1",
  shopId: "shop-1",
  quoteId: "quote-1",
  catalogVersion: 3,
  orderId: "ORDER1",
  captureId: "CAPTURE1",
  amountMinor: 1200,
  currency: "GBP",
  observedAt: "2026-10-23T12:00:00.000Z",
  statement: RECEIPT_STATEMENT,
};

describe("Doorway observation receipts", () => {
  it("signs and verifies a stable observation using a deployment-trusted key", () => {
    const signer = makeSigner();
    const receipt = signer.sign(observation);
    expect(verifyReceipt(receipt, signer.publicKey)).toBe(true);
    expect(receipt.payload.statement).toContain("not a PayPal signature");
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      canonicalJson({ a: { b: 3, y: 2 }, z: 1 }),
    );
  });
  it.each([
    "amountMinor",
    "captureId",
    "orderId",
    "catalogVersion",
    "shopId",
  ] as const)("detects tampering with %s", (field) => {
    const signer = makeSigner(),
      receipt = signer.sign(observation);
    const tampered = structuredClone(receipt);
    (tampered.payload as unknown as Record<string, unknown>)[field] =
      typeof tampered.payload[field] === "number" ? 99 : "other";
    expect(verifyReceipt(tampered, signer.publicKey)).toBe(false);
  });
  it("rejects a self-signed replacement, extra fields, and a different key", () => {
    const signer = makeSigner(),
      attacker = makeSigner();
    expect(verifyReceipt(attacker.sign(observation), signer.publicKey)).toBe(
      false,
    );
    const receipt = signer.sign(observation);
    (receipt.payload as unknown as Record<string, unknown>).deliveryGuaranteed =
      true;
    expect(verifyReceipt(receipt, signer.publicKey)).toBe(false);
  });
});
