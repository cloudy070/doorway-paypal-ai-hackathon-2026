import { describe, expect, it, vi } from "vitest";
import {
  createSafeTextFetcher,
  isPublicIp,
  normalizePublicUrl,
  resolvePublicUrl,
  type PinnedTransport,
  type TransportResponse,
} from "../src/lib/url-security";

const publicAddress = { address: "93.184.216.34", family: 4 };
const resolver = async () => [publicAddress];
function response(
  text = "Shop",
  status = 200,
  headers: TransportResponse["headers"] = {},
): TransportResponse {
  return {
    status,
    headers: { "content-type": "text/html", ...headers },
    body: (async function* () {
      yield Buffer.from(text);
    })(),
    cancel: vi.fn(),
  };
}

describe("public website URL boundary", () => {
  it.each([
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost.",
    "http://store.internal",
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:secret@example.com",
    "https://example.com:8443",
  ])("rejects unsafe input %s", (url) => {
    expect(() => normalizePublicUrl(url)).toThrow();
  });
  it.each([
    "0.0.0.0",
    "10.2.3.4",
    "100.64.0.1",
    "172.31.255.255",
    "192.0.0.9",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "::ffff:8.8.8.8",
  ])("rejects nonpublic address %s", (ip) =>
    expect(isPublicIp(ip)).toBe(false),
  );
  it("accepts public IPv4 and global IPv6", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
    expect(normalizePublicUrl("https://example.com/path#section").href).toBe(
      "https://example.com/path",
    );
  });
  it("rejects mixed public and private DNS answers", async () => {
    await expect(
      resolvePublicUrl("https://example.com", async () => [
        publicAddress,
        { address: "10.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "PRIVATE_ADDRESS" });
  });
  it("pins the validated DNS address without a second lookup", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([publicAddress])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const transport: PinnedTransport = vi.fn(async (_url, address) => {
      expect(address).toEqual(publicAddress);
      return response();
    });
    await expect(
      createSafeTextFetcher({ resolver: lookup, transport })(
        "https://example.com",
      ),
    ).resolves.toMatchObject({ text: "Shop" });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rechecks DNS on each redirect to catch rebinding", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([publicAddress])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const transport = vi.fn(async () =>
      response("", 302, { location: "/catalog" }),
    );
    await expect(
      createSafeTextFetcher({ resolver: lookup, transport })(
        "https://example.com",
      ),
    ).rejects.toMatchObject({ code: "PRIVATE_ADDRESS" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("blocks a redirect into metadata before a second network connection", async () => {
    const transport = vi.fn(async () =>
      response("", 302, {
        location: "http://169.254.169.254/latest/meta-data",
      }),
    );
    await expect(
      createSafeTextFetcher({ resolver, transport })("https://example.com"),
    ).rejects.toMatchObject({ code: "PRIVATE_ADDRESS" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("limits redirect loops and rejects cross-origin crawl redirects", async () => {
    const transport = vi.fn(async () =>
      response("", 302, { location: "/again" }),
    );
    await expect(
      createSafeTextFetcher({ resolver, transport })("https://example.com", {
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
    expect(transport).toHaveBeenCalledTimes(2);
    const other = async () =>
      response("", 302, { location: "https://other.com/catalog" });
    await expect(
      createSafeTextFetcher({ resolver, transport: other })(
        "https://example.com",
        { allowedOrigin: "https://example.com" },
      ),
    ).rejects.toMatchObject({ code: "CROSS_ORIGIN_REDIRECT" });
  });
  it("rejects unsupported content, compression, HTTP errors, and oversized bodies", async () => {
    for (const [headers, code] of [
      [{ "content-type": "application/pdf" }, "CONTENT_TYPE"],
      [{ "content-encoding": "gzip" }, "CONTENT_ENCODING"],
      [{ "content-length": "9000000" }, "CONTENT_LIMIT"],
    ] as const) {
      await expect(
        createSafeTextFetcher({
          resolver,
          transport: async () => response("", 200, headers),
        })("https://example.com"),
      ).rejects.toMatchObject({ code });
    }
    await expect(
      createSafeTextFetcher({
        resolver,
        transport: async () => response("abcdef"),
      })("https://example.com", { maxBytes: 3 }),
    ).rejects.toMatchObject({ code: "CONTENT_LIMIT" });
    await expect(
      createSafeTextFetcher({
        resolver,
        transport: async () => response("", 403),
      })("https://example.com"),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" });
  });
  it("times out DNS and never starts a connection after the deadline", async () => {
    let finishLookup: (value: (typeof publicAddress)[]) => void = () => {};
    const transport = vi.fn(async () => response());
    const lookup = () =>
      new Promise<(typeof publicAddress)[]>((resolve) => {
        finishLookup = resolve;
      });
    await expect(
      createSafeTextFetcher({ resolver: lookup, transport })(
        "https://example.com",
        { timeoutMs: 5 },
      ),
    ).rejects.toMatchObject({ code: "FETCH_TIMEOUT" });
    finishLookup([publicAddress]);
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(transport).not.toHaveBeenCalled();
  });
  it("cancels a stalled response body when its total time limit expires", async () => {
    const cancel = vi.fn();
    const body = {
      async *[Symbol.asyncIterator]() {
        await new Promise(() => {});
        yield Buffer.from("never");
      },
    };
    await expect(
      createSafeTextFetcher({
        resolver,
        transport: async () => ({
          status: 200,
          headers: { "content-type": "text/html" },
          body,
          cancel,
        }),
      })("https://example.com", { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "FETCH_TIMEOUT" });
    expect(cancel).toHaveBeenCalled();
  });
});
