export type SourceLabel =
  "LIVE_SANDBOX" | "LIVE_AI" | "LOCAL_VALIDATION" | "SYNTHETIC" | "RECORDED";
export interface Evidence {
  url: string;
  quote: string;
  fetchedAt?: string;
}
export interface Product {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  stock: number;
  attributes: { dietary?: string[]; [key: string]: unknown };
  sources?: Evidence[];
  confidence?: number;
  issues?: string[];
  allowedAlternatives?: string[];
}
export interface Rules {
  pickupDays: number[];
  leadTimeHours: number;
  minOrderMinor: number;
  maxQuantityPerLine: number;
  bulkDiscount?: {
    minQuantity: number;
    percentOff: number;
    maxDiscountMinor?: number;
  };
  deliveryPolicy: string;
  returnsPolicy: string;
}
export interface Shop {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  siteUrl: string;
  currency: string;
  paypalMerchantId: string;
  ownershipToken: string;
  domainVerified: boolean;
  verifiedAt?: string;
  publishedVersion: number | null;
  createdAt: string;
  fixture?: boolean;
}
export interface Catalog {
  id: string;
  shopId: string;
  version: number;
  status: "DRAFT" | "APPROVED";
  products: Product[];
  rules: Rules;
  sources: Evidence[];
  warnings: string[];
  createdAt: string;
  approvedAt?: string;
  source: SourceLabel;
  model?: string;
  fieldEvidence?: Record<string, unknown>;
  sourcePages?: unknown[];
}
export interface AgentRun {
  id: string;
  shopId: string;
  ownerId?: string;
  intent: string;
  kind: "PREFLIGHT" | "SHOPPER";
  source: SourceLabel;
  status: "RUNNING" | "PASSED" | "BLOCKED" | "FAILED";
  findings: { code: string; message: string; productId?: string }[];
  steps: { tool: string; input: unknown; output: unknown }[];
  catalogVersion: number;
  createdAt: string;
  model?: string;
  faultInjected?: boolean;
}
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}
export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}
export const defaultRules: Rules = {
  pickupDays: [0, 1, 2, 3, 4, 5, 6],
  leadTimeHours: 0,
  minOrderMinor: 0,
  maxQuantityPerLine: 20,
  deliveryPolicy: "Pickup only. Confirm the collection day with the shop.",
  returnsPolicy: "Contact the shop before requesting a refund.",
};
