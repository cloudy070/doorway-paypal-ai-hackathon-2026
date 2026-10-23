import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ReceiptObservation = {
  schema: "doorway.receipt.v1";
  issuer: "Doorway";
  environment: "PAYPAL_SANDBOX";
  checkoutId: string;
  shopId: string;
  quoteId: string;
  catalogVersion: number;
  orderId: string;
  captureId: string;
  amountMinor: number;
  currency: string;
  observedAt: string;
  statement: "Doorway authenticated a PayPal sandbox read and observed this completed capture. This is not a PayPal signature or a delivery guarantee.";
};
export type SignedReceipt = {
  id: string;
  payload: ReceiptObservation;
  signature: string;
  algorithm: "Ed25519";
  keyId: string;
  publicKey: string;
};
export const RECEIPT_STATEMENT: ReceiptObservation["statement"] =
  "Doorway authenticated a PayPal sandbox read and observed this completed capture. This is not a PayPal signature or a delivery guarantee.";

/** Stable JSON encoding for the deliberately small receipt schema. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new Error("NON_CANONICAL_RECEIPT_VALUE");
}

export class ReceiptSigner {
  private readonly key: KeyObject;
  readonly publicKey: string;
  readonly keyId: string;
  constructor(privateKeyPem: string) {
    this.key = createPrivateKey(privateKeyPem);
    if (this.key.asymmetricKeyType !== "ed25519")
      throw new Error("RECEIPT_KEY_MUST_BE_ED25519");
    this.publicKey = createPublicKey(this.key)
      .export({ type: "spki", format: "pem" })
      .toString();
    this.keyId = createHash("sha256")
      .update(this.publicKey)
      .digest("hex")
      .slice(0, 32);
  }
  sign(observation: ReceiptObservation): SignedReceipt {
    assertObservation(observation);
    const payload = structuredClone(observation);
    const signature = sign(
      null,
      Buffer.from(canonicalJson(payload)),
      this.key,
    ).toString("base64url");
    return {
      id: `receipt:${payload.checkoutId}`,
      payload,
      signature,
      algorithm: "Ed25519",
      keyId: this.keyId,
      publicKey: this.publicKey,
    };
  }
}

/** A trusted deployment key must be supplied, rather than trusting a key embedded in a submitted receipt. */
export function verifyReceipt(
  receipt: SignedReceipt,
  trustedPublicKey: string,
): boolean {
  try {
    assertObservation(receipt.payload);
    const key = createPublicKey(trustedPublicKey);
    const canonicalKey = key.export({ type: "spki", format: "pem" }).toString();
    const keyId = createHash("sha256")
      .update(canonicalKey)
      .digest("hex")
      .slice(0, 32);
    if (
      key.asymmetricKeyType !== "ed25519" ||
      receipt.algorithm !== "Ed25519" ||
      receipt.publicKey !== canonicalKey ||
      receipt.keyId !== keyId ||
      receipt.id !== `receipt:${receipt.payload.checkoutId}` ||
      !/^[A-Za-z0-9_-]{86}$/.test(receipt.signature)
    )
      return false;
    return verify(
      null,
      Buffer.from(canonicalJson(receipt.payload)),
      key,
      Buffer.from(receipt.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

function assertObservation(value: ReceiptObservation): void {
  const fields = [
    "schema",
    "issuer",
    "environment",
    "checkoutId",
    "shopId",
    "quoteId",
    "catalogVersion",
    "orderId",
    "captureId",
    "amountMinor",
    "currency",
    "observedAt",
    "statement",
  ].sort();
  if (
    Object.keys(value).sort().join() !== fields.join() ||
    value.schema !== "doorway.receipt.v1" ||
    value.issuer !== "Doorway" ||
    value.environment !== "PAYPAL_SANDBOX" ||
    value.statement !== RECEIPT_STATEMENT ||
    !Number.isSafeInteger(value.amountMinor) ||
    value.amountMinor <= 0 ||
    !Number.isSafeInteger(value.catalogVersion) ||
    value.catalogVersion < 1 ||
    !["USD", "GBP", "EUR"].includes(value.currency) ||
    !Number.isFinite(Date.parse(value.observedAt))
  )
    throw new Error("INVALID_RECEIPT_OBSERVATION");
  for (const id of [
    value.checkoutId,
    value.shopId,
    value.quoteId,
    value.orderId,
    value.captureId,
  ])
    if (typeof id !== "string" || !id || id.length > 200)
      throw new Error("INVALID_RECEIPT_OBSERVATION");
}

/** Development keys are generated once, then reused from a gitignored durable file. Hosted runs require env configuration. */
export function getReceiptSigner(): ReceiptSigner {
  const configured = process.env.RECEIPT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (configured) return new ReceiptSigner(configured);
  if (process.env.NODE_ENV === "production")
    throw new Error("RECEIPT_PRIVATE_KEY_REQUIRED");
  const keyPath = resolve(process.env.DATA_DIR ?? ".data", "receipt-key.pem");
  mkdirSync(dirname(keyPath), { recursive: true });
  try {
    return new ReceiptSigner(readFileSync(keyPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  try {
    writeFileSync(keyPath, pem, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return new ReceiptSigner(readFileSync(keyPath, "utf8"));
}
