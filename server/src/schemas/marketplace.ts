import { z } from "zod";

const slug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const httpsUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && host !== "localhost" && !host.startsWith("127.") && host !== "0.0.0.0" && !host.startsWith("10.") && !host.startsWith("192.168.") && !/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}, "A public HTTPS URL is required");

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(100), slug,
  description: z.string().trim().min(10).max(2000),
  imageUrl: httpsUrl.optional(), imageAssetId: objectId.optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
}).strict().refine((value) => Boolean(value.imageUrl || value.imageAssetId), "Add a category image");

const themeBaseSchema = z.object({
  categoryId: objectId,
  name: z.string().trim().min(2).max(100),
  slug,
  shortDescription: z.string().trim().min(10).max(240),
  description: z.string().trim().min(20).max(20_000),
  stack: z.array(z.string().trim().min(1).max(40)).min(1, "Add at least one technology").max(20),
  features: z.array(z.string().trim().min(1).max(160)).min(1, "Add at least one feature").max(30),
  priceMinor: z.number().int().min(0).max(100_000_000),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  version: z.string().trim().min(1).max(30),
  changelog: z.string().max(20_000).optional(),
  setupInstructions: z.string().max(20_000).optional(),
  deployInstructions: z.string().max(20_000).optional(),
  instructionsFormat: z.enum(["plain", "html"]).optional(),
  previewUrl: httpsUrl,
  previewAssetId: objectId,
  imageAssetIds: z.array(objectId).min(2, "Upload at least 2 theme images").max(10, "Upload no more than 10 theme images"),
  videoAssetIds: z.array(objectId).min(1, "Upload at least 1 tutorial video").max(2, "Upload no more than 2 tutorial videos"),
  sourceAssetId: objectId,
  featured: z.boolean().default(false),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(170).optional(),
});

export const themeInputSchema = themeBaseSchema.superRefine((value, context) => {
  const ids = [value.previewAssetId, ...value.imageAssetIds, ...value.videoAssetIds, value.sourceAssetId];
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["previewAssets"], message: "Use separate files for the preview, gallery, tutorials, and source" });
  }
});

export const themePatchSchema = themeBaseSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const catalogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  category: slug.optional(),
  search: z.string().trim().max(100).optional(),
  stack: z.string().trim().max(40).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  featured: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular"]).default("newest"),
});

export const uploadInitSchema = z.object({
  kind: z.enum(["image", "video", "theme_zip"]),
  originalName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().trim().max(128).optional(),
});

export const uploadPartSchema = z.object({ partNumber: z.number().int().min(1).max(10_000) });
export const uploadCompleteSchema = z.object({ parts: z.array(z.object({ ETag: z.string().min(1), PartNumber: z.number().int().min(1) })).min(1) });
export const cartItemSchema = z.object({ themeId: objectId });
const discountCode = z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, hyphens, or underscores").transform((value) => value.toUpperCase());
export const discountCodeSchema = z.object({ code: discountCode }).strict();
export const checkoutSchema = z.object({ idempotencyKey: z.string().uuid(), discountCode: discountCode.optional() }).strict();
export const paymentSettingsSchema = z.object({
  enabledProviders: z.array(z.enum(["stripe", "paypal"])).min(1).max(2),
}).strict();
export const discountInputSchema = z.object({
  code: discountCode,
  type: z.enum(["percentage", "fixed"]),
  percentageBps: z.number().int().min(1).max(9999).optional(),
  amountMinor: z.number().int().min(1).max(100_000_000).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  usageLimit: z.number().int().min(1).max(1_000_000),
  expiresAt: z.coerce.date().refine((value) => value.getTime() > Date.now(), "Expiration must be in the future"),
  active: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.type === "percentage" && value.percentageBps === undefined) context.addIssue({ code: "custom", path: ["percentageBps"], message: "Percentage is required" });
  if (value.type === "fixed" && value.amountMinor === undefined) context.addIssue({ code: "custom", path: ["amountMinor"], message: "Amount is required" });
  if (value.type === "fixed" && value.currency === undefined) context.addIssue({ code: "custom", path: ["currency"], message: "Currency is required" });
});
export const discountStatusSchema = z.object({ active: z.boolean() }).strict();
export const paypalCaptureSchema = z.object({
  token: z.string().trim().min(8).max(80).regex(/^[A-Za-z0-9-]+$/, "Invalid PayPal token"),
}).strict();
export const idSchema = z.object({ id: objectId });
export const stripeSessionSchema = z.object({ sessionId: z.string().trim().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/, "Invalid Stripe Checkout Session identifier") });
export const slugSchema = z.object({ slug });

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}
