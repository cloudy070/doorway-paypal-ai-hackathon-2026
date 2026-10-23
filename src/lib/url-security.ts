import { lookup } from "node:dns/promises";
import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/** All outbound merchant-site traffic must pass this module, including redirects. */
export class UrlSecurityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UrlSecurityError";
  }
}

const forbidden = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  forbidden.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  forbidden.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicIp(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return !forbidden.check(address, "ipv4");
  if (kind === 6)
    return globalV6.check(address, "ipv6") && !forbidden.check(address, "ipv6");
  return false;
}

export function normalizePublicUrl(value: string | URL): URL {
  let url: URL;
  try {
    url = new URL(value.toString());
  } catch {
    throw new UrlSecurityError(
      "INVALID_URL",
      "Enter a valid public website URL.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new UrlSecurityError(
      "UNSAFE_SCHEME",
      "Only HTTP and HTTPS websites are supported.",
    );
  if (url.username || url.password)
    throw new UrlSecurityError(
      "URL_CREDENTIALS",
      "URLs containing credentials are not allowed.",
    );
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
    throw new UrlSecurityError(
      "UNSAFE_PORT",
      "Only standard website ports are allowed.",
    );
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    (!host.includes(".") && !isIP(host)) ||
    /\.(localhost|local|internal|lan|home|invalid|test)$/.test(host)
  ) {
    throw new UrlSecurityError(
      "UNSAFE_HOST",
      "A public website hostname is required.",
    );
  }
  if (isIP(host) && !isPublicIp(host))
    throw new UrlSecurityError(
      "PRIVATE_ADDRESS",
      "Private, loopback, and reserved addresses are not allowed.",
    );
  url.hash = "";
  return url;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;
const systemResolver: HostResolver = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export async function resolvePublicUrl(
  value: string | URL,
  resolver: HostResolver = systemResolver,
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
  const url = normalizePublicUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await resolver(hostname);
  } catch {
    throw new UrlSecurityError(
      "DNS_FAILED",
      "The website hostname could not be resolved.",
    );
  }
  // Reject mixed public/private answers rather than selecting whichever happens to work.
  if (
    !addresses.length ||
    addresses.some(
      ({ address, family }) => !isPublicIp(address) || isIP(address) !== family,
    )
  ) {
    throw new UrlSecurityError(
      "PRIVATE_ADDRESS",
      "The hostname resolves to a private or reserved address.",
    );
  }
  return { url, addresses };
}

export interface TextFetchResult {
  url: string;
  text: string;
  contentType: string;
  bytes: number;
}
export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  /** Further restrict redirects, e.g. to the merchant's original origin. */
  allowedOrigin?: string;
}
export interface TransportResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: AsyncIterable<Uint8Array>;
  cancel: () => void;
}
export type PinnedTransport = (
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
) => Promise<TransportResponse>;

const pinnedTransport: PinnedTransport = (url, address, signal) =>
  new Promise((resolve, reject) => {
    // Connect directly to the validated address. DNS cannot change between validation
    // and the connection; preserve the original Host and TLS hostname verification.
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const req = (url.protocol === "https:" ? https : http).request(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.protocol === "https:" ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Host: url.host,
          Accept: "text/html, text/plain;q=0.9",
          "Accept-Encoding": "identity",
          "User-Agent": "Doorway/0.1 (+catalog-import)",
        },
        servername: isIP(hostname) ? undefined : hostname,
        agent: false,
        signal,
        maxHeaderSize: 16_384,
      },
      (res) => {
        const remote = res.socket.remoteAddress?.replace(/^::ffff:/, "");
        const expected = address.address.replace(/^::ffff:/, "");
        if (remote !== expected) {
          res.destroy();
          reject(
            new UrlSecurityError(
              "ADDRESS_CHANGED",
              "The connected address did not match the validated address.",
            ),
          );
          return;
        }
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
          cancel: () => res.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });

