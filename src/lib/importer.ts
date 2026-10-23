import { createHash, randomUUID } from "node:crypto";
import { load } from "cheerio";
import type { Evidence, Product, Rules } from "./domain";
import {
  extractCatalogFromSources,
  type AiOptions,
  type ExtractedCatalog,
  type ExtractedField,
  type SourcePage,
} from "./ai";
import {
  normalizePublicUrl,
  safeFetchText,
  type SafeFetchOptions,
  type TextFetchResult,
} from "./url-security";

export interface ImportResult {
  products: Product[];
  rules: Rules;
  sources: Evidence[];
  warnings: string[];
  source: "LIVE_AI";
  model: string;
  sourceUrl: string;
  sourcePages: SourcePage[];
  fieldEvidence: Record<string, unknown>;
  usage?: { input_tokens: number; output_tokens: number };
}
export interface ImportInput {
  url: string;
  shopId?: string;
  version?: number;
}
export interface ImportOptions extends AiOptions {
  /** Tests may replace network I/O; application input never controls dependencies. */
  fetchText?: (
    url: string | URL,
    options?: SafeFetchOptions,
  ) => Promise<TextFetchResult>;
  maxPages?: number;
}

/** Visible document text and inert JSON-LD are data; scripts are never evaluated. */
export function extractPageText(
  html: string,
  url: string,
  contentType = "text/html",
): { text: string; links: string[]; truncated: boolean } {
  if (!contentType.startsWith("text/html"))
    return {
      text: html.slice(0, 28_000),
      links: [],
      truncated: html.length > 28_000,
    };
  const $ = load(html);
  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text();
    if (raw.length > 30_000) return;
    try {
      jsonLd.push(JSON.stringify(JSON.parse(raw)));
    } catch {
      /* Malformed metadata is not evidence. */
    }
  });
  const origin = new URL(url).origin;
  const links: string[] = [];
  $("a[href]").each((_, element) => {
    if (links.length >= 50) return;
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const target = normalizePublicUrl(new URL(href, url));
      const label = `${$(element).text()} ${target.pathname}`;
      if (
        target.origin !== origin ||
        !/(product|shop|catalog|menu|shipping|delivery|pickup|return|refund|polic)/i.test(
          label,
        ) ||
        /(checkout|cart|login|logout|account|admin)/i.test(target.pathname)
      )
        return;
      target.search = "";
      if (!links.includes(target.href)) links.push(target.href);
    } catch {
      /* Non-website and private literal links are never followed. */
    }
  });
  $(
    "script, style, noscript, iframe, object, embed, template, svg, [hidden], [aria-hidden='true']",
  ).remove();
  $("br, p, div, li, h1, h2, h3, h4, tr, section, article").each(
    (_, element) => {
      $(element).append("\n");
    },
  );
  const visible = ($("body").text() || $.root().text())
    .replace(/[ \t\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  const metadata = jsonLd.length
    ? `\nStructured merchant data (untrusted):\n${jsonLd.join("\n")}`
    : "";
  const text = `${$("title").text().trim()}\n${visible}${metadata}`.trim();
  return {
    text: text.slice(0, 28_000),
    links,
    truncated: text.length > 28_000,
  };
}

function sourceEvidence(item: ExtractedField, pages: SourcePage[]): Evidence[] {
  return item.evidence.map((evidence) => ({
    url: pages[evidence.sourceIndex].url,
    quote: evidence.quote,
    fetchedAt: pages[evidence.sourceIndex].fetchedAt,
  }));
}
function issueName(prefix: string, key: string): string {
  return `${prefix}_${key.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

export function materializeImport(
  extraction: ExtractedCatalog,
  pages: SourcePage[],
  model: string,
  warnings: string[] = [],
): ImportResult {
  const fieldEvidence: Record<string, unknown> = {
    products: {},
    rules: extraction.rules,
  };
  const products: Product[] = extraction.products.map((item, index) => {
    const id = randomUUID();
    const issues = Object.entries(item)
      .filter(([, value]) => value.status !== "known")
      .map(([key, value]) =>
        issueName(value.status === "conflict" ? "CONFLICT" : "UNKNOWN", key),
      );
    (fieldEvidence.products as Record<string, unknown>)[id] = item;
    const sources = Object.values(item).flatMap((value) =>
      sourceEvidence(value, pages),
    );
    return {
      id,
      name: item.name.value ?? `Unconfirmed product ${index + 1}`,
      description: item.description.value ?? "",
      // Domain uses numbers; explicit issues prevent these unset placeholders from approval.
      priceMinor: item.priceMinor.value ?? 0,
      currency: item.currency.value ?? "",
      stock: item.stock.value ?? 0,
      attributes: item.dietary.value ? { dietary: item.dietary.value } : {},
      sources,
      confidence: Math.min(
        ...Object.values(item).map((value) => value.confidence),
      ),
      issues,
    };
  });
  const rules: Rules = {
    deliveryPolicy: extraction.rules.deliveryPolicy.value ?? "",
    returnsPolicy: extraction.rules.returnsPolicy.value ?? "",
    pickupDays: extraction.rules.pickupDays.value ?? [],
    leadTimeHours: extraction.rules.leadTimeHours.value ?? 0,
    minOrderMinor: extraction.rules.minOrderMinor.value ?? 0,
    maxQuantityPerLine: extraction.rules.maxQuantityPerLine.value ?? 0,
  };
  const ruleWarnings = Object.entries(extraction.rules)
    .filter(([, value]) => value.status !== "known")
    .map(
      ([key, value]) =>
        `${issueName(value.status === "conflict" ? "CONFLICT_RULE" : "UNKNOWN_RULE", key)}: owner must confirm this rule before approval.`,
    );
  return {
    products,
    rules,
    source: "LIVE_AI",
    model,
    sourceUrl: pages[0].url,
    sourcePages: pages,
    fieldEvidence,
    sources: pages.map((page) => ({
      url: page.url,
      quote: page.text.slice(0, 400),
      fetchedAt: page.fetchedAt,
    })),
    warnings: [
      ...warnings,
      ...extraction.warnings,
      ...ruleWarnings,
      ...(products.some((product) => product.issues?.length)
        ? [
            "Imported products contain unknown or conflicting fields. Owner corrections are required before approval.",
          ]
        : []),
    ],
  };
}

/** Bounded public crawl -> real AI extraction -> an unapproved draft, never publication. */
export async function importCatalog(
  input: ImportInput,
  options: ImportOptions = {},
): Promise<ImportResult> {
  // Fail before network traffic and do not turn missing credentials into fixture success.
  if (
    !options.gateway &&
    !(options.apiKey ?? process.env.ANTHROPIC_API_KEY)?.trim()
  ) {
    const { AiError } = await import("./ai");
    throw new AiError(
      "AI_NOT_CONFIGURED",
      "Anthropic is not configured. No website import or AI extraction has been performed.",
      503,
    );
  }
  const url = normalizePublicUrl(input.url);
  const fetchText = options.fetchText ?? safeFetchText;
  const maxPages = Math.min(Math.max(options.maxPages ?? 3, 1), 3);
  const pages: SourcePage[] = [];
  const warnings: string[] = [];
  const queue = [url.href];
  const visited = new Set<string>();
  let sourceOrigin: string | undefined;
  const started = Date.now();
  while (
    queue.length &&
    pages.length < maxPages &&
    Date.now() - started < 35_000
  ) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    let response: TextFetchResult;
    try {
      response = await fetchText(next, {
        maxBytes: 900_000,
        timeoutMs: 10_000,
        maxRedirects: 3,
        ...(sourceOrigin ? { allowedOrigin: sourceOrigin } : {}),
      });
    } catch (error) {
      if (!pages.length) throw error;
      warnings.push(
        `An additional linked page could not be imported securely: ${new URL(next).pathname}. Its data remains unknown.`,
      );
      continue;
    }
    sourceOrigin ??= new URL(response.url).origin;
    visited.add(response.url);
    const parsed = extractPageText(
      response.text,
      response.url,
      response.contentType,
    );
    if (!parsed.text.trim()) {
      warnings.push(
        `No readable text found at ${new URL(response.url).pathname}.`,
      );
      continue;
    }
    if (parsed.truncated)
      warnings.push(
        `Text at ${new URL(response.url).pathname} was truncated to the bounded extraction limit. Unread facts remain unknown.`,
      );
    pages.push({
      url: response.url,
      text: parsed.text,
      sha256: createHash("sha256").update(parsed.text).digest("hex"),
      fetchedAt: new Date().toISOString(),
    });
    for (const link of parsed.links)
      if (!visited.has(link) && !queue.includes(link)) queue.push(link);
  }
  if (queue.length)
    warnings.push(
      "The bounded importer did not read every linked page. This import is a snapshot, not live stock synchronization.",
    );
  const result = await extractCatalogFromSources(pages, options);
  return {
    ...materializeImport(result.extraction, pages, result.model, warnings),
    usage: result.usage,
  };
}

export { runStorePreflight } from "./ai";
