import type { SignedReceipt } from "./receipts";

export type CartLineInput = { productId: string; quantity: number };
export type QuoteLine = CartLineInput & {
  name: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
};
export type Quote = {
  id: string;
  shopId: string;
  catalogId: string;
  catalogVersion: number;
  rulesVersion: number;
  lines: QuoteLine[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: string;
  pickupDate: string;
  createdAt: string;
  expiresAt: string;
  status: "QUOTED" | "CHECKOUT";
  checkedRules: string[];
};
export type CheckoutStatus =
  | "CREATING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "CAPTURING"
  | "PAID"
  | "PENDING"
  | "DECLINED"
  | "CANCELLED"
  | "UNKNOWN"
  | "MISMATCH"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "REVERSED";
export type Checkout = {
  id: string;
  shopId: string;
  quoteId: string;
  quote: Quote;
  status: CheckoutStatus;
  expectedPayeeId: string;
  orderId?: string;
  captureId?: string;
  approvalUrl?: string;
  refundId?: string;
  refundedMinor: number;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  reason?: string;
  receipt?: SignedReceipt;
  stockCommitted?: boolean;
};
export type PaymentOperation = {
  id: string;
  shopId: string;
  checkoutId: string;
  kind: "create" | "capture" | "refund";
  idempotencyKey: string;
  requestHash: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "UNKNOWN" | "FAILED";
  createdAt: string;
  updatedAt: string;
  leaseUntil?: string;
  providerId?: string;
  error?: string;
  amountMinor?: number;
  approvalId?: string;
};
export type RefundApproval = {
  id: string;
  shopId: string;
  checkoutId: string;
  ownerId: string;
  amountMinor: number;
  currency: string;
  confirmedAt: string;
  consumedAt?: string;
};
export type StoredWebhook = {
  id: string;
  shopId: string;
  eventType: string;
  payloadHash: string;
  verifiedAt: string;
  processedAt?: string;
};
export class CommerceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409,
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "CommerceError";
  }
}
