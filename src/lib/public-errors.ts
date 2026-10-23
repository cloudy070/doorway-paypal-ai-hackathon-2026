import { z } from "zod";
const detailsSchema = z.object({
  productId: z.string().min(1).max(100).optional(),
  alternatives: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        name: z.string().min(1).max(160),
      }),
    )
    .max(30)
    .optional(),
  allowedDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  minimumMinor: z.number().int().min(0).max(10000000).optional(),
});
/** Only buyer-safe, bounded rule guidance. Provider, owner and secret fields are stripped. */
export function publicCommerceDetails(value: unknown) {
  const parsed = detailsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