/** Injection exists for isolated tests only; application callers use the defaults. */
export function createSafeTextFetcher(
  deps: { resolver?: HostResolver; transport?: PinnedTransport } = {},
) {
  return async function fetchText(
    value: string | URL,
    options: SafeFetchOptions = {},
  ): Promise<TextFetchResult> {
    const maxBytes = Math.min(options.maxBytes ?? 1_000_000, 2_000_000);
    const timeoutMs = Math.min(options.timeoutMs ?? 12_000, 30_000);
    const maxRedirects = Math.min(options.maxRedirects ?? 3, 5);
    if (maxBytes <= 0 || timeoutMs <= 0 || maxRedirects < 0)
      throw new UrlSecurityError(
        "INVALID_LIMIT",
        "Fetch limits must be positive.",
      );
    const deadline = new AbortController();
    let activeResponse: TransportResponse | undefined;
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    const forwardAbort = () => deadline.abort();
    if (options.signal?.aborted) deadline.abort();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    const interrupted = new Promise<never>((_, reject) => {
      const abort = () =>
        reject(
          new UrlSecurityError(
            "FETCH_TIMEOUT",
            "Website fetch was cancelled or exceeded its time limit.",
          ),
        );
      if (deadline.signal.aborted) abort();
      else deadline.signal.addEventListener("abort", abort, { once: true });
    });
    const task = async (): Promise<TextFetchResult> => {
      let current = normalizePublicUrl(value);
      for (let redirects = 0; ; redirects++) {
        if (options.allowedOrigin && current.origin !== options.allowedOrigin)
          throw new UrlSecurityError(
            "CROSS_ORIGIN_REDIRECT",
            "The website redirected outside the permitted origin.",
          );
        const { url, addresses } = await resolvePublicUrl(
          current,
          deps.resolver,
        );
        if (deadline.signal.aborted)
          throw new UrlSecurityError(
            "FETCH_TIMEOUT",
            "Website fetch timed out.",
          );
        const response = await (deps.transport ?? pinnedTransport)(
          url,
          addresses[0],
          deadline.signal,
        );
        activeResponse = response;
        if (deadline.signal.aborted) {
          response.cancel();
          throw new UrlSecurityError(
            "FETCH_TIMEOUT",
            "Website fetch timed out.",
          );
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          response.cancel();
          if (redirects >= maxRedirects)
            throw new UrlSecurityError(
              "REDIRECT_LIMIT",
              "The website exceeded the redirect limit.",
            );
          const location = response.headers.location;
          if (!location)
            throw new UrlSecurityError(
              "BAD_REDIRECT",
              "The website returned a redirect without a location.",
            );
          current = normalizePublicUrl(new URL(location, url));
          if (url.protocol === "https:" && current.protocol !== "https:")
            throw new UrlSecurityError(
              "HTTPS_DOWNGRADE",
              "HTTPS websites cannot redirect to HTTP.",
            );
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          response.cancel();
          throw new UrlSecurityError(
            "HTTP_ERROR",
            `Website returned HTTP ${response.status}.`,
          );
        }
        const contentType = String(
          response.headers["content-type"] ?? "",
        ).toLowerCase();
        const mime = contentType.split(";", 1)[0].trim();
        if (mime !== "text/html" && mime !== "text/plain") {
          response.cancel();
          throw new UrlSecurityError(
            "CONTENT_TYPE",
            "Only HTML and plain-text pages can be imported.",
          );
        }
        const encoding = response.headers["content-encoding"];
        if (encoding && encoding !== "identity") {
          response.cancel();
          throw new UrlSecurityError(
            "CONTENT_ENCODING",
            "Compressed responses are not accepted by the bounded importer.",
          );
        }
        const declaredBytes = Number(response.headers["content-length"]);
        if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
          response.cancel();
          throw new UrlSecurityError(
            "CONTENT_LIMIT",
            "Website content exceeds the import size limit.",
          );
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        try {
          for await (const chunk of response.body) {
            bytes += chunk.byteLength;
            if (bytes > maxBytes)
              throw new UrlSecurityError(
                "CONTENT_LIMIT",
                "Website content exceeds the import size limit.",
              );
            chunks.push(Buffer.from(chunk));
          }
        } catch (error) {
          response.cancel();
          throw error;
        }
        return {
          url: url.href,
          text: Buffer.concat(chunks).toString("utf8"),
          bytes,
          contentType,
        };
      }
    };
    try {
      return await Promise.race([task(), interrupted]);
    } catch (error) {
      if (error instanceof UrlSecurityError) throw error;
      if (deadline.signal.aborted)
        throw new UrlSecurityError(
          "FETCH_TIMEOUT",
          "Website fetch was cancelled or exceeded its time limit.",
        );
      throw new UrlSecurityError(
        "FETCH_FAILED",
        "The website could not be fetched securely.",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", forwardAbort);
      if (deadline.signal.aborted) activeResponse?.cancel();
    }
  };
}

export const safeFetchText = createSafeTextFetcher();
export const assertSafePublicUrl = resolvePublicUrl;
