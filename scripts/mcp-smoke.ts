import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** Real SDK + real HTTP exercise. It deliberately stops before start_checkout. */
async function main() {
  const endpoint = process.argv[2] ?? process.env.DOORWAY_MCP_URL;
  if (!endpoint)
    throw new Error(
      "Usage: npx tsx scripts/mcp-smoke.ts http://127.0.0.1:3000/api/mcp/<published-shop-slug> [pickup-date]",
    );
  const url = new URL(endpoint);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new Error("MCP endpoint must use HTTPS or a local loopback server.");
  const client = new Client({
    name: "doorway-official-sdk-smoke",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { redirect: "error" },
    reconnectionOptions: {
      maxRetries: 0,
      maxReconnectionDelay: 1000,
      initialReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  const steps: Array<{ tool: string; result: unknown }> = [];
  async function call(name: string, args: Record<string, unknown>) {
    const response = await client.callTool({ name, arguments: args });
    if (response.isError)
      throw new Error(
        `${name} failed: ${JSON.stringify(response.structuredContent ?? response.content)}`,
      );
    if (
      !response.structuredContent ||
      typeof response.structuredContent !== "object"
    )
      throw new Error(`${name} did not return structured data.`);
    steps.push({ tool: name, result: response.structuredContent });
    return response.structuredContent as Record<string, unknown>;
  }
  try {
    await client.connect(transport);
    const list = await client.listTools();
    const expected = [
      "get_store",
      "search_products",
      "check_availability",
      "create_cart",
      "start_checkout",
    ];
    if (expected.some((name) => !list.tools.some((tool) => tool.name === name)))
      throw new Error("The public commerce tool contract is incomplete.");
    const shop = await call("get_store", {});
    const rules = shop.rules as {
      pickupDays: number[];
      leadTimeHours: number;
      minOrderMinor: number;
      maxQuantityPerLine: number;
    };
    const search = await call("search_products", { query: "" });
    const products = search.products as Array<{
      id: string;
      stock: number;
      priceMinor: number;
    }>;
    const product = products.find(
      (item) => item.stock > 0 && item.priceMinor > 0,
    );
    if (!product)
      throw new Error(
        "The published shop has no in-stock product for this smoke test.",
      );
    const quantity = Math.max(
      1,
      Math.ceil(rules.minOrderMinor / product.priceMinor),
    );
    if (quantity > product.stock || quantity > rules.maxQuantityPerLine)
      throw new Error(
        "No single-product smoke cart satisfies the shop's minimum and quantity rules.",
      );
    let pickupDate = process.argv[3];
    if (!pickupDate) {
      const earliest = Date.now() + rules.leadTimeHours * 3_600_000;
      for (let day = 0; day < 45; day++) {
        const date = new Date();
        date.setUTCHours(12, 0, 0, 0);
        date.setUTCDate(date.getUTCDate() + day);
        if (
          date.getTime() >= earliest &&
          rules.pickupDays.includes(date.getUTCDay())
        ) {
          pickupDate = date.toISOString().slice(0, 10);
          break;
        }
      }
      if (!pickupDate)
        throw new Error(
          "Could not select an allowed pickup date within the smoke-test horizon.",
        );
    }
    const input = { lines: [{ productId: product.id, quantity }], pickupDate };
    const availability = await call("check_availability", input);
    const cart = await call("create_cart", input);
    const quote = cart.quote as {
      totalMinor: number;
      currency: string;
      catalogVersion: number;
    };
    if (
      quote.totalMinor !== availability.totalMinor ||
      quote.currency !== availability.currency ||
      quote.catalogVersion !== availability.catalogVersion
    )
      throw new Error(
        "The published catalog changed during smoke; rerun with a fresh quote.",
      );
    console.log(
      JSON.stringify(
        {
          source: "LOCAL_VALIDATION",
          sdk: "@modelcontextprotocol/sdk",
          transport: "STREAMABLE_HTTP",
          endpoint: url.href,
          observedAt: new Date().toISOString(),
          success: true,
          humanApprovalAttempted: false,
          paymentCreated: false,
          tools: list.tools.map((tool) => tool.name),
          steps,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      source: "LOCAL_VALIDATION",
      success: false,
      error: error instanceof Error ? error.message : "MCP smoke failed.",
    }),
  );
  process.exitCode = 1;
});
