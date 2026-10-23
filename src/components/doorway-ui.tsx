"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  Globe2,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TestTube2,
  TriangleAlert,
  X,
} from "lucide-react";

export type RecordData = Record<string, any>;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export async function request(
  path: string,
  data?: unknown,
  method?: string,
): Promise<any> {
  const response = await fetch(path, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    credentials: "same-origin",
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const explanations: Record<string, string> = {
      PICKUP_DAY_UNAVAILABLE:
        "This store doesn’t offer collection on that day. Choose one of the collection days shown in its rules.",
      LEAD_TIME_NOT_MET:
        "This collection date is too soon. Choose a later date to allow the store’s preparation time.",
      INSUFFICIENT_STOCK:
        "The available quantity has changed. Reduce your order and check availability again.",
      OUT_OF_STOCK:
        "The selected quantity is unavailable. Review the options below and choose a fresh selection.",
      DIETARY_ATTRIBUTE_UNCONFIRMED:
        "The store has not confirmed the requested dietary attributes for this selection. Review the products’ confirmed details before choosing an alternative.",
      QUOTE_EXPIRED:
        "This quote has expired. Check the price and availability again before continuing.",
      CATALOG_CHANGED:
        "The store’s catalog changed. Review a fresh quote before continuing.",
      CATALOG_CHANGED_REQUOTE_REQUIRED:
        "The store’s catalog changed. Review a fresh quote before continuing.",
      QUOTE_CHANGED_REQUOTE_REQUIRED:
        "The price or availability changed. Check a fresh quote before continuing.",
      MINIMUM_ORDER_NOT_MET:
        "This order is below the store’s minimum. Add products and request a new quote.",
    };
    throw new RequestError(
      explanations[result.error?.code] ||
        result.error?.message ||
        result.error ||
        result.message ||
        "Something went wrong. Please try again.",
      result.error?.code,
      result.error?.details,
    );
  }
  return result.data === undefined ? result : result.data;
}

export function useResource(path: string | null) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(path));
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError("");
    try {
      setData(await request(path));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load this page.",
      );
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="Doorway home"
    >
      <span className="brand-symbol">
        <span />
      </span>
      <span>
        doorway<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}

export function Button({
  children,
  href,
  className = "",
  secondary,
  quiet,
  ...props
}: {
  children: ReactNode;
  href?: string;
  className?: string;
  secondary?: boolean;
  quiet?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `button ${secondary ? "button-secondary" : ""} ${quiet ? "button-quiet" : ""} ${className}`;
  if (href)
    return (
      <Link className={classes} href={href}>
        {children}
      </Link>
    );
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="status-dot" />}
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? (
        <Check size={18} />
      ) : tone === "error" || tone === "warning" ? (
        <TriangleAlert size={18} />
      ) : (
        <CircleHelp size={18} />
      )}
      <div>{children}</div>
    </div>
  );
}

export function PageLoading({
  label = "Opening your workspace",
}: {
  label?: string;
}) {
  return (
    <div className="page-loading" role="status">
      <Loader2 className="spin" size={24} />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({
  icon = <Store />,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function navigateTabs(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    ) || [],
  );
  const index = tabs.indexOf(event.currentTarget);
  if (!tabs.length) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].focus();
  tabs[next].click();
}

export function AppShell({
  children,
  shopName,
}: {
  children: ReactNode;
  shopName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    let live = true;
    void request("/api/auth/me")
      .then((result) => {
        if (live && !result.user) router.replace("/login");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [router]);
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Brand />
          <span className="header-divider" />
          <span className="workspace-label">
            Merchant workspace
            <ChevronDown size={13} />
          </span>
          <nav
            id="workspace-nav"
            className={`app-nav ${menu ? "open" : ""}`}
            aria-label="Main navigation"
          >
            <Link
              className={
                pathname === "/dashboard" || pathname.startsWith("/shops")
                  ? "active"
                  : ""
              }
              href="/dashboard"
            >
              <LayoutGrid size={15} />
              Overview
            </Link>
            <Link
              className={pathname.startsWith("/orders") ? "active" : ""}
              href="/orders"
            >
              <ShoppingBag size={15} />
              Orders
            </Link>
          </nav>
          <div className="header-actions">
            <Badge tone="amber">Sandbox</Badge>
            <button
              className="avatar"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await request("/api/auth/logout", {});
                router.push("/");
              }}
            >
              D
            </button>
            <button
              className="mobile-menu icon-button"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              aria-controls="workspace-nav"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">
        <div className="breadcrumb">
          <Link href="/dashboard">Workspace</Link>
          <ChevronRight size={12} />
          <span>
            {shopName ||
              (pathname.startsWith("/orders")
                ? "Orders"
                : pathname === "/shops/new"
                  ? "Connect a store"
                  : "Overview")}
          </span>
        </div>
        {children}
      </main>
      <footer className="app-footer">
        <span>Thoughtfully open for what’s next.</span>
        <span>
          <span className="status-dot" />
          Your data. Your rules. Your approval.
        </span>
      </footer>
    </div>
  );
}

