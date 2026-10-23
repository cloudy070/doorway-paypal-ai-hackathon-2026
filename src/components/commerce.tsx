"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  Globe2,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TriangleAlert,
} from "lucide-react";
import type { AgentRun, Catalog, Product, Shop } from "@/lib/domain";
import type { Checkout, Quote } from "@/lib/domain-commerce";
import {
  AppShell,
  Badge,
  Brand,
  Button,
  EmptyState,
  Field,
  Notice,
  PageLoading,
  RequestError,
  dateLabel,
  friendlyStatus,
  money,
  navigateTabs,
  request,
  statusTone,
  useResource,
} from "./doorway-ui";

export function OrdersPage() {
  const [orders, setOrders] = useState<(Checkout & { shopName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const shops: Shop[] = await request("/api/shops");
      const stores = await Promise.all(
        shops.map(async (shop) => ({
          shop,
          detail: await request(`/api/shops/${shop.id}`),
        })),
      );
      setOrders(
        stores
          .flatMap(({ shop, detail }) =>
            (detail.orders || []).map((order: Checkout) => ({
              ...order,
              shopName: shop.name,
            })),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load your orders.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const visible = orders.filter(
    (order) =>
      filter === "all" ||
      (filter === "attention"
        ? ["UNKNOWN", "PENDING", "MISMATCH", "REVERSED"].includes(order.status)
        : filter === "paid"
          ? order.status === "PAID"
          : order.status.includes("REFUNDED")),
  );
  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Every order has a story</span>
          <h1>Follow it through.</h1>
          <p>
            Track approval, verified payment, and recovery. Sandbox transactions
            are always labelled.
          </p>
        </div>
        <Button secondary onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh orders
        </Button>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">
            <ShoppingBag size={14} />
            Recorded orders
          </span>
          <div className="stat-value">
            {loading || error ? "—" : orders.length}
          </div>
          <small>All stores in your workspace</small>
        </div>
        <div className="stat">
          <span className="stat-label">
            <CheckCheck size={14} />
            Verified payments
          </span>
          <div className="stat-value">
            {loading || error
              ? "—"
              : orders.filter((order) => order.status === "PAID").length}
          </div>
          <small>Authenticated PayPal reads</small>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Clock3 size={14} />
            Needs attention
          </span>
          <div className="stat-value">
            {loading || error
              ? "—"
              : orders.filter((order) =>
                  ["UNKNOWN", "PENDING", "MISMATCH", "REVERSED"].includes(
                    order.status,
                  ),
                ).length}
          </div>
          <small>Check the existing payment</small>
        </div>
        <div className="stat">
          <span className="stat-label">
            <RefreshCw size={14} />
            Refunded orders
          </span>
          <div className="stat-value">
            {loading || error
              ? "—"
              : orders.filter((order) => order.status.includes("REFUNDED"))
                  .length}
          </div>
          <small>Owner-confirmed refunds</small>
        </div>
      </div>
      <div className="tab-list" role="tablist" aria-label="Filter orders">
        {[
          { id: "all", label: "All orders" },
          { id: "attention", label: "Needs attention" },
          { id: "paid", label: "Paid" },
          { id: "refunded", label: "Refunded" },
        ].map((item) => (
          <button
            role="tab"
            onKeyDown={navigateTabs}
            aria-selected={filter === item.id}
            key={item.id}
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : loading ? (
        <PageLoading label="Loading your orders" />
      ) : (
        <section className="panel">
          {visible.length ? (
            <div className="table-scroll">
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Store</th>
                    <th>Created</th>
                    <th>Amount</th>
                    <th>Payment status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((order) => (
                    <tr key={order.id}>
                      <td>#{order.id.slice(0, 8)}</td>
                      <td>{order.shopName}</td>
                      <td>{dateLabel(order.createdAt)}</td>
                      <td>
                        {money(order.quote.totalMinor, order.quote.currency)}
                      </td>
                      <td>
                        <Badge tone={statusTone(order.status)} dot>
                          {friendlyStatus(order.status)}
                        </Badge>
                      </td>
                      <td>
                        <Link href={`/orders/${order.id}`}>
                          View order <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<ShoppingBag />}
              title={
                filter === "all"
                  ? "Room for your first order."
                  : "Nothing here just now."
              }
              action={
                filter === "all" ? (
                  <Button href="/dashboard" secondary>
                    Go to your stores <ArrowRight size={14} />
                  </Button>
                ) : undefined
              }
            >
              {filter === "all"
                ? "Orders appear here when a shopper starts checkout from a published catalog. You’ll be able to follow every status, right through to a verified receipt."
                : "No recorded orders match this filter."}
            </EmptyState>
          )}
        </section>
      )}
      <p className="disclosure" style={{ marginTop: 19 }}>
        Sandbox order totals are test transaction values. They are not real
        revenue, forecasts, or evidence of customer demand.
      </p>
    </AppShell>
  );
}

export function ReceiptPanel({
  checkout,
  token,
}: {
  checkout: Checkout;
  token?: string;
}) {
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const verificationVersion = useRef(0);
  useEffect(() => {
    verificationVersion.current += 1;
    setResult(null);
    setError("");
    return () => {
      verificationVersion.current += 1;
    };
  }, [checkout.id, checkout.receipt?.id, checkout.receipt?.signature]);
  async function verify() {
    if (!checkout.receipt) return;
    const version = ++verificationVersion.current;
    setBusy(true);
    setError("");
    try {
      const verification = await request(
        `/api/receipts/${encodeURIComponent(checkout.receipt.id)}${token ? `?access=${encodeURIComponent(token)}` : ""}`,
      );
      const receipt = verification.receipt;
      const observation = receipt?.payload;
      const bound =
        receipt?.id === checkout.receipt.id &&
        observation?.checkoutId === checkout.id &&
        observation?.shopId === checkout.shopId &&
        observation?.quoteId === checkout.quoteId &&
        observation?.catalogVersion === checkout.quote.catalogVersion &&
        observation?.orderId === checkout.orderId &&
        observation?.captureId === checkout.captureId &&
        observation?.amountMinor === checkout.quote.totalMinor &&
        observation?.currency === checkout.quote.currency;
      if (version === verificationVersion.current)
        setResult({
          ...verification,
          valid: verification.valid === true && bound,
        });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to verify the receipt.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel receipt-card">
      <span className="receipt-icon">
        <FileCheck2 size={21} />
      </span>
      <h3>
        {checkout.receipt
          ? "A record you can check."
          : "A receipt follows verification."}
      </h3>
      <p>
        {checkout.receipt
          ? "This signed Doorway receipt records the payment outcome we observed through an authenticated PayPal sandbox read."
          : "A signed receipt appears after an authenticated read confirms the expected payment. An approval or pending result isn’t a completed payment."}
      </p>
      {checkout.receipt && (
        <>
          <div className="aside-divider" />
          <div className="detail-row">
            <span>Receipt</span>
            <strong>{checkout.receipt.id.slice(0, 24)}…</strong>
          </div>
          <div className="detail-row">
            <span>Observed</span>
            <strong>{dateLabel(checkout.receipt.payload.observedAt)}</strong>
          </div>
          <div className="detail-row">
            <span>Catalog</span>
            <strong>Version {checkout.receipt.payload.catalogVersion}</strong>
          </div>
          <Button secondary disabled={busy} onClick={() => void verify()}>
            {busy ? (
              <Loader2 className="spin" size={13} />
            ) : (
              <ShieldCheck size={13} />
            )}
            Verify receipt integrity
          </Button>
        </>
      )}
      {error && (
        <div style={{ marginTop: 15 }}>
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {result && (
        <div style={{ marginTop: 15 }}>
          <Notice tone={result.valid ? "success" : "error"}>
            {result.valid
              ? "Receipt signature and contents verified against this deployment’s trusted key."
              : "The receipt signature or its binding to this order did not pass verification."}
          </Notice>
          <details style={{ marginTop: 14, fontSize: 10, color: "#8b9f78" }}>
            <summary>View signed record</summary>
            <pre className="receipt-code">
              {JSON.stringify(result.receipt || checkout.receipt, null, 2)}
            </pre>
          </details>
        </div>
      )}
      <p className="disclosure" style={{ marginTop: 18 }}>
        Doorway’s signature protects this observation from alteration. It is not
        a PayPal signature or a guarantee of delivery.
      </p>
    </section>
  );
}

function OrderLines({ quote }: { quote: Quote }) {
  return (
    <>
      <div className="product-list">
        {quote.lines.map((line) => (
          <div
            className="product-row"
            key={line.productId}
            style={{ gridTemplateColumns: "38px minmax(0,1fr) 80px" }}
          >
            <span className="product-icon">
              <Package size={17} />
            </span>
            <div>
              <div className="product-title">{line.name}</div>
              <div className="product-subtitle">
                Quantity {line.quantity} ·{" "}
                {money(line.unitPriceMinor, quote.currency)} each
              </div>
            </div>
            <div className="product-price">
              {money(line.lineTotalMinor, quote.currency)}
            </div>
          </div>
        ))}
      </div>
      {quote.discountMinor > 0 && (
        <div
          className="detail-row"
          style={{ padding: "15px 24px", borderTop: "1px solid var(--line)" }}
        >
          <span>Approved bulk discount</span>
          <strong>−{money(quote.discountMinor, quote.currency)}</strong>
        </div>
      )}
      <div className="checkout-total">
        <span>
          Total <span className="muted small-text">· {quote.currency}</span>
        </span>
        <strong>{money(quote.totalMinor, quote.currency)}</strong>
      </div>
    </>
  );
}

function collectionLabel(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  return date.toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export function OrderDetailPage({ id }: { id: string }) {
  const {
    data: order,
    loading,
    error,
    reload,
  } = useResource(`/api/checkouts/${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundApproval, setRefundApproval] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState("success");
  async function reconcile() {
    setBusy("reconcile");
    setActionError("");
    try {
      const checked: Checkout = await request(
        `/api/checkouts/${encodeURIComponent(id)}/reconcile`,
        {},
      );
      await reload();
      const unresolved = [
        "UNKNOWN",
        "PENDING",
        "MISMATCH",
        "REVERSED",
      ].includes(checked.status);
      setNoticeTone(unresolved ? "warning" : "success");
      setNotice(
        `The existing payment was checked. Latest status: ${friendlyStatus(checked.status).toLowerCase()}.`,
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to check payment.",
      );
    } finally {
      setBusy("");
    }
  }
  async function proposeRefund() {
    setBusy("propose");
    setActionError("");
    try {
      setRefundApproval(
        await request(
          `/api/checkouts/${encodeURIComponent(id)}/refund/propose`,
          { amountMinor: Math.round(Number(refundAmount) * 100) },
        ),
      );
      setConfirm(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to prepare a refund.",
      );
    } finally {
      setBusy("");
    }
  }
  async function refund() {
    setBusy("refund");
    setActionError("");
    try {
      const result: Checkout = await request(
        `/api/checkouts/${encodeURIComponent(id)}/refund/confirm`,
        { approvalId: refundApproval.id },
      );
      const verified = ["REFUNDED", "PARTIALLY_REFUNDED"].includes(
        result.status,
      );
      const rejected = result.reason?.startsWith("REFUND_REJECTED:");
      if (verified) {
        setRefundApproval(null);
        setShowRefund(false);
      }
      setConfirm(false);
      await reload();
      setNoticeTone(
        verified
          ? "success"
          : rejected || result.status === "MISMATCH"
            ? "error"
            : "warning",
      );
      setNotice(
        verified
          ? `Refund verified: ${money(result.refundedMinor, result.quote.currency)}. Latest order status: ${friendlyStatus(result.status).toLowerCase()}.`
          : rejected
            ? "PayPal rejected this refund request. No refund is confirmed. Review the existing request with the deployment owner before retrying."
            : result.status === "MISMATCH"
              ? "The observed refund details did not match this order. Keep the existing request for review before taking another payment action."
              : "The refund has not been confirmed. Keep this exact request for recovery; do not prepare a different refund while its outcome is unresolved.",
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Refund outcome requires a payment check.",
      );
    } finally {
      setBusy("");
    }
  }
  const checkout: Checkout | null = order;
  if (loading && !checkout)
    return (
      <AppShell>
        <PageLoading label="Opening this order" />
      </AppShell>
    );
  if (error || !checkout)
    return (
      <AppShell>
        <Notice tone="error">{error || "Order not found."}</Notice>
      </AppShell>
    );
  const availableRefund = checkout.quote.totalMinor - checkout.refundedMinor;
  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A clear view of the outcome</span>
          <h1>Order #{checkout.id.slice(0, 8)}.</h1>
          <p>
            Created {dateLabel(checkout.createdAt)} · PayPal sandbox · Catalog v
            {checkout.quote.catalogVersion}
          </p>
        </div>
        <div className="heading-actions">
          <Button secondary href="/orders">
            All orders
          </Button>
          <Button
            secondary
            disabled={Boolean(busy)}
            onClick={() => void reconcile()}
          >
            {busy === "reconcile" ? (
              <Loader2 className="spin" size={13} />
            ) : (
              <RefreshCw size={13} />
            )}
            Check payment
          </Button>
        </div>
      </div>
      {notice && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone={noticeTone}>{notice}</Notice>
        </div>
      )}
      {actionError && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="error">{actionError}</Notice>
        </div>
      )}
      {["UNKNOWN", "PENDING", "MISMATCH"].includes(checkout.status) && (
        <div style={{ marginBottom: 22 }}>
          <Notice tone="warning">
            <strong>
              {checkout.status === "UNKNOWN"
                ? "The outcome needs a check."
                : checkout.status === "MISMATCH"
                  ? "Payment details did not match."
                  : "Payment is still pending."}
            </strong>
            <br />
            {checkout.reason ||
              "Check the existing PayPal order to recover the latest state. Don’t ask the buyer to pay again while the outcome is unresolved."}
          </Notice>
        </div>
      )}
      <div className="order-detail-layout">
        <div className="stack">
          <section className="panel">
            <div className="order-summary-head">
              <span className="order-summary-icon">
                {checkout.status === "PAID" ? (
                  <CheckCheck size={23} />
                ) : (
                  <ShoppingBag size={23} />
                )}
              </span>
              <div>
                <h2>{friendlyStatus(checkout.status)}</h2>
                <p>
                  {checkout.verifiedAt
                    ? `Last verified ${dateLabel(checkout.verifiedAt)}`
                    : "Awaiting a verified payment outcome"}
                </p>
              </div>
              <Badge tone={statusTone(checkout.status)} dot>
                {friendlyStatus(checkout.status)}
              </Badge>
            </div>
            <OrderLines quote={checkout.quote} />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Payment trail</h2>
              <Badge tone="amber">Sandbox</Badge>
            </div>
            <div className="panel-content">
              <div className="detail-row">
                <span>Checkout</span>
                <strong>{checkout.id}</strong>
              </div>
              <div className="detail-row">
                <span>PayPal order</span>
                <strong>{checkout.orderId || "Not created"}</strong>
              </div>
              <div className="detail-row">
                <span>Capture</span>
                <strong>{checkout.captureId || "Not captured"}</strong>
              </div>
              <div className="detail-row">
                <span>Expected recipient</span>
                <strong>{checkout.expectedPayeeId || "Not configured"}</strong>
              </div>
              <div className="detail-row">
                <span>Quote</span>
                <strong>{checkout.quoteId}</strong>
              </div>
              <div className="detail-row">
                <span>Collection</span>
                <strong>{collectionLabel(checkout.quote.pickupDate)}</strong>
              </div>
              <div className="detail-row">
                <span>Last updated</span>
                <strong>{dateLabel(checkout.updatedAt)}</strong>
              </div>
            </div>
          </section>
        </div>
        <div className="stack">
          <ReceiptPanel checkout={checkout} />
          <section className="panel aside-section">
            <h3>Refund with a clear confirmation.</h3>
            <p>
              This pilot supports one refund request per order, including a
              partial amount. You approve the exact order and amount. An unclear
              outcome is recovered using that same request.
            </p>
            {checkout.refundedMinor > 0 && (
              <div className="detail-row">
                <span>Already refunded</span>
                <strong>
                  {money(checkout.refundedMinor, checkout.quote.currency)}
                </strong>
              </div>
            )}
            {checkout.status === "PAID" &&
              !checkout.refundedMinor &&
              availableRefund > 0 &&
              !showRefund && (
                <Button
                  secondary
                  onClick={() => {
                    setRefundAmount((availableRefund / 100).toFixed(2));
                    setShowRefund(true);
                  }}
                >
                  Prepare a refund <ArrowRight size={13} />
                </Button>
              )}
            {showRefund && (
              <div className="refund-confirm">
                <h3>
                  {refundApproval
                    ? "Confirm this exact refund."
                    : "Choose the refund amount."}
                </h3>
                {refundApproval ? (
                  <>
                    <p>
                      Refund{" "}
                      <strong>
                        {money(
                          refundApproval.amountMinor,
                          refundApproval.currency,
                        )}
                      </strong>{" "}
                      for order{" "}
                      <strong className="refund-order-id">{checkout.id}</strong>
                      . This sends a refund request to PayPal sandbox.
                    </p>
                    <label className="approval-box">
                      <input
                        type="checkbox"
                        checked={confirm}
                        onChange={(event) => setConfirm(event.target.checked)}
                      />
                      <span>I approve this exact order and refund amount.</span>
                    </label>
                    <div className="refund-actions" style={{ marginTop: 15 }}>
                      <Button
                        disabled={!confirm || Boolean(busy)}
                        onClick={() => void refund()}
                      >
                        {busy === "refund" && (
                          <Loader2 className="spin" size={12} />
                        )}
                        Confirm refund
                      </Button>
                      <Button
                        quiet
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setRefundApproval(null);
                          setConfirm(false);
                        }}
                      >
                        Back
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Field
                      label={`Refund amount (${checkout.quote.currency})`}
                      hint={`Up to ${money(availableRefund, checkout.quote.currency)}`}
                    >
                      <input
                        type="number"
                        min="0.01"
                        max={availableRefund / 100}
                        step="0.01"
                        value={refundAmount}
                        onChange={(event) =>
                          setRefundAmount(event.target.value)
                        }
                      />
                    </Field>
                    <div className="refund-actions">
                      <Button
                        disabled={
                          Boolean(busy) ||
                          Number(refundAmount) <= 0 ||
                          Math.round(Number(refundAmount) * 100) >
                            availableRefund
                        }
                        onClick={() => void proposeRefund()}
                      >
                        {busy === "propose" && (
                          <Loader2 className="spin" size={12} />
                        )}
                        Review refund
                      </Button>
                      <Button quiet onClick={() => setShowRefund(false)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {checkout.status !== "PAID" && !checkout.refundedMinor && (
              <p className="disclosure" style={{ marginTop: 13 }}>
                A refund becomes available after a completed capture is
                verified.
              </p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export function CheckoutPage({
  id,
  access,
  cancelled = false,
}: {
  id: string;
  access?: string;
  cancelled?: boolean;
}) {
  const token = access || null;
  const returnedWithoutApproval = cancelled;
  const { data, loading, error, reload } = useResource(
    `/api/checkouts/${encodeURIComponent(id)}${token ? `?access=${encodeURIComponent(token)}` : ""}`,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  async function capture() {
    setBusy(true);
    setActionError("");
    try {
      await request(`/api/checkouts/${encodeURIComponent(id)}/capture`, {
        ...(token ? { access: token } : {}),
      });
      await reload();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to confirm the outcome. Check this payment again.",
      );
      await reload();
    } finally {
      setBusy(false);
    }
  }
  const checkout: Checkout | null = data;
  const paid = checkout?.status === "PAID";
  const uncertain =
    checkout && ["UNKNOWN", "PENDING", "MISMATCH"].includes(checkout.status);
  return (
    <div className="checkout-page">
      <header className="checkout-header">
        <Brand />
        <span>
          <ShieldCheck size={14} />A human-approved checkout
        </span>
      </header>
      {loading && !checkout ? (
        <PageLoading label="Opening your checkout" />
      ) : error || !checkout ? (
        <main className="checkout-main">
          <Notice tone="error">
            {error || "This checkout could not be found."}
          </Notice>
          <p style={{ marginTop: 20 }}>
            Use the original checkout link, or contact the store for help.
          </p>
        </main>
      ) : (
        <main className="checkout-main">
          <span className="eyebrow">A thoughtful finish</span>
          <h1>
            {paid
              ? "A purchase, confirmed."
              : uncertain
                ? "Let’s make sure."
                : checkout.status === "REFUNDED"
                  ? "Your refund is recorded."
                  : "Your order. Your approval."}
          </h1>
          <p>
            Review the exact total before continuing. This is a PayPal sandbox
            transaction.
          </p>
          {returnedWithoutApproval &&
            checkout.status === "AWAITING_APPROVAL" && (
              <div style={{ marginBottom: 22 }}>
                <Notice>
                  You returned from PayPal without completing approval. You can
                  resume this existing checkout when you’re ready.
                </Notice>
              </div>
            )}
          <div className="checkout-grid">
            <section className="panel checkout-stage">
              <span
                className={`checkout-stage-icon ${uncertain ? "warning" : ""}`}
              >
                {paid ? (
                  <CheckCheck size={24} />
                ) : uncertain ? (
                  <Clock3 size={23} />
                ) : (
                  <ShieldCheck size={23} />
                )}
              </span>
              <Badge tone={statusTone(checkout.status)} dot>
                {friendlyStatus(checkout.status)}
              </Badge>
              <h2>
                {paid
                  ? "All checked. All yours."
                  : uncertain
                    ? "Your payment outcome is still being checked."
                    : checkout.status === "CANCELLED"
                      ? "This checkout was cancelled."
                      : checkout.status === "REVERSED"
                        ? "The payment was reversed."
                        : checkout.status === "DECLINED"
                          ? "The payment wasn’t completed."
                          : checkout.status.includes("REFUNDED")
                            ? "A refund has been processed."
                            : "Continue securely with PayPal."}
              </h2>
              <p>
                {paid
                  ? "Doorway read the payment directly from PayPal and verified the order, amount, currency, and recipient. Your signed record is below."
                  : uncertain
                    ? "Please keep this order open. An uncertain result does not mean the payment failed. The store can check the existing payment without starting another charge."
                    : checkout.status === "AWAITING_APPROVAL"
                      ? "PayPal will show the amount and ask for your approval. Return here afterward to complete and verify the payment."
                      : checkout.status === "REVERSED"
                        ? "PayPal reports that this payment was reversed. Contact the store about the order before starting another payment."
                        : checkout.reason ||
                          "Payment is complete only after PayPal approval, capture, and a verified outcome."}
              </p>
              {checkout.status === "AWAITING_APPROVAL" &&
                checkout.approvalUrl && (
                  <a
                    href={checkout.approvalUrl}
                    className="button full-width"
                    style={{ marginTop: 23 }}
                  >
                    Continue to PayPal <ExternalLink size={14} />
                  </a>
                )}
              {["AWAITING_APPROVAL", "APPROVED"].includes(checkout.status) && (
                <Button
                  secondary
                  disabled={busy}
                  onClick={() => void capture()}
                >
                  {busy ? (
                    <Loader2 className="spin" size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  {checkout.status === "AWAITING_APPROVAL"
                    ? "I’ve approved in PayPal — complete order"
                    : "Complete & verify payment"}
                </Button>
              )}
              {(uncertain ||
                ["CREATING", "CAPTURING"].includes(checkout.status)) && (
                <Button
                  secondary
                  onClick={() => void reload()}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? "spin" : ""} />
                  Check latest status
                </Button>
              )}
              {actionError && <Notice tone="error">{actionError}</Notice>}
              <div className="checkout-trust">
                <ShieldCheck size={14} />
                <span>
                  The buyer approves the payment in PayPal. An agent cannot
                  approve or mark it paid.
                </span>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  <ShoppingBag size={15} />
                  Your order
                </h2>
                <Badge tone="amber">Sandbox</Badge>
              </div>
              <OrderLines quote={checkout.quote} />
              <div className="panel-content">
                <div className="detail-row">
                  <span>Collection</span>
                  <strong>{collectionLabel(checkout.quote.pickupDate)}</strong>
                </div>
                <div className="detail-row">
                  <span>Catalog</span>
                  <strong>Version {checkout.quote.catalogVersion}</strong>
                </div>
                <div className="detail-row">
                  <span>Order reference</span>
                  <strong>#{checkout.id.slice(0, 8)}</strong>
                </div>
              </div>
            </section>
            {checkout.receipt && (
              <div style={{ gridColumn: "1/-1" }}>
                <ReceiptPanel checkout={checkout} token={token || undefined} />
              </div>
            )}
          </div>
          <div className="checkout-footer">
            <ShieldCheck size={13} />
            Sandbox payments move test funds only. Keep this link to check your
            order.
          </div>
        </main>
      )}
    </div>
  );
}

export function PublicStorePage({ slug }: { slug: string }) {
  const { data, loading, error } = useResource(
    `/api/store/${encodeURIComponent(slug)}`,
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pickupDate, setPickupDate] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [quoteRecovery, setQuoteRecovery] = useState<unknown>(null);
  const [checkoutInfo, setCheckoutInfo] = useState<any>(null);
  const shop: Shop | undefined = data?.shop;
  const catalog: Catalog | undefined = data?.catalog;
  const availability: Record<string, number> = data?.availability || {};
  const availableStock = (product: Product) =>
    availability[product.id] ?? product.stock;
  const cartCount = Object.values(quantities).reduce(
    (sum, value) => sum + value,
    0,
  );
  async function getQuote() {
    setBusy("quote");
    setActionError("");
    setQuoteRecovery(null);
    setQuote(null);
    setCheckoutInfo(null);
    try {
      setQuote(
        await request(`/api/store/${encodeURIComponent(slug)}/quote`, {
          lines: Object.entries(quantities)
            .filter(([, quantity]) => quantity > 0)
            .map(([productId, quantity]) => ({ productId, quantity })),
          ...(pickupDate ? { pickupDate } : {}),
        }),
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to quote this order.",
      );
      setQuoteRecovery(error instanceof RequestError ? error.details : null);
    } finally {
      setBusy("");
    }
  }
  async function startCheckout() {
    if (!quote) return;
    setBusy("checkout");
    setActionError("");
    setQuoteRecovery(null);
    try {
      const info = await request(
        `/api/store/${encodeURIComponent(slug)}/checkout`,
        { quoteId: quote.id },
      );
      setCheckoutInfo(info);
      const buyerToken =
        info.access || info.token || info.checkoutToken || info.buyerToken;
      window.location.assign(
        `/checkout/${encodeURIComponent(info.checkout.id)}${buyerToken ? `?access=${encodeURIComponent(buyerToken)}` : ""}`,
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to begin checkout. Your order has not been marked paid.",
      );
      setQuoteRecovery(error instanceof RequestError ? error.details : null);
    } finally {
      setBusy("");
    }
  }
  if (loading)
    return (
      <div>
        <header className="store-header">
          <Brand />
        </header>
        <PageLoading label="Opening this storefront" />
      </div>
    );
  if (error || !shop || !catalog)
    return (
      <div>
        <header className="store-header">
          <Brand />
        </header>
        <main className="store-main">
          <EmptyState
            title="This doorway isn’t open yet."
            icon={<Store />}
            action={
              <Button href="/" secondary>
                Back to Doorway
              </Button>
            }
          >
            {error ||
              "This store may still be preparing its catalog. Check back using the link the store shared."}
          </EmptyState>
        </main>
      </div>
    );
  return (
    <div>
      <header className="store-header">
        <span className="shop-title">{shop.name}</span>
        <Brand />
      </header>
      <main className="store-main">
        <div className="store-intro">
          <span className="eyebrow">
            <span className="status-dot" />
            Owner-reviewed catalog · v{catalog.version}
          </span>
          <h1>A good find starts here.</h1>
          <p>
            Choose from {shop.name}’s approved catalog. Your final order is
            checked against the store’s current pricing and rules.
          </p>
        </div>
        {shop.fixture && (
          <div style={{ marginBottom: 24 }}>
            <Notice>
              Fictional test storefront · These products are synthetic. Checkout
              uses PayPal sandbox test funds.
            </Notice>
          </div>
        )}
        <ShoppingAssistant slug={slug} />
        <div className="catalog-grid">
          {catalog.products.map((product) => (
            <article
              className="panel catalog-item"
              id={`product-${product.id}`}
              key={product.id}
            >
              <div className="catalog-product-art">
                <Package />
              </div>
              <h2>{product.name}</h2>
              <p>{product.description}</p>
              {product.attributes?.dietary?.length ? (
                <div className="inline-actions" style={{ marginTop: 10 }}>
                  {product.attributes.dietary.map((attribute) => (
                    <Badge key={attribute} tone="green">
                      {attribute}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="catalog-item-bottom">
                <div>
                  <strong>{money(product.priceMinor, product.currency)}</strong>
                  <div className="product-subtitle">
                    {availableStock(product) > 0
                      ? `${availableStock(product)} available`
                      : "Currently unavailable"}
                  </div>
                </div>
                {quantities[product.id] ? (
                  <div className="inline-actions">
                    <button
                      className="icon-button"
                      aria-label={`Remove one ${product.name}`}
                      onClick={() => {
                        setQuantities({
                          ...quantities,
                          [product.id]: Math.max(0, quantities[product.id] - 1),
                        });
                        setQuote(null);
                      }}
                    >
                      −
                    </button>
                    <span aria-live="polite" className="small-text">
                      {quantities[product.id]}
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`Add one ${product.name}`}
                      disabled={
                        quantities[product.id] >= availableStock(product)
                      }
                      onClick={() => {
                        setQuantities({
                          ...quantities,
                          [product.id]: quantities[product.id] + 1,
                        });
                        setQuote(null);
                      }}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <Button
                    secondary
                    disabled={!availableStock(product)}
                    onClick={() => {
                      setQuantities({ ...quantities, [product.id]: 1 });
                      setQuote(null);
                    }}
                  >
                    <PlusIcon />
                    Add to order
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
        <section className="panel store-rules">
          <FileCheck2 size={22} />
          <div>
            <h2>A few words from the store.</h2>
            <p>{catalog.rules.deliveryPolicy}</p>
            <p>{catalog.rules.returnsPolicy}</p>
            <p>
              Collection days:{" "}
              {catalog.rules.pickupDays
                .map(
                  (day) =>
                    [
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ][day],
                )
                .join(", ")}
              . Preparation time: {catalog.rules.leadTimeHours} hours.
            </p>
            {catalog.rules.bulkDiscount && (
              <p>
                Bulk rule: {catalog.rules.bulkDiscount.percentOff}% off from{" "}
                {catalog.rules.bulkDiscount.minQuantity} items. The final quote
                applies the approved rule.
              </p>
            )}
          </div>
        </section>
        <section className="panel" style={{ marginTop: 25 }}>
          <div className="panel-heading">
            <h2>
              <ShoppingBag size={16} />
              Your order{" "}
              <span className="muted small-text">
                ({cartCount} {cartCount === 1 ? "item" : "items"})
              </span>
            </h2>
            <Badge tone="amber">Sandbox</Badge>
          </div>
          <div className="panel-content">
            {cartCount ? (
              <>
                <div className="form-grid">
                  <Field
                    label="Preferred collection date"
                    hint="The store’s allowed days and preparation time are checked in your quote."
                  >
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={pickupDate}
                      onInput={(event) => {
                        setPickupDate(event.currentTarget.value);
                        setQuote(null);
                      }}
                      onChange={(event) => {
                        setPickupDate(event.target.value);
                        setQuote(null);
                      }}
                    />
                  </Field>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Button
                      disabled={Boolean(busy)}
                      onClick={() => void getQuote()}
                    >
                      {busy === "quote" ? (
                        <Loader2 className="spin" size={14} />
                      ) : (
                        <FileCheck2 size={14} />
                      )}
                      Check price & availability
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="small-text muted">
                Add a product to start your order. You’ll review the exact total
                before continuing to PayPal.
              </p>
            )}
            {actionError && (
              <div style={{ marginTop: 19 }}>
                <Notice tone="error">{actionError}</Notice>
                <QuoteRecovery
                  details={quoteRecovery}
                  catalog={catalog}
                  currency={shop.currency}
                />
              </div>
            )}
          </div>
          {quote && (
            <>
              <OrderLines quote={quote} />
              <div className="panel-content">
                <div className="inline-actions" style={{ marginBottom: 17 }}>
                  {quote.checkedRules.map((rule) => (
                    <Badge key={rule} tone="green">
                      <Check size={10} />
                      {rule.replaceAll("_", " ")}
                    </Badge>
                  ))}
                </div>
                <div className="form-actions" style={{ marginTop: 0 }}>
                  <span>
                    <Clock3 size={12} />
                    Quote valid until{" "}
                    {new Date(quote.expiresAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    . Changes need a new quote.
                  </span>
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() => void startCheckout()}
                  >
                    {busy === "checkout" ? (
                      <Loader2 className="spin" size={14} />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    Continue to checkout <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
        <p className="disclosure" style={{ marginTop: 21 }}>
          Payment requires the buyer’s PayPal approval. Products are offered
          using the approved catalog shown above; stock in other sales channels
          is not reserved by this storefront.
        </p>
      </main>
    </div>
  );
}

function PlusIcon() {
  return (
    <span aria-hidden="true" style={{ fontSize: 15, fontWeight: 400 }}>
      +
    </span>
  );
}

function QuoteRecovery({
  details,
  catalog,
  currency,
}: {
  details: unknown;
  catalog: Catalog;
  currency: string;
}) {
  if (!details || typeof details !== "object") return null;
  const value = details as Record<string, unknown>;
  const suggested = Array.isArray(value.alternatives)
    ? value.alternatives
        .filter(
          (item) =>
            item &&
            typeof item === "object" &&
            typeof item.productId === "string",
        )
        .map((item) => item.productId as string)
    : [];
  const alternatives = catalog.products.filter((product) =>
    suggested.includes(product.id),
  );
  const days = Array.isArray(value.allowedDays)
    ? [
        ...new Set(
          value.allowedDays.filter(
            (day) => Number.isInteger(day) && day >= 0 && day <= 6,
          ),
        ),
      ]
    : [];
  const minimum =
    typeof value.minimumMinor === "number" &&
    Number.isSafeInteger(value.minimumMinor) &&
    value.minimumMinor > 0
      ? value.minimumMinor
      : null;
  if (!alternatives.length && !days.length && !minimum) return null;
  return (
    <div className="quote-recovery" role="status">
      <h3>A few options to consider.</h3>
      {alternatives.length > 0 && (
        <>
          <p>
            The owner permits these alternatives. Review each product’s
            confirmed details and choose the item and quantity yourself.
          </p>
          <div className="recovery-options">
            {alternatives.map((product) => (
              <a
                href={`#product-${encodeURIComponent(product.id)}`}
                key={product.id}
              >
                {product.name}
                <ArrowUpRight size={12} />
              </a>
            ))}
          </div>
        </>
      )}
      {days.length > 0 && (
        <p>
          Available collection weekdays:{" "}
          <strong>
            {days
              .map(
                (day) =>
                  [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ][day],
              )
              .join(", ")}
          </strong>
          . Choose a suitable date in the date field.
        </p>
      )}
      {minimum && (
        <p>
          The store’s minimum order is{" "}
          <strong>{money(minimum, currency)}</strong>.
        </p>
      )}
      <p className="recovery-reminder">
        Update your own selection, remove any item you replace, then check the
        price and availability again. No product, quantity, or date has been
        changed automatically.
      </p>
    </div>
  );
}

function ShoppingAssistant({ slug }: { slug: string }) {
  const [intent, setIntent] = useState("");
  const [prepare, setPrepare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  async function ask() {
    setBusy(true);
    setError("");
    setRun(null);
    setCheckoutUrl("");
    try {
      const result = await request(`/api/shopper/${encodeURIComponent(slug)}`, {
        intent,
        prepareCheckout: prepare,
      });
      setRun(result.run);
      if (result.checkoutUrl) {
        const target = new URL(result.checkoutUrl, window.location.origin);
        if (
          target.origin === window.location.origin &&
          target.pathname.startsWith("/checkout/")
        )
          setCheckoutUrl(target.pathname + target.search);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The shopping assistant couldn’t complete this request.",
      );
    } finally {
      setBusy(false);
    }
  }
  const names: Record<string, string> = {
    search_products: "Look through the catalog",
    check_availability: "Check availability and rules",
    quote: "Check the exact price",
    create_cart: "Prepare your selected items",
    start_checkout: "Prepare checkout for your review",
  };
  return (
    <section className="panel shopper-assistant">
      <div className="panel-heading">
        <div>
          <h2>
            <Sparkles size={16} />
            Looking for something particular?
          </h2>
          <p>
            Ask the shopping assistant to explore this store’s approved catalog.
          </p>
        </div>
        <Badge tone="neutral">Shopping assistant</Badge>
      </div>
      <div className="panel-content">
        <textarea
          className="test-intent"
          aria-label="Your shopping request"
          maxLength={1000}
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder="Tell us what you need, how many, and when you’d like to collect it."
        />
        <label className="approval-box" style={{ marginTop: 15 }}>
          <input
            type="checkbox"
            checked={prepare}
            onChange={(event) => setPrepare(event.target.checked)}
          />
          <span>
            Prepare a PayPal sandbox checkout for my review if this request can
            be met. I will approve any payment myself in PayPal.
          </span>
        </label>
        {error && (
          <div style={{ marginTop: 17 }}>
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {run && (
          <div className="shopper-result">
            <div className="run-header">
              <div>
                <h3>
                  {checkoutUrl
                    ? "Your checkout is ready to review."
                    : run.status === "PASSED"
                      ? "Here’s what the store could offer."
                      : "A few details to work through."}
                </h3>
                <div className="run-meta">
                  <span>Catalog v{run.catalogVersion}</span>
                  <span>·</span>
                  <span>{dateLabel(run.createdAt)}</span>
                  <span>·</span>
                  <span>
                    {run.source === "LIVE_AI"
                      ? "Live AI run"
                      : friendlyStatus(run.source)}
                  </span>
                </div>
              </div>
              <Badge tone={statusTone(run.status)}>
                {friendlyStatus(run.status)}
              </Badge>
            </div>
            {run.steps.length > 0 && (
              <ol className="shopper-steps">
                {run.steps.map((step, index) => {
                  const output = step.output as any;
                  const hasError = Boolean(output?.error || output?.isError);
                  return (
                    <li key={index}>
                      <span className={hasError ? "shopper-step-warning" : ""}>
                        {hasError ? (
                          <TriangleAlert size={12} />
                        ) : (
                          <Check size={12} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {names[step.tool] || step.tool.replaceAll("_", " ")}
                        </strong>
                        {typeof output?.message === "string" && (
                          <p>{output.message}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {run.findings.map((finding, index) => (
              <Notice
                key={index}
                tone={run.status === "PASSED" ? "info" : "warning"}
              >
                {finding.message}
              </Notice>
            ))}
            {checkoutUrl && (
              <Button href={checkoutUrl}>
                Review prepared checkout <ArrowRight size={14} />
              </Button>
            )}
            <p className="disclosure">
              This shopping run is recorded. Your payment requires a separate
              approval in PayPal and a verified result.
            </p>
          </div>
        )}
      </div>
      <div className="panel-bottom">
        <span>
          <ShieldCheck size={12} />
          Your rules and prices are checked by the store.
        </span>
        <Button
          disabled={busy || intent.trim().length < 3}
          onClick={() => void ask()}
        >
          {busy ? (
            <Loader2 className="spin" size={14} />
          ) : (
            <Sparkles size={14} />
          )}
          {busy ? "Exploring the catalog…" : "Ask the shopping assistant"}
        </Button>
      </div>
    </section>
  );
}
