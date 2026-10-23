/** Sandbox only. Mutations are never automatically retried by the transport. */
export type PayPalMoney = { currency_code: string; value: string };
export type PayPalCapture = {
  id: string;
  status: string;
  amount: PayPalMoney;
  final_capture?: boolean;
  supplementary_data?: { related_ids?: { order_id?: string } };
  links?: Array<{ rel: string; href: string }>;
};
export type PayPalOrder = {
  id: string;
  status: string;
  intent?: string;
  purchase_units?: Array<{
    reference_id?: string;
    invoice_id?: string;
    custom_id?: string;
    amount: PayPalMoney;
    payee?: { merchant_id?: string };
    payments?: { captures?: PayPalCapture[]; refunds?: PayPalRefund[] };
  }>;
  links?: Array<{ rel: string; href: string }>;
};
export type PayPalRefund = {
  id: string;
  status: string;
  amount: PayPalMoney;
  links?: Array<{ rel: string; href: string }>;
};
export type PayPalCreateInput = {
  paymentId: string;
  merchantId: string;
  amountMinor: number;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  lines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
  }>;
};
export type WebhookEvent = {
  id: string;
  event_type: string;
  create_time?: string;
  resource?: {
    id?: string;
    supplementary_data?: {
      related_ids?: { order_id?: string; capture_id?: string };
    };
    links?: Array<{ rel: string; href: string }>;
  };
};
export interface PayPalGateway {
  createOrder(
    input: PayPalCreateInput,
    requestId: string,
  ): Promise<PayPalOrder>;
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder>;
  readOrder(orderId: string): Promise<PayPalOrder>;
  readCapture(captureId: string): Promise<PayPalCapture>;
  refundCapture(
    captureId: string,
    amountMinor: number,
    currency: string,
    requestId: string,
  ): Promise<PayPalRefund>;
  readRefund(refundId: string): Promise<PayPalRefund>;
  verifyWebhook(
    headers: Record<string, string>,
    event: WebhookEvent,
  ): Promise<boolean>;
}

export class PayPalError extends Error {
  constructor(
    public readonly code: string,
    public readonly ambiguous: boolean,
    public readonly httpStatus?: number,
  ) {
    super(code);
    this.name = "PayPalError";
  }
}

// The pilot deliberately accepts only currencies with two minor digits.
export const PILOT_CURRENCIES = ["GBP", "USD", "EUR"] as const;
export function minorToPayPal(minor: number, currency: string): string {
  if (
    !Number.isSafeInteger(minor) ||
    minor < 0 ||
    !(PILOT_CURRENCIES as readonly string[]).includes(currency)
  )
    throw new Error("INVALID_MONEY");
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
export function paypalToMinor(money: PayPalMoney): number {
  if (
    !(PILOT_CURRENCIES as readonly string[]).includes(money.currency_code) ||
    !/^(0|[1-9]\d*)\.\d{2}$/.test(money.value)
  )
    throw new Error("INVALID_PROVIDER_MONEY");
  const [whole, fraction] = money.value.split(".");
  const value = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(value)) throw new Error("INVALID_PROVIDER_MONEY");
  return value;
}