export function WelcomePage() {
  return (
    <div className="welcome">
      <header className="marketing-header">
        <Brand />
        <nav aria-label="Site navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#your-control">Built for trust</a>
        </nav>
        <div className="marketing-actions">
          <Link href="/login" className="text-link">
            Log in
          </Link>
          <Button href="/register">
            Open your doorway <ArrowUpRight size={15} />
          </Button>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-sun" /> A new way into your store
            </span>
            <h1>
              Your store.
              <br />
              Their next
              <br />
              <em>great find.</em>
            </h1>
            <p>
              Make your products easier for shopping agents to understand.
              Review your catalog, set the ground rules, and keep every purchase
              in human hands.
            </p>
            <div className="hero-actions">
              <Button href="/register">
                Connect your store <ArrowRight size={17} />
              </Button>
              <a href="#how-it-works" className="understated-link">
                See how it works <span>↗</span>
              </a>
            </div>
            <div className="hero-proof">
              <span className="small-check">
                <Check size={12} />
              </span>
              Start with your website. Publish when you’re ready.
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="An open doorway connecting your store with a reviewed catalog"
          >
            <span className="art-grid" />
            <div className="doorway-shadow" />
            <div className="architectural-door">
              <div className="door-inner">
                <span className="door-glow" />
                <div className="door-horizon" />
                <span className="door-floor" />
              </div>
              <div className="open-door">
                <span className="door-handle" />
              </div>
            </div>
            <div className="floating-card catalog-art">
              <div className="art-icon">
                <Package size={18} />
              </div>
              <div>
                <small>YOUR CATALOG</small>
                <strong>Ready to be discovered</strong>
                <span>
                  <span className="status-dot" />
                  Reviewed by you
                </span>
              </div>
              <span className="art-card-check">
                <Check size={13} />
              </span>
            </div>
            <div className="floating-card approval-art">
              <span className="approval-round">
                <ShieldCheck size={20} />
              </span>
              <div>
                <strong>Your store. Your say.</strong>
                <span>Every purchase needs approval.</span>
              </div>
            </div>
            <span className="art-caption">
              Good things begin with an open door.
            </span>
            <span className="art-sparkle art-sparkle-one">✳</span>
            <span className="art-sparkle art-sparkle-two">+</span>
          </div>
        </section>
        <div className="value-strip">
          <span>
            <FileCheck2 size={18} />A catalog you’ve checked
          </span>
          <span>
            <ShieldCheck size={18} />
            Rules you control
          </span>
          <span>
            <ShoppingBag size={18} />
            PayPal human approval
          </span>
          <span>
            <CheckCheck size={18} />A traceable outcome
          </span>
        </div>
        <section id="how-it-works" className="how-section">
          <div className="section-intro">
            <span className="eyebrow">From website to welcome</span>
            <h2>
              A little preparation.
              <br />
              <em>A clearer path to purchase.</em>
            </h2>
            <p>
              Bring your storefront. We’ll help you make the important details
              clear, and show you what still needs attention.
            </p>
          </div>
          <div className="how-grid">
            {[
              {
                number: "01",
                icon: <Globe2 />,
                title: "Bring your store",
                text: "Import your website into a private draft. See where each product detail came from.",
              },
              {
                number: "02",
                icon: <TestTube2 />,
                title: "Put it to the test",
                text: "Try a shopping request, find the gaps, and confirm the details only you know.",
              },
              {
                number: "03",
                icon: <Store />,
                title: "Open with confidence",
                text: "Verify your domain and approve your catalog. Follow orders from approval to receipt.",
              },
            ].map((step) => (
              <article key={step.number}>
                <div className="step-top">
                  <span>{step.number}</span>
                  {step.icon}
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="your-control" className="trust-section">
          <div className="trust-illustration">
            <span className="trust-orbit orbit-one" />
            <span className="trust-orbit orbit-two" />
            <div className="trust-shield">
              <ShieldCheck size={45} strokeWidth={1.35} />
            </div>
            <span className="trust-label trust-label-one">
              <Check size={12} /> Owner reviewed
            </span>
            <span className="trust-label trust-label-two">
              <Check size={12} /> Buyer approved
            </span>
          </div>
          <div>
            <span className="eyebrow">Trust is in the details</span>
            <h2>
              Open the door.
              <br />
              <em>Keep the keys.</em>
            </h2>
            <p>
              Your website becomes a draft, never an automatic promise. You
              approve your products and policies. The buyer approves the
              purchase in PayPal. And payment is marked complete only after it’s
              verified.
            </p>
            <Link href="/register" className="arrow-link">
              Build your store’s next chapter <ArrowRight size={17} />
            </Link>
          </div>
        </section>
        <section className="closing-cta">
          <span className="eyebrow">Let’s see what’s possible</span>
          <h2>
            Your next customer could
            <br />
            arrive a little differently.
          </h2>
          <Button href="/register">
            Get your store ready <ArrowUpRight size={16} />
          </Button>
          <p>No card required. Sandbox payments while you test.</p>
        </section>
      </main>
      <footer className="marketing-footer">
        <Brand />
        <p>Better connections. Thoughtful commerce.</p>
        <span>© {new Date().getFullYear()} Doorway</span>
      </footer>
    </div>
  );
}

export function AuthPage({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request(
        register ? "/api/auth/register" : "/api/auth/login",
        values,
      );
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand light />
        <div>
          <span className="eyebrow">Make room for what’s next</span>
          <h1>
            A new doorway.
            <br />
            <em>
              The same
              <br />
              careful shopkeeper.
            </em>
          </h1>
          <p>
            Bring the care you put into your store to the way agents discover
            and shop it.
          </p>
          <div className="auth-promise">
            <ShieldCheck size={22} />
            <span>
              You review the details.
              <br />
              You decide when to open.
            </span>
          </div>
        </div>
        <span className="auth-caption">
          Your store. Your rules. Your approval.
        </span>
        <div className="auth-arch" />
      </aside>
      <main className="auth-form-area">
        <Link className="back-link" href="/">
          ← Back to Doorway
        </Link>
        <div className="auth-form-wrap">
          <span className="eyebrow">Merchant workspace</span>
          <h2>{register ? "A good place to begin." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create your account and get your first store ready."
              : "A clearer view of your store is just ahead."}
          </p>
          <form onSubmit={submit}>
            <Field label="Email address">
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@yourstore.com"
                required
              />
            </Field>
            <Field
              label="Password"
              hint={register ? "Use at least 12 characters." : undefined}
            >
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 12 : 1}
                required
                placeholder={
                  register ? "Create a secure password" : "Enter your password"
                }
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button className="full-width" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : register ? (
                "Create your account"
              ) : (
                "Log in"
              )}
              {!busy && <ArrowRight size={17} />}
            </Button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to Doorway?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Log in" : "Create an account"}
            </Link>
          </p>
          <div className="auth-footnote">
            <ShieldCheck size={15} />
            <span>
              Private by default. Your store stays unpublished until you approve
              it.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export function money(cents: number | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    (cents || 0) / 100,
  );
}
export function dateLabel(value?: string) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
export function statusTone(status?: string) {
  return /paid|completed|approved|published|passed|verified/i.test(status || "")
    ? "green"
    : /fail|declin|error|cancel|reversed|mismatch/i.test(status || "")
      ? "red"
      : /unknown|pending|draft|awaiting|review/i.test(status || "")
        ? "amber"
        : "neutral";
}
export function friendlyStatus(status?: string) {
  return (status || "Draft")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}
