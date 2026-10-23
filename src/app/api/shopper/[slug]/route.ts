import { z } from "zod";
import { checkOrigin, rateLimit } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { resolveShop } from "@/lib/shops";
import { CommerceError, getCommerceCatalog } from "@/lib/commerce";
import { AppError } from "@/lib/errors";
import { runShopper, shopperInputSchema } from "@/lib/shopper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buyerInput(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AppError(
      "INVALID_CONTENT_TYPE",
      "Send a JSON shopping request.",
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError("INVALID_INPUT", "A shopping request is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 6000) {
        await reader.cancel();
        throw new AppError(
          "BODY_LIMIT",
          "The shopping request is too large.",
          413,
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(
      "INVALID_JSON",
      "The shopping request must contain valid JSON.",
    );
  }
}

/** Public buyer agent, limited to one verified published shop and explicit opt-in. */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    checkOrigin(request);
    rateLimit("shopper:all", 40);
    const { slug } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
      throw new AppError("SHOP_NOT_FOUND", "Shop not found.", 404);
    const buyer = shopperInputSchema.parse(await buyerInput(request));
    const store = await getStore();
    const shop = await resolveShop(store, slug);
    if (!shop) throw new AppError("SHOP_NOT_FOUND", "Shop not found.", 404);
    const { catalog } = await getCommerceCatalog(store, shop.id);
    rateLimit(`shopper:${shop.id}`, 8);
    const result = await runShopper(
      { shop, catalog, ...buyer },
      { store, signal: request.signal },
    );
    // A completed HTTP exchange can contain a BLOCKED/FAILED run. Its status and
    // findings remain authoritative; no model reply can mark a payment paid.
    return Response.json(
      { data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: {
            code: "INVALID_INPUT",
            message:
              "Provide a shopping intent and an explicit prepareCheckout true/false choice. Extra fields, tenant IDs, prices and URLs are not accepted.",
          },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof AppError || error instanceof CommerceError)
      return Response.json(
        {
          error: {
            code: error.code,
            message:
              error instanceof AppError
                ? error.message
                : error.code.toLowerCase().replaceAll("_", " "),
          },
        },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      {
        error: {
          code: "SHOPPER_FAILED",
          message:
            "The shopping request did not complete. No successful purchase is implied.",
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