export type SandboxPayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  returnUrl: string;
  cancelUrl: string;
  returnUrlFor?: (paymentId: string) => string;
  cancelUrlFor?: (paymentId: string) => string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export class SandboxPayPal implements PayPalGateway {
  private readonly origin = "https://api-m.sandbox.paypal.com";
  private readonly transport: typeof globalThis.fetch;
  private token?: { value: string; expiresAt: number };
  private tokenPromise?: Promise<string>;
  constructor(private readonly config: SandboxPayPalConfig) {
    if (!config.clientId || !config.clientSecret)
      throw new PayPalError("PAYPAL_SANDBOX_NOT_CONFIGURED", false);
    for (const value of [config.returnUrl, config.cancelUrl])
      validateCallbackUrl(value);
    this.transport = config.fetch ?? globalThis.fetch;
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise = (async () => {
      try {
        const response = await this.transport(
          `${this.origin}/v1/oauth2/token`,
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(this.config.timeoutMs ?? 15000),
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          },
        );
        if (!response.ok)
          throw new PayPalError("PAYPAL_AUTH_FAILED", false, response.status);
        const body: unknown = await response.json();
        if (
          !isRecord(body) ||
          typeof body.access_token !== "string" ||
          typeof body.expires_in !== "number"
        )
          throw new PayPalError("PAYPAL_AUTH_RESPONSE_INVALID", false);
        this.token = {
          value: body.access_token,
          expiresAt: Date.now() + Math.max(0, body.expires_in - 60) * 1000,
        };
        return body.access_token;
      } catch (error) {
        if (error instanceof PayPalError) throw error;
        throw new PayPalError("PAYPAL_AUTH_UNAVAILABLE", false);
      } finally {
        this.tokenPromise = undefined;
      }
    })();
    return this.tokenPromise;
  }
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    requestId?: string,
  ): Promise<T> {
    const token = await this.accessToken(); // Auth failure is before the financial request.
    try {
      const response = await this.transport(`${this.origin}${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 15000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok)
        throw new PayPalError(
          "PAYPAL_REQUEST_FAILED",
          method === "POST" &&
            (response.status >= 500 ||
              [408, 409, 429].includes(response.status)),
          response.status,
        );
      const result: unknown = await response.json();
      if (!isRecord(result))
        throw new PayPalError("PAYPAL_RESPONSE_INVALID", method === "POST");
      return result as T;
    } catch (error) {
      if (error instanceof PayPalError) throw error;
      throw new PayPalError(
        "PAYPAL_NETWORK_OR_RESPONSE_ERROR",
        method === "POST",
      );
    }
  }
  createOrder(
    input: PayPalCreateInput,
    requestId: string,
  ): Promise<PayPalOrder> {
    const money = (value: number): PayPalMoney => ({
      currency_code: input.currency,
      value: minorToPayPal(value, input.currency),
    });
    if (
      input.amountMinor <= 0 ||
      input.subtotalMinor - input.discountMinor !== input.amountMinor ||
      input.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPriceMinor,
        0,
      ) !== input.subtotalMinor
    )
      throw new Error("INVALID_PAYMENT_TOTAL");
    const returnUrl =
      this.config.returnUrlFor?.(input.paymentId) ?? this.config.returnUrl;
    const cancelUrl =
      this.config.cancelUrlFor?.(input.paymentId) ?? this.config.cancelUrl;
    validateCallbackUrl(returnUrl);
    validateCallbackUrl(cancelUrl);
    return this.request(
      "POST",
      "/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.paymentId,
            custom_id: input.paymentId,
            invoice_id: input.paymentId,
            payee: { merchant_id: input.merchantId },
            amount: {
              ...money(input.amountMinor),
              breakdown: {
                item_total: money(input.subtotalMinor),
                ...(input.discountMinor
                  ? { discount: money(input.discountMinor) }
                  : {}),
              },
            },
            items: input.lines.map((line) => ({
              sku: line.productId,
              name: line.name,
              quantity: String(line.quantity),
              unit_amount: money(line.unitPriceMinor),
              category: "PHYSICAL_GOODS",
            })),
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      },
      requestId,
    );
  }
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder> {
    return this.request(
      "POST",
      `/v2/checkout/orders/${safeId(orderId)}/capture`,
      {},
      requestId,
    );
  }
  readOrder(orderId: string): Promise<PayPalOrder> {
    return this.request("GET", `/v2/checkout/orders/${safeId(orderId)}`);
  }
  readCapture(captureId: string): Promise<PayPalCapture> {
    return this.request("GET", `/v2/payments/captures/${safeId(captureId)}`);
  }
  refundCapture(
    captureId: string,
    amountMinor: number,
    currency: string,
    requestId: string,
  ): Promise<PayPalRefund> {
    if (amountMinor <= 0) throw new Error("INVALID_REFUND_AMOUNT");
    return this.request(
      "POST",
      `/v2/payments/captures/${safeId(captureId)}/refund`,
      {
        amount: {
          currency_code: currency,
          value: minorToPayPal(amountMinor, currency),
        },
      },
      requestId,
    );
  }
  readRefund(refundId: string): Promise<PayPalRefund> {
    return this.request("GET", `/v2/payments/refunds/${safeId(refundId)}`);
  }
  async verifyWebhook(
    headers: Record<string, string>,
    event: WebhookEvent,
  ): Promise<boolean> {
    if (!this.config.webhookId)
      throw new PayPalError("PAYPAL_WEBHOOK_NOT_CONFIGURED", false);
    const normalized = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const fields = {
      auth_algo: normalized["paypal-auth-algo"],
      cert_url: normalized["paypal-cert-url"],
      transmission_id: normalized["paypal-transmission-id"],
      transmission_sig: normalized["paypal-transmission-sig"],
      transmission_time: normalized["paypal-transmission-time"],
    };
    if (Object.values(fields).some((value) => !value || value.length > 1000))
      return false;
    let cert: URL;
    try {
      cert = new URL(fields.cert_url);
    } catch {
      return false;
    }
    if (
      cert.protocol !== "https:" ||
      (cert.hostname !== "api.paypal.com" &&
        cert.hostname !== "api.sandbox.paypal.com") ||
      cert.username ||
      cert.password
    )
      return false;
    const result = await this.request<{ verification_status?: string }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      { ...fields, webhook_id: this.config.webhookId, webhook_event: event },
    );
    return result.verification_status === "SUCCESS";
  }
}
function safeId(id: string): string {
  if (!/^[A-Za-z0-9-]{1,128}$/.test(id)) throw new Error("INVALID_PAYPAL_ID");
  return encodeURIComponent(id);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateCallbackUrl(value: string): void {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("INVALID_CHECKOUT_CALLBACK_URL");
}

export function sandboxApprovalUrl(order: PayPalOrder): string | undefined {
  const link = order.links?.find(
    (item) => item.rel === "payer-action" || item.rel === "approve",
  );
  if (!link) return undefined;
  const url = new URL(link.href);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "www.sandbox.paypal.com" &&
      url.hostname !== "sandbox.paypal.com") ||
    url.username ||
    url.password
  )
    throw new Error("UNSAFE_PAYPAL_APPROVAL_URL");
  return url.href;
}
