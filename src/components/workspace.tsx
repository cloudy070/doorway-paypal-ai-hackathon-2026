"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  Globe2,
  Loader2,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TestTube2,
  TriangleAlert,
} from "lucide-react";
import type { AgentRun, Catalog, Product, Rules, Shop } from "@/lib/domain";
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  Field,
  Notice,
  PageLoading,
  dateLabel,
  friendlyStatus,
  money,
  navigateTabs,
  request,
  statusTone,
  useResource,
} from "./doorway-ui";

const StudioPanel = dynamic(() => import("./studio-panel"), {
  ssr: false,
  loading: () => (
    <div className="panel">
      <PageLoading label="Opening interactive evidence" />
    </div>
  ),
});

function useOwner() {
  const router = useRouter();
  const auth = useResource("/api/auth/me");
  useEffect(() => {
    if (!auth.loading && auth.data && !auth.data.user) router.replace("/login");
  }, [auth.loading, auth.data, router]);
  return auth;
}

export function DashboardPage() {
  useOwner();
  const { data: shops, loading, error, reload } = useResource("/api/shops");
  const { data: status } = useResource("/api/status");
  const [search, setSearch] = useState("");
  const storeList: Shop[] = Array.isArray(shops) ? shops : [];
  const filtered = storeList.filter((shop) =>
    `${shop.name} ${shop.siteUrl}`.toLowerCase().includes(search.toLowerCase()),
  );
  const published = storeList.filter((shop) => shop.publishedVersion).length;
  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A little more possibility</span>
          <h1>Your stores, at a glance.</h1>
          <p>
            A place to prepare your catalog, check the details, and follow what
            happens next.
          </p>
        </div>
        <Button href="/shops/new">
          <Plus size={15} />
          Connect a store
        </Button>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">
            <Store size={14} />
            Connected stores
          </span>
          <div className="stat-value">
            {loading || error ? "—" : storeList.length}
          </div>
          <small>In your workspace</small>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Globe2 size={14} />
            Open doorways
          </span>
          <div className="stat-value">{loading || error ? "—" : published}</div>
          <small>Owner-approved and published</small>
        </div>
        <div className="stat">
          <span className="stat-label">
            <FileCheck2 size={14} />
            In preparation
          </span>
          <div className="stat-value">
            {loading || error ? "—" : storeList.length - published}
          </div>
          <small>Private until you publish</small>
        </div>
        <div className="stat">
          <span className="stat-label">
            <ShieldCheck size={14} />
            Payment environment
          </span>
          <div className="stat-value" style={{ fontSize: 26, paddingTop: 5 }}>
            Sandbox
          </div>
          <small>
            {status?.services?.paypal
              ? "PayPal connected"
              : "Connect PayPal to test payments"}
          </small>
        </div>
      </div>
      <div className="section-toolbar">
        <h2>
          Your storefronts{" "}
          <span className="muted small-text">({storeList.length})</span>
        </h2>
        <div className="search-wrap">
          <Search size={13} />
          <input
            className="search-input"
            aria-label="Search your stores"
            placeholder="Find a store…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {error ? (
        <Notice tone="error">
          {error}{" "}
          <button className="text-link" onClick={() => void reload()}>
            Try again
          </button>
        </Notice>
      ) : loading ? (
        <PageLoading label="Loading your stores" />
      ) : !storeList.length ? (
        <div className="panel">
          <EmptyState
            title="Every good store starts somewhere."
            action={
              <Button href="/shops/new">
                Connect your first store <ArrowRight size={15} />
              </Button>
            }
          >
            Bring your website into a private draft. You’ll review the products
            and rules before anything is published.
          </EmptyState>
        </div>
      ) : (
        <div className="shop-grid">
          {filtered.map((shop) => (
            <article key={shop.id} className="panel shop-card">
              <div className="shop-card-top">
                <span className="shop-monogram">{shop.name.slice(0, 1)}</span>
                <div>
                  <h3>{shop.name}</h3>
                  <p>
                    {shop.fixture
                      ? "Controlled local test store"
                      : new URL(shop.siteUrl).hostname}
                  </p>
                </div>
                <Badge tone={shop.publishedVersion ? "green" : "amber"} dot>
                  {shop.publishedVersion ? "Published" : "In preparation"}
                </Badge>
              </div>
              <div className="shop-card-bottom">
                <div className="shop-card-meta">
                  <span>
                    {shop.domainVerified ? (
                      <>
                        <Check size={12} /> Domain checked
                      </>
                    ) : (
                      <>
                        <Clock3 size={12} /> Domain to verify
                      </>
                    )}
                  </span>
                  {shop.publishedVersion && (
                    <span>Version {shop.publishedVersion}</span>
                  )}
                </div>
                <Link href={`/shops/${shop.id}`}>
                  Open store <ArrowUpRight size={13} />
                </Link>
              </div>
            </article>
          ))}
          {!search && (
            <Link className="panel add-shop-card" href="/shops/new">
              <span>
                <Plus size={18} />
              </span>
              <div>
                <h3>Make room for another store</h3>
                <p>Connect a website in a few steps.</p>
              </div>
            </Link>
          )}
          {search && !filtered.length && (
            <div className="panel" style={{ gridColumn: "1/-1" }}>
              <EmptyState title="No stores by that name." icon={<Search />}>
                Try another name or website address.
              </EmptyState>
            </div>
          )}
        </div>
      )}
      <div className="dashboard-aside">
        <div className="panel quiet-panel">
          <TestTube2 size={23} />
          <div>
            <h3>A small test. A useful discovery.</h3>
            <p>
              Test My Store shows what a shopping request can and can’t do with
              your current catalog. Fix the details, then try the same request
              again.
            </p>
            {storeList.length ? (
              <Link href={`/shops/${storeList[0].id}/test`}>
                Try a store check <ArrowRight size={13} />
              </Link>
            ) : (
              <Link href="/shops/new">
                Start with your store <ArrowRight size={13} />
              </Link>
            )}
          </div>
        </div>
        <div className="panel quiet-panel">
          <ShieldCheck size={23} />
          <div>
            <h3>Know what’s connected.</h3>
            <p>
              Your workspace uses real service status. Missing connections stay
              visible so you know what’s ready to test.
            </p>
            <div className="inline-actions">
              <Badge tone={status?.services?.ai ? "green" : "amber"}>
                {status?.services?.ai ? "AI connected" : "AI needs setup"}
              </Badge>
              <Badge tone={status?.services?.paypal ? "green" : "amber"}>
                {status?.services?.paypal
                  ? "PayPal connected"
                  : "PayPal needs setup"}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export function StoreSteps({ current }: { current: number }) {
  return (
    <div className="stepper" aria-label="Store setup progress">
      {[
        "Connect",
        "Review catalog",
        "Set your rules",
        "Verify domain",
        "Open doorway",
      ].map((label, index) => (
        <div
          className={`stepper-step ${index === current ? "active" : index < current ? "complete" : ""}`}
          key={label}
        >
          <span>{index < current ? <Check size={11} /> : index + 1}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

function ProductEvidence({
  catalog,
  product,
}: {
  catalog: Catalog;
  product: Product;
}) {
  const fields = (catalog.fieldEvidence as any)?.products?.[product.id];
  if (!fields) return null;
  const labels: Record<string, string> = {
    name: "Name",
    description: "Description",
    priceMinor: "Price",
    currency: "Currency",
    stock: "Stock",
    dietary: "Dietary details",
  };
  return (
    <details className="evidence-disclosure">
      <summary>View original field evidence & confidence</summary>
      <div className="field-evidence-list">
        {Object.entries(fields).map(([key, raw]) => {
          const field = raw as any;
          return (
            <div key={key} className="field-evidence">
              <div>
                <strong>{labels[key] || key}</strong>
                <Badge
                  tone={
                    field.status === "known" ||
                    field.status === "owner_confirmed"
                      ? "green"
                      : "amber"
                  }
                >
                  {friendlyStatus(field.status)}
                </Badge>
                {typeof field.confidence === "number" && (
                  <span>
                    {Math.round(field.confidence * 100)}% extraction confidence
                  </span>
                )}
              </div>
              {field.note && <p>{field.note}</p>}
              {field.evidence?.map((evidence: any, index: number) => (
                <blockquote key={index}>
                  “{evidence.quote}”{" "}
                  <span>Source page {evidence.sourceIndex + 1}</span>
                </blockquote>
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ProductAlternatives({
  product,
  products,
  onChange,
}: {
  product: Product;
  products: Product[];
  onChange: (ids: string[]) => void;
}) {
  const options = products.filter((item) => item.id !== product.id);
  if (!options.length) return null;
  const selected = product.allowedAlternatives || [];
  return (
    <details className="alternative-editor">
      <summary>
        Owner-approved alternatives <span>({selected.length})</span>
      </summary>
      <p>
        Select products you allow the buyer to consider when this item is
        unavailable. This does not add dietary attributes or change a buyer’s
        order automatically.
      </p>
      <div>
        {options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                )
              }
            />
            <span>{option.name}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function ShopActivity({ data }: { data: any }) {
  const orders: any[] = data.orders || [];
  const runs: AgentRun[] = data.runs || [];
  const unmet: any[] = data.unmetIntents || [];
  const reasons = runs
    .flatMap((run) => run.findings)
    .reduce(
      (counts, finding) => ({
        ...counts,
        [finding.code]: (counts[finding.code] || 0) + 1,
      }),
      {} as Record<string, number>,
    );
  return (
    <div className="stack">
      <StudioPanel
        orders={orders}
        runs={runs}
        unmetIntents={unmet}
        shopId={data.shop.id}
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>What your store has observed</h2>
            <p>
              Recorded activity from this store, with test origins kept visible.
            </p>
          </div>
        </div>
        <div
          className="stat-grid"
          style={{ margin: 0, border: 0, borderRadius: 0 }}
        >
          <div className="stat">
            <span className="stat-label">Private checks</span>
            <div className="stat-value">{runs.length}</div>
            <small>Recorded preflight runs</small>
          </div>
          <div className="stat">
            <span className="stat-label">Blocked checks</span>
            <div className="stat-value">
              {runs.filter((run) => run.status === "BLOCKED").length}
            </div>
            <small>Requests with findings</small>
          </div>
          <div className="stat">
            <span className="stat-label">Verified sandbox orders</span>
            <div className="stat-value">
              {orders.filter((order) => order.status === "PAID").length}
            </div>
            <small>Test payments, not revenue</small>
          </div>
          <div className="stat">
            <span className="stat-label">Unmet requests</span>
            <div className="stat-value">{unmet.length}</div>
            <small>Recorded by the backend</small>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>What held a request back</h2>
        </div>
        {Object.keys(reasons).length ? (
          <div className="panel-content">
            {Object.entries(reasons).map(([reason, count]) => (
              <div className="detail-row" key={reason}>
                <span>{reason.replaceAll("_", " ").toLowerCase()}</span>
                <strong>
                  {count} {count === 1 ? "finding" : "findings"}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<TestTube2 />}
            title="A clearer picture comes with testing."
          >
            Recorded findings will appear here after you run Test My Store.
          </EmptyState>
        )}
      </section>
      {unmet.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Recorded unmet requests</h2>
          </div>
          <div className="panel-content">
            {unmet.map((item, index) => (
              <div className="activity-intent" key={item.id || index}>
                <strong>
                  {item.intent || item.reason || "Unmet shopping request"}
                </strong>
                <p>
                  {item.message ||
                    item.reason ||
                    item.code ||
                    "See the related run for the recorded findings."}
                </p>
                <span>
                  {dateLabel(item.createdAt)} ·{" "}
                  {item.source || "Recorded event"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="disclosure">
        These are observed test and order counts. Repeated checks can appear
        more than once. Test basket values are not lost revenue, conversion
        forecasts, or evidence of real customer demand.
      </p>
    </div>
  );
}

function preflightStep(step: AgentRun["steps"][number]) {
  const output = step.output as any;
  const names: Record<string, string> = {
    validate_draft: "Check catalog details",
    configuration: "Check AI connection",
    search_products: "Find matching products",
    inspect_product: "Review a product",
    inspect_rules: "Read the house rules",
    submit_preflight: "Complete the private check",
  };
  let description = "This step was recorded in the private check.";
  if (typeof output === "string") description = output;
  else if (output?.error) description = `The check reported: ${output.error}`;
  else if (output?.message) description = output.message;
  else if (step.tool === "validate_draft")
    description = output?.findings?.length
      ? `${output.findings.length} catalog details need owner review. The findings are listed below.`
      : "Product and house-rule validation completed with no unresolved fields.";
  else if (step.tool === "search_products")
    description = `${output?.products?.length || 0} matching products returned from this private catalog.`;
  else if (step.tool === "inspect_product")
    description = `Read the approved facts and source details for ${output?.name || "this product"}.`;
  else if (step.tool === "inspect_rules")
    description =
      "Read the store’s pickup days, preparation time, order limits, and policies.";
  else if (step.tool === "submit_preflight")
    description = output?.intentSupported
      ? "The agent found sufficient catalog information for this request. Purchase approval is a separate step."
      : "The agent found an obstacle to this request. Review the findings below.";
  return {
    name: names[step.tool] || step.tool.replaceAll("_", " "),
    description,
    warning: Boolean(
      output?.error ||
      output?.ai === "NOT_CONFIGURED" ||
      output?.findings?.length ||
      output?.intentSupported === false,
    ),
  };
}

export function NewShopPage() {
  useOwner();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fixtureBusy, setFixtureBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const shop = await request("/api/shops", values);
      router.push(`/shops/${shop.id}?import=1`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect this store.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createFixture() {
    setError("");
    setFixtureBusy(true);
    try {
      const shop = await request("/api/shops", {
        name: "Rosa’s Weekend Bakery",
        siteUrl: "https://rosa.doorway.local",
        currency: "USD",
        fixture: true,
      });
      router.push(`/shops/${shop.id}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to create the test store.",
      );
    } finally {
      setFixtureBusy(false);
    }
  }
  return (
    <AppShell>
      <div className="narrow-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Your next chapter starts here</span>
            <h1>Let’s get to know your store.</h1>
            <p>
              Begin with your website. Everything stays private while you get it
              ready.
            </p>
          </div>
        </div>
        <StoreSteps current={0} />
        <section className="panel import-panel">
          <span className="import-icon">
            <Globe2 size={23} strokeWidth={1.4} />
          </span>
          <h2>Bring your storefront.</h2>
          <p>
            We’ll read your public product pages and suggest a catalog. You
            review the sources, fill the gaps, and decide what’s ready.
          </p>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Store name">
                <input
                  name="name"
                  placeholder="Your store’s name"
                  required
                  maxLength={120}
                />
              </Field>
              <Field label="Store currency">
                <select name="currency" defaultValue="USD">
                  <option value="USD">USD — US dollar</option>
                  <option value="GBP">GBP — British pound</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </Field>
              <div className="span-two">
                <Field
                  label="Website address"
                  hint="Use a public website you own. Domain ownership is checked before publishing."
                >
                  <input
                    name="siteUrl"
                    type="url"
                    placeholder="https://your-store.com"
                    required
                  />
                </Field>
              </div>
            </div>
            {error && (
              <div style={{ marginTop: 17 }}>
                <Notice tone="error">{error}</Notice>
              </div>
            )}
            <div className="form-actions">
              <span>
                <ShieldCheck size={12} />
                Private draft. Nothing is published automatically.
              </span>
              <Button disabled={busy || fixtureBusy}>
                {busy ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  "Connect your store"
                )}
                {!busy && <ArrowRight size={15} />}
              </Button>
            </div>
          </form>
        </section>
        <div className="import-notes">
          <div>
            <FileCheck2 size={17} />
            <div>
              <h3>Keep the source in sight</h3>
              <p>Review where product details came from.</p>
            </div>
          </div>
          <div>
            <ShieldCheck size={17} />
            <div>
              <h3>Your approval comes first</h3>
              <p>You confirm the catalog and house rules.</p>
            </div>
          </div>
          <div>
            <TestTube2 size={17} />
            <div>
              <h3>Try before you open</h3>
              <p>Run a private store check before publishing.</p>
            </div>
          </div>
        </div>
        <div className="panel quiet-panel" style={{ marginTop: 30 }}>
          <Store size={23} />
          <div>
            <h3>Just exploring? Take a look inside.</h3>
            <p>
              Create Rosa’s Weekend Bakery, a controlled local test store with
              synthetic products. This helps you explore the workflow; it isn’t
              a real merchant or a live AI import.
            </p>
            <button
              className="arrow-link"
              style={{
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
              }}
              disabled={busy || fixtureBusy}
              onClick={() => void createFixture()}
            >
              {fixtureBusy ? (
                <Loader2 className="spin" size={13} />
              ) : (
                <>
                  Create a test store <ArrowRight size={13} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export function ShopPage({ id }: { id: string }) {
  useOwner();
  const { data, loading, error, reload } = useResource(`/api/shops/${id}`);
  const { data: serviceStatus } = useResource("/api/status");
  const [tab, setTab] = useState("catalog");
  const [products, setProducts] = useState<Product[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [importTried, setImportTried] = useState(false);
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const shop: Shop | undefined = data?.shop;
  const catalog: Catalog | null = data?.catalog || null;
  useEffect(() => {
    if (catalog) {
      setProducts(catalog.products);
      setRules(catalog.rules);
      setApproved(false);
      setRulesConfirmed(false);
    }
  }, [catalog]);
  useEffect(() => {
    if (
      shop &&
      !catalog &&
      !importTried &&
      new URLSearchParams(window.location.search).get("import")
    ) {
      setImportTried(true);
      void action("import", {});
    }
  }, [shop, catalog, importTried]); // eslint-disable-line react-hooks/exhaustive-deps
  async function action(name: string, values: unknown = {}) {
    setBusy(name);
    setActionError("");
    setNotice("");
    try {
      await request(
        `/api/shops/${id}/${name}`,
        values,
        name === "catalog" ? "PUT" : "POST",
      );
      await reload();
      setNotice(
        (
          {
            import: "Your private draft is ready to review.",
            catalog:
              "Your changes are saved as a new private draft. Review and approve this version before publishing.",
            approve:
              "Catalog approved. Verify your domain to open your doorway.",
            verify: shop?.fixture
              ? "Controlled local fixture checked. This is not proof of external website ownership."
              : "Domain check complete.",
            publish: "Your approved catalog is now published.",
            "connect-paypal":
              "The configured PayPal sandbox recipient is now connected to this store. This does not prove PayPal account ownership.",
          } as Record<string, string>
        )[name] || "Saved.",
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to complete this step.",
      );
    } finally {
      setBusy("");
    }
  }
  function updateProduct(index: number, field: keyof Product, value: unknown) {
    const issueFields: Record<string, string> = {
      name: "NAME",
      description: "DESCRIPTION",
      priceMinor: "PRICE_MINOR",
      stock: "STOCK",
      attributes: "DIETARY",
      currency: "CURRENCY",
    };
    setProducts((current) =>
      current.map((product, position) =>
        position === index
          ? {
              ...product,
              [field]: value,
              issues: product.issues?.filter(
                (issue) => !issue.endsWith(`_${issueFields[field]}`),
              ),
            }
          : product,
      ),
    );
  }
  function confirmIssue(index: number, issue: string) {
    setProducts((current) =>
      current.map((product, position) =>
        position === index
          ? {
              ...product,
              issues: product.issues?.filter((item) => item !== issue),
            }
          : product,
      ),
    );
  }
  async function save() {
    if (rules)
      await action("catalog", {
        products,
        rules,
        ...(rulesConfirmed
          ? {
              confirmedRules: [
                "deliveryPolicy",
                "returnsPolicy",
                "pickupDays",
                "leadTimeHours",
                "minOrderMinor",
                "maxQuantityPerLine",
              ],
            }
          : {}),
      });
  }
  if (loading && !data)
    return (
      <AppShell>
        <PageLoading label="Opening your store" />
      </AppShell>
    );
  if (error || !shop)
    return (
      <AppShell>
        <Notice tone="error">
          {error || "This store could not be found."}
        </Notice>
        <Button href="/dashboard" secondary className="">
          Back to your stores
        </Button>
      </AppShell>
    );
  const currentStep =
    shop.publishedVersion === catalog?.version
      ? 5
      : !catalog
        ? 0
        : catalog.status === "DRAFT"
          ? 1
          : !shop.domainVerified
            ? 3
            : 4;
  return (
    <AppShell shopName={shop.name}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your store, thoughtfully prepared</span>
          <h1>{shop.name}</h1>
          <div className="shop-url">
            <Globe2 size={12} />
            {shop.siteUrl}
            <Badge tone={shop.publishedVersion ? "green" : "amber"} dot>
              {shop.publishedVersion
                ? `Published · v${shop.publishedVersion}`
                : "Private draft"}
            </Badge>
          </div>
        </div>
        <div className="heading-actions">
          <Button secondary href={`/shops/${id}/test`}>
            <TestTube2 size={14} />
            Test My Store
          </Button>
          {shop.publishedVersion && (
            <Button href={`/store/${shop.slug}`}>
              View storefront <ArrowUpRight size={14} />
            </Button>
          )}
        </div>
      </div>
      {shop.fixture && (
        <Notice>
          Controlled local test store · Products and policies are synthetic.
          Domain checks on this fixture do not prove control of an external
          website.
        </Notice>
      )}
      <StoreSteps current={currentStep} />
      {actionError && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="error">{actionError}</Notice>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      <div className="tab-list" role="tablist" aria-label="Store settings">
        {[
          { id: "catalog", label: "Catalog" },
          { id: "rules", label: "House rules" },
          { id: "domain", label: "Domain & publish" },
          { id: "activity", label: "Activity" },
        ].map((item) => (
          <button
            role="tab"
            onKeyDown={navigateTabs}
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="workbench-layout">
        <div className="workbench-main">
          {tab === "activity" && <ShopActivity data={data} />}
          {tab === "catalog" &&
            (!catalog ? (
              <div className="panel">
                <EmptyState
                  title="Your catalog is the next step."
                  icon={<Package />}
                  action={
                    <Button
                      disabled={Boolean(busy)}
                      onClick={() => void action("import", {})}
                    >
                      {busy === "import" ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      {busy === "import"
                        ? "Reading your website…"
                        : "Import from your website"}
                    </Button>
                  }
                >
                  Use AI to suggest product details from your public website.
                  You’ll see the sources and review every detail before
                  publishing.
                </EmptyState>
              </div>
            ) : (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <Package size={16} />
                      Your catalog{" "}
                      <span className="muted small-text">
                        ({products.length})
                      </span>
                    </h2>
                    <p>
                      Check names, prices, availability, and confirmed dietary
                      details.
                    </p>
                  </div>
                  <Badge
                    tone={catalog.status === "APPROVED" ? "green" : "amber"}
                  >
                    {friendlyStatus(catalog.status)} · v{catalog.version}
                  </Badge>
                </div>
                {catalog.warnings?.filter(
                  (warning) => !warning.startsWith("FICTIONAL_DEMO_STORE"),
                ).length > 0 && (
                  <div className="panel-content" style={{ paddingBottom: 0 }}>
                    <Notice tone="warning">
                      <strong>Notes from the import.</strong>
                      <br />
                      {catalog.warnings
                        .filter(
                          (warning) =>
                            !warning.startsWith("FICTIONAL_DEMO_STORE"),
                        )
                        .join(" ")}
                    </Notice>
                  </div>
                )}
                {products.map((product, index) => (
                  <div className="product-editor" key={product.id}>
                    <div className="product-editor-top">
                      <h3>
                        {String(index + 1).padStart(2, "0")} · {product.name}
                      </h3>
                      <Badge
                        tone={product.issues?.length ? "amber" : "neutral"}
                      >
                        {product.issues?.length
                          ? "Review details"
                          : "Owner review"}
                      </Badge>
                    </div>
                    <div className="form-grid">
                      <div className="span-two">
                        <Field label="Product name">
                          <input
                            value={product.name}
                            onChange={(event) =>
                              updateProduct(index, "name", event.target.value)
                            }
                            required
                          />
                        </Field>
                      </div>
                      <Field label={`Price (${product.currency})`}>
                        <input
                          aria-label={`Price for ${product.name}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Unknown — confirm price"
                          value={
                            product.issues?.some((issue) =>
                              /(?:UNKNOWN|CONFLICT)_PRICE_MINOR/.test(issue),
                            )
                              ? ""
                              : product.priceMinor / 100
                          }
                          onChange={(event) =>
                            updateProduct(
                              index,
                              "priceMinor",
                              Math.round(Number(event.target.value) * 100),
                            )
                          }
                        />
                      </Field>
                      <Field label="Currency">
                        <select
                          value={product.currency || ""}
                          onChange={(event) =>
                            updateProduct(index, "currency", event.target.value)
                          }
                        >
                          <option value="" disabled>
                            Unknown — select currency
                          </option>
                          <option value="USD">USD</option>
                          <option value="GBP">GBP</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </Field>
                      <Field label="Available quantity">
                        <input
                          aria-label={`Stock for ${product.name}`}
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Unknown — confirm quantity"
                          value={
                            product.issues?.some((issue) =>
                              /(?:UNKNOWN|CONFLICT)_STOCK/.test(issue),
                            )
                              ? ""
                              : product.stock
                          }
                          onChange={(event) =>
                            updateProduct(
                              index,
                              "stock",
                              Number(event.target.value),
                            )
                          }
                        />
                      </Field>
                      <div className="span-two">
                        <Field label="Description">
                          <input
                            value={product.description}
                            onChange={(event) =>
                              updateProduct(
                                index,
                                "description",
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      </div>
                      <div className="span-two">
                        <Field
                          label="Confirmed dietary details"
                          hint="Only add attributes you can confirm. Leave blank when unknown."
                        >
                          <input
                            placeholder="e.g. vegan, gluten-free"
                            value={(product.attributes?.dietary || []).join(
                              ", ",
                            )}
                            onChange={(event) =>
                              updateProduct(index, "attributes", {
                                ...product.attributes,
                                dietary: event.target.value
                                  .split(",")
                                  .map((value) => value.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                    {product.issues?.length ? (
                      <ul className="issue-list">
                        {product.issues.map((issue, i) => (
                          <li key={i}>
                            <TriangleAlert size={12} />
                            <span style={{ flex: 1 }}>
                              {issue.replaceAll("_", " ").toLowerCase()} — check
                              the field above.
                            </span>
                            <button
                              className="text-link"
                              style={{
                                background: "none",
                                border: 0,
                                color: "inherit",
                                fontSize: 9,
                                padding: 0,
                              }}
                              onClick={() => confirmIssue(index, issue)}
                            >
                              Confirm reviewed
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {product.sources?.map((source, i) => (
                      <div className="provenance" key={i}>
                        <ExternalLink size={11} />
                        <span>
                          Source:{" "}
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.url}
                          </a>
                          {source.quote && (
                            <span>
                              {" "}
                              · “{source.quote.slice(0, 130)}
                              {source.quote.length > 130 ? "…" : ""}”
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                    <ProductAlternatives
                      product={product}
                      products={products}
                      onChange={(ids) =>
                        updateProduct(index, "allowedAlternatives", ids)
                      }
                    />
                    <ProductEvidence catalog={catalog} product={product} />
                  </div>
                ))}
                {!products.length && (
                  <EmptyState title="No products found yet." icon={<Package />}>
                    The importer didn’t return any products. Check that the
                    website exposes public product details, then try importing
                    again.
                  </EmptyState>
                )}
                <div className="panel-bottom">
                  <span>
                    Changes create a new draft and need a fresh approval.
                  </span>
                  <Button
                    disabled={Boolean(busy) || !products.length}
                    onClick={() => void save()}
                  >
                    {busy === "catalog" ? (
                      <Loader2 className="spin" size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                    Save catalog changes
                  </Button>
                </div>
              </section>
            ))}
          {tab === "rules" &&
            (rules ? (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <FileCheck2 size={16} />
                      Your house rules
                    </h2>
                    <p>Clear expectations make a better shopping experience.</p>
                  </div>
                </div>
                <div className="panel-content">
                  <div className="form-grid">
                    <Field label={`Minimum order (${shop.currency})`}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rules.minOrderMinor / 100}
                        onChange={(event) =>
                          setRules({
                            ...rules,
                            minOrderMinor: Math.round(
                              Number(event.target.value) * 100,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Maximum quantity per product">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={rules.maxQuantityPerLine}
                        onChange={(event) =>
                          setRules({
                            ...rules,
                            maxQuantityPerLine: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Preparation time (hours)">
                      <input
                        type="number"
                        min="0"
                        max="720"
                        value={rules.leadTimeHours}
                        onChange={(event) =>
                          setRules({
                            ...rules,
                            leadTimeHours: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Pickup days">
                      <select
                        multiple
                        aria-label="Allowed pickup days"
                        value={rules.pickupDays.map(String)}
                        onChange={(event) =>
                          setRules({
                            ...rules,
                            pickupDays: Array.from(
                              event.target.selectedOptions,
                            ).map((option) => Number(option.value)),
                          })
                        }
                      >
                        {[
                          "Sunday",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                        ].map((day, index) => (
                          <option key={day} value={index}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="span-two">
                      <Field label="Delivery & pickup policy">
                        <textarea
                          value={rules.deliveryPolicy}
                          onChange={(event) =>
                            setRules({
                              ...rules,
                              deliveryPolicy: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="span-two">
                      <Field label="Returns & refunds policy">
                        <textarea
                          value={rules.returnsPolicy}
                          onChange={(event) =>
                            setRules({
                              ...rules,
                              returnsPolicy: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field
                      label="Bulk discount from quantity"
                      hint="Set to 0 to remove this rule."
                    >
                      <input
                        type="number"
                        min="0"
                        value={rules.bulkDiscount?.minQuantity || 0}
                        onChange={(event) =>
                          setRules({
                            ...rules,
                            bulkDiscount: Number(event.target.value)
                              ? {
                                  minQuantity: Number(event.target.value),
                                  percentOff:
                                    rules.bulkDiscount?.percentOff || 5,
                                }
                              : undefined,
                          })
                        }
                      />
                    </Field>
                    <Field label="Discount percentage">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={rules.bulkDiscount?.percentOff || 0}
                        disabled={!rules.bulkDiscount}
                        onChange={(event) =>
                          rules.bulkDiscount &&
                          setRules({
                            ...rules,
                            bulkDiscount: {
                              ...rules.bulkDiscount,
                              percentOff: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <Notice>
                      Discounts are calculated by the server using your approved
                      rule. A shopping agent cannot choose its own price.
                    </Notice>
                  </div>
                  <label className="approval-box" style={{ marginTop: 17 }}>
                    <input
                      type="checkbox"
                      checked={rulesConfirmed}
                      onChange={(event) =>
                        setRulesConfirmed(event.target.checked)
                      }
                    />
                    <span>
                      I have reviewed and confirm the house rules above,
                      including any details the website left unknown.
                    </span>
                  </label>
                </div>
                <div className="panel-bottom">
                  <span>
                    These rules apply to the next approved catalog version.
                  </span>
                  <Button disabled={Boolean(busy)} onClick={() => void save()}>
                    {busy === "catalog" && (
                      <Loader2 className="spin" size={13} />
                    )}
                    Save house rules
                  </Button>
                </div>
              </section>
            ) : (
              <div className="panel">
                <EmptyState
                  title="Start with your catalog."
                  icon={<FileCheck2 />}
                >
                  Import your website to create a draft, then review the house
                  rules here.
                </EmptyState>
              </div>
            ))}
          {tab === "domain" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <ShieldCheck size={16} />
                      {shop.fixture
                        ? "Check the controlled local fixture"
                        : "Show this website is yours"}
                    </h2>
                    <p>
                      A simple check of domain control before your store opens.
                    </p>
                  </div>
                  <Badge tone={shop.domainVerified ? "green" : "amber"}>
                    {shop.domainVerified
                      ? shop.fixture
                        ? "Local fixture checked"
                        : "Verified"
                      : "Awaiting verification"}
                  </Badge>
                </div>
                <div className="panel-content">
                  {shop.fixture ? (
                    <Notice>
                      This is a controlled local fixture. The test verification
                      unlocks the local workflow and is labelled as synthetic.
                    </Notice>
                  ) : (
                    <p className="small-text muted">
                      Add the verification meta tag to your website, then run
                      the check.
                    </p>
                  )}
                  <ol className="numbered-instructions">
                    <li>
                      <div>
                        <h3>Add the verification meta tag</h3>
                        <p>
                          Place this inside your homepage’s{" "}
                          <code>&lt;head&gt;</code>:
                        </p>
                        <div className="domain-code">
                          {`<meta name="doorway-verification" content="${shop.ownershipToken}" />`}
                          <button
                            aria-label="Copy verification meta tag"
                            onClick={async () => {
                              await navigator.clipboard.writeText(
                                `<meta name="doorway-verification" content="${shop.ownershipToken}" />`,
                              );
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                          >
                            {copied ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    </li>
                    <li>
                      <div>
                        <h3>Run the domain check</h3>
                        <p>
                          Publish the tag on your own homepage, then use the
                          verification button below.{" "}
                          {shop.fixture &&
                            "The local test fixture already contains this tag."}
                        </p>
                      </div>
                    </li>
                  </ol>
                  <p className="disclosure">
                    This check confirms control of the website. It does not
                    verify your legal identity or ownership of a PayPal account.
                  </p>
                </div>
                <div className="panel-bottom">
                  <span>
                    {shop.verifiedAt
                      ? `Last checked ${dateLabel(shop.verifiedAt)}`
                      : "Verification is required before publishing."}
                  </span>
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() => void action("verify")}
                  >
                    {busy === "verify" ? (
                      <Loader2 className="spin" size={13} />
                    ) : (
                      <ShieldCheck size={13} />
                    )}
                    {shop.domainVerified ? "Check again" : "Verify domain"}
                  </Button>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    <Globe2 size={16} />
                    Open your doorway
                  </h2>
                </div>
                <div className="panel-content">
                  <p className="small-text muted" style={{ marginBottom: 20 }}>
                    Publish the approved catalog so connected shoppers can find
                    it. New draft changes stay private until you approve and
                    publish them.
                  </p>
                  <label className="approval-box">
                    <input
                      type="checkbox"
                      checked={approved}
                      onChange={(event) => setApproved(event.target.checked)}
                    />
                    <span>
                      I’ve checked the products, prices, availability, dietary
                      details, and house rules in this catalog. I approve these
                      details for publication.
                    </span>
                  </label>
                  <div className="inline-actions" style={{ marginTop: 20 }}>
                    <Button
                      secondary
                      disabled={Boolean(busy) || !catalog || !approved}
                      onClick={() => void action("approve")}
                    >
                      {busy === "approve" ? (
                        <Loader2 className="spin" size={13} />
                      ) : (
                        <FileCheck2 size={13} />
                      )}
                      Approve catalog
                    </Button>
                    <Button
                      disabled={
                        Boolean(busy) ||
                        catalog?.status !== "APPROVED" ||
                        !shop.domainVerified
                      }
                      onClick={() => void action("publish")}
                    >
                      {busy === "publish" ? (
                        <Loader2 className="spin" size={13} />
                      ) : (
                        <ArrowUpRight size={13} />
                      )}
                      Publish storefront
                    </Button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
        <aside className="workbench-aside">
          <section className="panel aside-section">
            <h3>A few thoughtful steps.</h3>
            <ul className="checklist">
              {[
                {
                  label: "Website connected",
                  done: true,
                  detail: shop.fixture
                    ? "Controlled test fixture"
                    : "Your public storefront",
                },
                {
                  label: "Catalog reviewed",
                  done: catalog?.status === "APPROVED",
                  detail: catalog
                    ? `${products.length} products · version ${catalog.version}`
                    : "Import and check your products",
                },
                {
                  label: "House rules confirmed",
                  done: catalog?.status === "APPROVED",
                  detail: "Pickup, pricing, and returns",
                },
                {
                  label: shop.fixture
                    ? "Local fixture checked"
                    : "Domain verified",
                  done: shop.domainVerified,
                  detail: shop.fixture
                    ? "Not external ownership proof"
                    : "Show control of your website",
                },
                {
                  label: "Doorway open",
                  done: Boolean(shop.publishedVersion),
                  detail: "Publish when everything is ready",
                },
              ].map((item) => (
                <li key={item.label} className={item.done ? "" : "pending"}>
                  {item.done ? <Check size={14} /> : <Circle size={13} />}
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel aside-section">
            <TestTube2 size={22} color="#8fa779" style={{ marginBottom: 13 }} />
            <h3>See it through a shopper’s eyes.</h3>
            <p>
              Run a private check. Find missing details and confirm your fixes
              before opening.
            </p>
            <Button secondary href={`/shops/${id}/test`}>
              Test My Store <ArrowRight size={13} />
            </Button>
          </section>
          {catalog && (
            <section className="panel aside-section">
              <h3>PayPal sandbox connection</h3>
              <div className="detail-row">
                <span>Recipient</span>
                <strong>{shop.paypalMerchantId || "Not configured"}</strong>
              </div>
              <p>
                {shop.paypalMerchantId
                  ? "This deployment uses the configured sandbox recipient. Each payment checks the expected recipient."
                  : "The deployment owner must add PayPal sandbox credentials and a merchant recipient to the server environment before checkout can run."}
              </p>
              <Button
                secondary
                disabled={Boolean(busy) || !serviceStatus?.services?.paypal}
                onClick={() => void action("connect-paypal")}
              >
                {busy === "connect-paypal" ? (
                  <Loader2 className="spin" size={12} />
                ) : (
                  <ShieldCheck size={12} />
                )}
                Connect configured sandbox merchant
              </Button>
              {!serviceStatus?.services?.paypal && (
                <p className="disclosure" style={{ marginTop: 10 }}>
                  Available after the deployment’s sandbox credentials and
                  recipient are configured.
                </p>
              )}
              <div className="aside-divider" />
              <h3>Where this draft came from</h3>
              <div className="detail-row">
                <span>Source</span>
                <strong>
                  {catalog.source === "SYNTHETIC"
                    ? "Synthetic test data"
                    : catalog.source === "LIVE_AI"
                      ? "AI website extraction"
                      : friendlyStatus(catalog.source)}
                </strong>
              </div>
              <div className="detail-row">
                <span>Created</span>
                <strong>{dateLabel(catalog.createdAt)}</strong>
              </div>
              {catalog.model && (
                <div className="detail-row">
                  <span>Extraction model</span>
                  <strong>{catalog.model}</strong>
                </div>
              )}
              <div className="aside-divider" />
              <p>
                Imported details are suggestions. Owner approval confirms what
                your store offers.
              </p>
              {!shop.fixture && (
                <Button
                  secondary
                  disabled={Boolean(busy)}
                  onClick={() => void action("import")}
                >
                  {busy === "import" ? (
                    <Loader2 className="spin" size={12} />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  Import a fresh draft
                </Button>
              )}
            </section>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

export function StoreTestPage({ id }: { id: string }) {
  useOwner();
  const { data, loading, error, reload } = useResource(`/api/shops/${id}`);
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [actionError, setActionError] = useState("");
  async function test() {
    setBusy(true);
    setActionError("");
    try {
      const result = await request(`/api/shops/${id}/preflight`, { intent });
      setRun(result);
      await reload();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to run this check.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data)
    return (
      <AppShell>
        <PageLoading label="Preparing your store check" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell>
        <Notice tone="error">{error || "Store not found."}</Notice>
      </AppShell>
    );
  const shop: Shop = data.shop;
  const runs: AgentRun[] = data.runs || [];
  const findings = run?.findings || [];
  return (
    <AppShell shopName={shop.name}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A rehearsal for a better experience</span>
          <h1>Test My Store.</h1>
          <p>
            Try a shopping request. See what needs attention. Make a change,
            then repeat the very same request.
          </p>
        </div>
        <Button secondary href={`/shops/${id}`}>
          Back to store <ArrowUpRight size={14} />
        </Button>
      </div>
      <div className="workbench-layout">
        <div className="workbench-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  <TestTube2 size={16} />
                  What would your shopper ask?
                </h2>
                <p>
                  {shop.name} · Catalog{" "}
                  {data.catalog
                    ? `version ${data.catalog.version}`
                    : "not imported"}
                </p>
              </div>
              <Badge tone="amber">Private preflight</Badge>
            </div>
            <div className="panel-content">
              <textarea
                aria-label="Shopping request to test"
                className="test-intent"
                value={intent}
                maxLength={1000}
                onChange={(event) => setIntent(event.target.value)}
                placeholder="For example: I need 4 vegan pastries for Saturday. What can I order?"
              />
              <div className="intent-suggestions">
                {[
                  "What vegan options are available?",
                  "Can I collect an order this Friday?",
                  "Can I order 12 items with a discount?",
                ].map((example) => (
                  <button key={example} onClick={() => setIntent(example)}>
                    {example}
                  </button>
                ))}
              </div>
              <div className="test-explainer">
                <ShieldCheck size={13} />
                This private check reads your catalog and rules. It doesn’t
                publish products or create a payment.
              </div>
              {actionError && (
                <div style={{ marginTop: 17 }}>
                  <Notice tone="error">{actionError}</Notice>
                </div>
              )}
            </div>
            <div className="panel-bottom">
              <span>
                {busy
                  ? "Checking your real catalog and rules…"
                  : "A useful test starts with a real customer question."}
              </span>
              <Button
                disabled={busy || intent.trim().length < 3 || !data.catalog}
                onClick={() => void test()}
              >
                {busy ? (
                  <Loader2 className="spin" size={14} />
                ) : (
                  <TestTube2 size={14} />
                )}
                {busy
                  ? "Running your check…"
                  : run
                    ? "Repeat this request"
                    : "Run store check"}
              </Button>
            </div>
          </section>
          {run && (
            <section className="panel">
              <div className="panel-content">
                <div className="run-header">
                  <div>
                    <h3>
                      {run.source === "LOCAL_VALIDATION"
                        ? "Catalog validation complete."
                        : run.status === "PASSED"
                          ? "The request has a clearer path."
                          : "Here’s what needs your attention."}
                    </h3>
                    <div className="run-meta">
                      <span>{dateLabel(run.createdAt)}</span>
                      <span>·</span>
                      <span>Catalog v{run.catalogVersion}</span>
                      <span className="revision-tag">{run.source}</span>
                    </div>
                  </div>
                  <Badge tone={statusTone(run.status)} dot>
                    {friendlyStatus(run.status)}
                  </Badge>
                </div>
                <div style={{ marginBottom: 19 }}>
                  {run.source === "LOCAL_VALIDATION" && (
                    <Notice tone="warning">
                      Catalog validation only. AI is not connected, so this run
                      does not evaluate whether a shopping agent can fulfil the
                      request.
                    </Notice>
                  )}
                </div>
                <div className="run-steps">
                  {run.steps.map((step, index) => {
                    const info = preflightStep(step);
                    return (
                      <div
                        className={`run-step ${info.warning ? "failed" : ""}`}
                        key={index}
                      >
                        <span className="run-step-icon">
                          {info.warning ? (
                            <TriangleAlert size={12} />
                          ) : (
                            <Check size={12} />
                          )}
                        </span>
                        <div>
                          <strong>{info.name}</strong>
                          <p>{info.description}</p>
                        </div>
                      </div>
                    );
                  })}
                  {findings.map((finding, index) => (
                    <div className="run-step failed" key={`finding-${index}`}>
                      <span className="run-step-icon">
                        <TriangleAlert size={12} />
                      </span>
                      <div>
                        <strong>{finding.code.replaceAll("_", " ")}</strong>
                        <p>{finding.message}</p>
                      </div>
                    </div>
                  ))}
                  {!run.steps.length && !findings.length && (
                    <p className="small-text muted">
                      The check returned no detailed steps. Review the stored
                      run and repeat the request if needed.
                    </p>
                  )}
                </div>
                <div className="run-result">
                  <h3>
                    {run.status === "PASSED"
                      ? "A useful step forward."
                      : "Good to know before you open."}
                  </h3>
                  <p>
                    {run.status === "PASSED"
                      ? "This preflight passed using the catalog version shown above. A real purchase still needs an approved catalog, domain verification, a fresh quote, and the buyer’s PayPal approval."
                      : "Review the findings, make the changes you can confirm, and save your catalog. Come back and repeat this exact request to see the result."}
                  </p>
                  <div className="inline-actions" style={{ marginTop: 18 }}>
                    <Button secondary href={`/shops/${id}`}>
                      Review & repair <ArrowRight size={13} />
                    </Button>
                    {shop.publishedVersion && run.status === "PASSED" && (
                      <Button href={`/store/${shop.slug}`}>
                        Try a purchase <ArrowUpRight size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Check history</h2>
              <span className="small-text muted">
                {runs.length} recorded {runs.length === 1 ? "run" : "runs"}
              </span>
            </div>
            {!runs.length ? (
              <EmptyState
                icon={<TestTube2 />}
                title="Your first insight is ahead."
              >
                Run a shopping request to start a record of what worked, what
                didn’t, and what changed.
              </EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="test-history">
                  <thead>
                    <tr>
                      <th>Shopping request</th>
                      <th>Result</th>
                      <th>Catalog</th>
                      <th>Repeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((item) => (
                      <tr key={item.id}>
                        <td style={{ maxWidth: 320 }}>{item.intent}</td>
                        <td>
                          <Badge tone={statusTone(item.status)}>
                            {friendlyStatus(item.status)}
                          </Badge>
                        </td>
                        <td>v{item.catalogVersion}</td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Repeat request: ${item.intent}`}
                            onClick={() => {
                              setIntent(item.intent);
                              setRun(item);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            <ArrowUpRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <aside className="workbench-aside">
          <section className="panel aside-section">
            <Sparkles size={22} color="#8fa779" style={{ marginBottom: 13 }} />
            <h3>A test with a purpose.</h3>
            <p>
              Choose something a customer might actually ask. Specific
              quantities, dietary details, and collection days can reveal useful
              gaps.
            </p>
            <div className="aside-divider" />
            <ul className="checklist">
              <li>
                <span className="revision-tag">1</span>
                <span>
                  <strong>Ask a real question</strong>
                  <small>Keep the same wording for your next run.</small>
                </span>
              </li>
              <li>
                <span className="revision-tag">2</span>
                <span>
                  <strong>Confirm the fix</strong>
                  <small>Update only the details you can verify.</small>
                </span>
              </li>
              <li>
                <span className="revision-tag">3</span>
                <span>
                  <strong>Run it again</strong>
                  <small>Compare the result and catalog version.</small>
                </span>
              </li>
            </ul>
          </section>
          <section className="panel aside-section">
            <ShieldCheck
              size={21}
              color="#8fa779"
              style={{ marginBottom: 13 }}
            />
            <h3>Private means private.</h3>
            <p>
              These checks are visible only to you. A successful preflight is a
              catalog check, not a completed purchase or measured customer
              demand.
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
