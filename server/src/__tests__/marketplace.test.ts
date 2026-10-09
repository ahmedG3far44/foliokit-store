import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import env from "../config/env.ts";
import { categoryInputSchema, catalogQuerySchema, checkoutSchema, discountInputSchema, paypalCaptureSchema, paymentSettingsSchema, themeInputSchema, themePatchSchema } from "../schemas/marketplace.ts";
import { validateStripeCheckoutAmounts, verifyStripeSignature } from "../services/stripe.service.ts";
import { createCheckout } from "../services/checkout.service.ts";
import { themeAssetIssues } from "../utils/theme-assets.ts";
import { AppError } from "../utils/app-error.ts";
import { assertInvoicePaid, createInvoicePdf, type InvoiceData } from "../services/pdf.service.ts";
import { createMarketingUnsubscribeToken, normalizeEmailSubject, renderEmailTemplate, verifyMarketingUnsubscribeToken } from "../services/email.service.ts";
import { isSuccessfulFullRefund } from "../routes/webhook.route.ts";
import { paypalDecimalToMinor, validatePaypalAmount } from "../services/paypal.service.ts";
import { allocateDiscount, calculateDiscountMinor } from "../services/discount.service.ts";
import { serializeAsset } from "../services/upload.service.ts";
import { analyticsWindow } from "../services/order.service.ts";
import { createSigningClock } from "../utils/signing-clock.ts";

test("R2 signing uses storage time and shares concurrent clock checks", async () => {
  let elapsed = 0;
  let reads = 0;
  const storageTime = Date.now() - 7 * 60 * 60_000;
  const clock = createSigningClock(async () => { reads++; return storageTime; }, () => elapsed);
  const dates = await Promise.all([clock(), clock(), clock()]);
  assert.equal(reads, 1);
  assert.ok(dates.every((date) => date.getTime() === storageTime));
  elapsed = 10_000;
  assert.equal((await clock()).getTime(), storageTime + 10_000);
  assert.equal(reads, 1);
});

test("R2 signing retains storage time when refreshing fails and retries later", async () => {
  let elapsed = 0;
  let reads = 0;
  const storageTime = Date.now() - 7 * 60 * 60_000;
  const clock = createSigningClock(async () => {
    if (++reads === 2) throw new Error("Temporary network failure");
    return storageTime + elapsed;
  }, () => elapsed);
  await clock();
  elapsed = 300_000;
  assert.equal((await clock()).getTime(), storageTime + elapsed);
  assert.equal(reads, 2);
  elapsed += 30_000;
  assert.equal((await clock()).getTime(), storageTime + elapsed);
  assert.equal(reads, 3);
});

test("R2 signing falls back to local time if the initial storage date is invalid", async () => {
  const clock = createSigningClock(async () => NaN);
  const before = Date.now();
  assert.ok((await clock()).getTime() >= before);
});

const validTheme = { categoryId: "64b64c16e3a54f0012345680", name: "Studio Grid", slug: "studio-grid", shortDescription: "A considered portfolio for creative studios.", description: "A complete, responsive portfolio theme designed for independent creative studios.", stack: ["React"], features: ["Responsive"], priceMinor: 4900, currency: "usd", version: "1.0.0", previewUrl: "https://preview.example.com", previewAssetId: "64b64c16e3a54f0012345670", imageAssetIds: ["64b64c16e3a54f0012345678", "64b64c16e3a54f0012345677"], videoAssetIds: ["64b64c16e3a54f0012345676"], sourceAssetId: "64b64c16e3a54f0012345679", featured: false };

test("theme input preserves integer minor units and normalizes currency", () => {
  const parsed = themeInputSchema.parse(validTheme);
  assert.equal(parsed.priceMinor, 4900);
  assert.equal(parsed.currency, "USD");
});

test("theme preview rejects localhost and non-HTTPS URLs", () => {
  assert.equal(themeInputSchema.safeParse({ ...validTheme, previewUrl: "http://localhost:5173" }).success, false);
});

test("theme input requires a preview asset and source ZIP", () => {
  assert.equal(themeInputSchema.safeParse({ ...validTheme, imageAssetIds: [], videoAssetIds: [] }).success, false);
  assert.equal(themeInputSchema.safeParse({ ...validTheme, sourceAssetId: undefined }).success, false);
});

test("Stripe webhook signatures require the correct signed payload", () => {
  env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const body = Buffer.from('{"id":"evt_test"}');
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`), true);
  assert.equal(verifyStripeSignature(Buffer.from("changed"), `t=${timestamp},v1=${signature}`), false);
});

test("Stripe checkout reconciliation accepts provider tax without weakening subtotal validation", () => {
  assert.deepEqual(validateStripeCheckoutAmounts({
    amount_subtotal: 11520,
    amount_total: 13133,
    currency: "usd",
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 1613 },
  }, 11520, "USD"), { subtotalMinor: 11520, discountMinor: 0, taxMinor: 1613, totalMinor: 13133, currency: "USD" });

  assert.deepEqual(validateStripeCheckoutAmounts({
    amount_subtotal: 11520,
    amount_total: 11981,
    currency: "usd",
    total_details: { amount_discount: 1152, amount_shipping: 0, amount_tax: 1613 },
  }, 11520, "USD"), { subtotalMinor: 11520, discountMinor: 1152, taxMinor: 1613, totalMinor: 11981, currency: "USD" });

  assert.throws(() => validateStripeCheckoutAmounts({
    amount_subtotal: 11420,
    amount_total: 13019,
    currency: "usd",
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 1599 },
  }, 11520, "USD"), /subtotal does not match/);
});

test("checkout does not accept a client-selected payment provider", () => {
  const idempotencyKey = "e1ec2cf8-53f9-4f3f-8e72-21c50c028295";
  assert.deepEqual(checkoutSchema.parse({ idempotencyKey }), { idempotencyKey });
  assert.deepEqual(checkoutSchema.parse({ idempotencyKey, discountCode: " launch-15 " }), { idempotencyKey, discountCode: "LAUNCH-15" });
  assert.equal(checkoutSchema.safeParse({ idempotencyKey, provider: "stripe" }).success, false);
  assert.equal(checkoutSchema.safeParse({ idempotencyKey, provider: "paypal" }).success, false);
});

test("discount inputs enforce one safe value type, a future expiry, and payment-provider selection", () => {
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(discountInputSchema.safeParse({ code: "SAVE15", type: "percentage", percentageBps: 1500, usageLimit: 20, expiresAt, active: true }).success, true);
  assert.equal(discountInputSchema.safeParse({ code: "SAVE10", type: "fixed", amountMinor: 1000, currency: "usd", usageLimit: 20, expiresAt, active: true }).success, true);
  assert.equal(discountInputSchema.safeParse({ code: "SAVE15", type: "percentage", usageLimit: 20, expiresAt, active: true }).success, false);
  assert.equal(discountInputSchema.safeParse({ code: "SAVE10", type: "fixed", amountMinor: 1000, usageLimit: 20, expiresAt, active: true }).success, false);
  assert.equal(discountInputSchema.safeParse({ code: "EXPIRED", type: "percentage", percentageBps: 1500, usageLimit: 20, expiresAt: new Date(Date.now() - 1000), active: true }).success, false);
  assert.deepEqual(paymentSettingsSchema.parse({ enabledProviders: ["stripe", "paypal"] }), { enabledProviders: ["stripe", "paypal"] });
  assert.equal(paymentSettingsSchema.safeParse({ enabledProviders: [] }).success, false);
});

test("discount calculation handles percentage and fixed amounts without changing the subtotal source", () => {
  assert.equal(calculateDiscountMinor({ type: "percentage", percentageBps: 1500 }, 9800), 1470);
  assert.equal(calculateDiscountMinor({ type: "fixed", amountMinor: 1000 }, 9800), 1000);
  assert.throws(() => calculateDiscountMinor({ type: "fixed", amountMinor: 9800 }, 9800), (error: unknown) => error instanceof AppError && error.code === "DISCOUNT_EXCEEDS_TOTAL");
  const allocations = allocateDiscount([{ priceMinor: 4900 }, { priceMinor: 5100 }], 1500);
  assert.deepEqual(allocations, [735, 765]);
  assert.equal(allocations.reduce((sum, amount) => sum + amount, 0), 1500);
});

test("administrator accounts cannot create marketplace checkouts", async () => {
  await assert.rejects(
    createCheckout({ _id: "admin-id", email: "admin@example.com", name: "Admin", role: "admin" }, "e1ec2cf8-53f9-4f3f-8e72-21c50c028295"),
    (error: unknown) => error instanceof AppError && error.status === 403 && error.code === "ADMIN_PURCHASE_FORBIDDEN",
  );
});

test("invoice PDFs are generated only for paid orders", async () => {
  assert.throws(() => assertInvoicePaid("pending"), (error: unknown) => error instanceof AppError && error.code === "INVOICE_NOT_AVAILABLE");
  const invoice = {
    order: {
      _id: "64b64c16e3a54f0012345679", orderNumber: "ORD-20260915-DEMO", userId: "64b64c16e3a54f0012345671", status: "paid", paymentProvider: "stripe",
      checkoutKey: "invoice-test", currency: "USD", subtotalMinor: 9800, discountMinor: 980, taxMinor: 706, totalMinor: 9526,
      discountSnapshot: { code: "WELCOME10", percentage: 10 }, paidAt: new Date("2026-09-15T10:05:00Z"), createdAt: new Date("2026-09-15T10:00:00Z"), updatedAt: new Date("2026-09-15T10:05:00Z"),
      items: [
        { _id: "64b64c16e3a54f0012345672", themeId: "64b64c16e3a54f0012345673", sourceAssetId: "64b64c16e3a54f0012345674", name: "Studio Grid", slug: "studio-grid", version: "1.0.0", priceMinor: 4900, discountMinor: 490, totalMinor: 4410 },
        { _id: "64b64c16e3a54f0012345675", themeId: "64b64c16e3a54f0012345676", sourceAssetId: "64b64c16e3a54f0012345677", name: "Motion Folio", slug: "motion-folio", version: "2.1.0", priceMinor: 4900, discountMinor: 490, totalMinor: 4410 },
      ],
    },
    customer: { name: "Ahmed Customer", email: "customer@example.com", phone: "+20 100 000 0000" },
    region: { city: "Cairo", region: "C", country: "EG", timezone: "Africa/Cairo" },
  } as unknown as InvoiceData;
  const pdf = await createInvoicePdf(invoice);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 2_000);
});

test("PayPal capture input and provider amounts are strictly validated", () => {
  assert.deepEqual(paypalCaptureSchema.parse({ token: "7AB12345678901234" }), { token: "7AB12345678901234" });
  assert.equal(paypalCaptureSchema.safeParse({ token: "bad token" }).success, false);
  assert.equal(paypalDecimalToMinor("49.99"), 4999);
  assert.equal(paypalDecimalToMinor("49.999"), null);
  assert.doesNotThrow(() => validatePaypalAmount("49.99", "usd", 4999, "USD"));
  assert.throws(() => validatePaypalAmount("49.98", "USD", 4999, "USD"), /amount does not match/);
  assert.throws(() => validatePaypalAmount("49.99", "EUR", 4999, "USD"), /currency does not match/);
});



test("email templates render safe event-specific content", () => {
  for (const type of ["welcome", "invoice", "refund", "promotion"] as const) {
    const rendered = renderEmailTemplate(type, { name: "<Demo>", orderNumber: "ORD-TEST", amountMinor: 5292, currency: "USD" });
    assert.ok(rendered.subject.length > 0);
    assert.match(rendered.html, /FOLIOKIT/);
    assert.doesNotMatch(rendered.html, /<Demo>/);
    assert.ok(rendered.text.length > 20);
  }
});

test("email subjects are always present and cannot contain injected headers", () => {
  assert.equal(normalizeEmailSubject("  Limited offer\r\nBcc: attacker@example.com  ", "Fallback"), "Limited offer Bcc: attacker@example.com");
  assert.equal(normalizeEmailSubject(" \n ", "Fallback"), "Fallback");
});

test("invoice emails contain Gmail order markup and a purchase link", () => {
  const rendered = renderEmailTemplate("invoice", {
    name: "Customer",
    orderNumber: "ORD-123",
    amountMinor: 4900,
    currency: "USD",
    items: [{ name: "Studio Grid", priceMinor: 4900 }],
    orderUrl: "https://foliokit.store/purchases",
    orderDate: "2026-09-21T12:00:00.000Z",
    discount: { code: "LAUNCH15", type: "percentage", percentageBps: 1500, appliedAmountMinor: 735 },
  });
  assert.match(rendered.html, /application\/ld\+json/);
  assert.match(rendered.html, /"@type":"Order"/);
  assert.match(rendered.html, /https:\/\/foliokit\.store\/purchases/);
  assert.match(rendered.html, /LAUNCH15/);
  assert.match(rendered.html, /15% off/);
  assert.match(rendered.html, /−\$7\.35/);
  assert.match(rendered.text, /Discount LAUNCH15 \(15% off\): -\$7\.35/);
});

test("invoice emails describe fixed-amount discounts", () => {
  const rendered = renderEmailTemplate("invoice", {
    orderNumber: "ORD-FIXED",
    amountMinor: 3900,
    currency: "USD",
    discount: { code: "SAVE10", type: "fixed", amountMinor: 1000, appliedAmountMinor: 1000 },
  });
  assert.match(rendered.html, /SAVE10/);
  assert.match(rendered.html, /\$10\.00 off/);
  assert.match(rendered.text, /Discount SAVE10 \(\$10\.00 off\): -\$10\.00/);
});


test("marketing unsubscribe tokens reject tampering", () => {
  const userId = "64b64c16e3a54f0012345671";
  const token = createMarketingUnsubscribeToken(userId);
  assert.equal(verifyMarketingUnsubscribeToken(token), userId);
  assert.equal(verifyMarketingUnsubscribeToken(`${token}changed`), null);
});

test("refund events only close an order after Stripe confirms the full amount", () => {
  assert.equal(isSuccessfulFullRefund({ id: "evt_partial", type: "charge.refunded", data: { object: { id: "ch_1", amount: 5000, amount_refunded: 1000, refunded: false } } }, 5000), false);
  assert.equal(isSuccessfulFullRefund({ id: "evt_full", type: "charge.refunded", data: { object: { id: "ch_1", amount: 5000, amount_refunded: 5000, refunded: true } } }, 5000), true);
  assert.equal(isSuccessfulFullRefund({ id: "evt_refund", type: "refund.updated", data: { object: { id: "re_1", amount: 5000, status: "succeeded" } } }, 5000), true);
});


test("theme media limits apply to creation and partial updates", () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => index.toString(16).padStart(24, "0"));
  for (const count of [0, 1, 11]) {
    assert.equal(themeInputSchema.safeParse({ ...validTheme, imageAssetIds: ids(count) }).success, false);
    assert.equal(themePatchSchema.safeParse({ imageAssetIds: ids(count) }).success, false);
  }
  for (const count of [2, 10]) assert.equal(themeInputSchema.safeParse({ ...validTheme, imageAssetIds: ids(count) }).success, true);
  for (const count of [0, 3]) {
    assert.equal(themeInputSchema.safeParse({ ...validTheme, videoAssetIds: ids(count) }).success, false);
    assert.equal(themePatchSchema.safeParse({ videoAssetIds: ids(count) }).success, false);
  }
  assert.equal(themeInputSchema.safeParse({ ...validTheme, videoAssetIds: ids(2) }).success, true);
  assert.equal(themeInputSchema.safeParse({ ...validTheme, previewAssetId: undefined }).success, false);
  assert.equal(themeInputSchema.safeParse({ ...validTheme, previewAssetId: validTheme.videoAssetIds[0] }).success, false);
  assert.equal(themePatchSchema.safeParse({ setupInstructions: "", deployInstructions: "", instructionsFormat: "html" }).success, true);
});

test("theme assets require the correct roles, ready status, and distinct files", () => {
  const assets = new Map([
    [validTheme.previewAssetId, { kind: "video", contentType: "video/mp4", status: "ready" }],
    ...validTheme.imageAssetIds.map((id) => [id, { kind: "image", contentType: "image/png", status: "ready" }] as const),
    [validTheme.videoAssetIds[0]!, { kind: "video", contentType: "video/webm", status: "ready" }],
    [validTheme.sourceAssetId, { kind: "theme_zip", contentType: "application/zip", status: "ready" }],
  ]);
  assert.deepEqual(themeAssetIssues(validTheme, assets), []);
  assets.set(validTheme.previewAssetId, { kind: "image", contentType: "image/gif", status: "ready" });
  assert.deepEqual(themeAssetIssues(validTheme, assets), []);
  assets.set(validTheme.previewAssetId, { kind: "image", contentType: "image/png", status: "ready" });
  assert.deepEqual(themeAssetIssues(validTheme, assets), []);
  assets.set(validTheme.previewAssetId, { kind: "image", contentType: "image/svg+xml", status: "ready" });
  assert.equal(themeAssetIssues(validTheme, assets)[0]?.path[0], "previewAssetId");
  assets.set(validTheme.previewAssetId, { kind: "video", contentType: "video/webm", status: "ready" });
  assert.deepEqual(themeAssetIssues(validTheme, assets), []);
  assets.set(validTheme.imageAssetIds[0]!, { kind: "image", contentType: "image/png", status: "processing" });
  assert.equal(themeAssetIssues(validTheme, assets)[0]?.path[0], "imageAssetIds");
  assets.set(validTheme.imageAssetIds[0]!, { kind: "image", contentType: "image/png", status: "ready" });
  assert.ok(themeAssetIssues({ ...validTheme, videoAssetIds: [validTheme.previewAssetId] }, assets).some((issue) => issue.path[0] === "previewAssets"));
  assets.delete(validTheme.videoAssetIds[0]!);
  assert.ok(themeAssetIssues(validTheme, assets).some((issue) => issue.path[0] === "videoAssetIds"));
  assets.delete(validTheme.sourceAssetId);
  assert.ok(themeAssetIssues(validTheme, assets).some((issue) => issue.path[0] === "sourceAssetId"));
});

test("theme lists remain available when stored media cannot be signed", async () => {
  const previousR2 = {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  };
  env.R2_ACCOUNT_ID = "replace_me";
  env.R2_ACCESS_KEY_ID = "replace_me";
  env.R2_SECRET_ACCESS_KEY = "replace_me";
  env.R2_BUCKET = "replace_me";
  try {
    const asset = await serializeAsset({
      _id: "64b64c16e3a54f0012345680",
      kind: "image",
      status: "ready",
      bucket: "legacy-r2-bucket",
      key: "images/original.png",
      originalName: "original.png",
      contentType: "image/png",
      sizeBytes: 1024,
      variants: [{ format: "webp", key: "images/640.webp", width: 640, height: 360, sizeBytes: 512 }],
    });
    assert.equal(asset.url, undefined);
    assert.equal(asset.variants[0]?.url, undefined);
    assert.equal(asset.originalName, "original.png");
  } finally {
    env.R2_ACCOUNT_ID = previousR2.accountId;
    env.R2_ACCESS_KEY_ID = previousR2.accessKeyId;
    env.R2_SECRET_ACCESS_KEY = previousR2.secretAccessKey;
    env.R2_BUCKET = previousR2.bucket;
  }
});

test("today insights use the current calendar day and custom ranges include full days", () => {
  const now = new Date(2026, 8, 29, 15, 45, 30, 123);
  const today = analyticsWindow("day", undefined, undefined, now);
  assert.deepEqual(
    [today.start.getFullYear(), today.start.getMonth(), today.start.getDate(), today.start.getHours(), today.start.getMinutes()],
    [2026, 8, 29, 0, 0],
  );
  assert.equal(today.end.getTime(), now.getTime());

  const custom = analyticsWindow("month", "2026-09-10", "2026-09-12", now);
  assert.deepEqual(
    [custom.start.getFullYear(), custom.start.getMonth(), custom.start.getDate(), custom.start.getHours(), custom.start.getMinutes()],
    [2026, 8, 10, 0, 0],
  );
  assert.deepEqual(
    [custom.end.getFullYear(), custom.end.getMonth(), custom.end.getDate(), custom.end.getHours(), custom.end.getMinutes(), custom.end.getSeconds(), custom.end.getMilliseconds()],
    [2026, 8, 12, 23, 59, 59, 999],
  );
});


test("category input requires an image, validates URLs and normalizes fields", () => {
  const category = { name: " Creatives ", slug: "creatives", description: "Themes for independent creative professionals.", imageUrl: "https://example.com/category.jpg" };
  assert.equal(categoryInputSchema.parse(category).name, "Creatives");
  assert.equal(categoryInputSchema.parse(category).sortOrder, 0);
  assert.equal(categoryInputSchema.safeParse({ ...category, imageUrl: undefined }).success, false);
  assert.equal(categoryInputSchema.safeParse({ ...category, imageUrl: "javascript:alert(1)" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ ...category, imageUrl: "http://localhost/image.jpg" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ ...category, slug: "Developer's" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ ...category, sortOrder: -1 }).success, false);
  assert.equal(categoryInputSchema.safeParse({ ...category, imageUrl: undefined, imageAssetId: validTheme.categoryId }).success, true);
});

test("themes require a valid category while partial legacy edits remain supported", () => {
  assert.equal(themeInputSchema.safeParse({ ...validTheme, categoryId: undefined }).success, false);
  assert.equal(themeInputSchema.safeParse({ ...validTheme, categoryId: "invalid" }).success, false);
  assert.equal(themePatchSchema.safeParse({ categoryId: validTheme.categoryId }).success, true);
  assert.equal(themePatchSchema.safeParse({ description: validTheme.description }).success, true);
  assert.equal(catalogQuerySchema.parse({ category: "e-commerce" }).category, "e-commerce");
  assert.equal(catalogQuerySchema.safeParse({ category: { $ne: null } }).success, false);
});


test("category catalog filters published themes by category ID and rejects unknown categories", async (context) => {
  const { default: CategoryModel } = await import("../models/category.ts");
  const { default: ThemeModel } = await import("../models/theme.ts");
  const { listPublishedThemes } = await import("../services/theme.service.ts");
  let filter: unknown;
  context.mock.method(CategoryModel, "findOne", () => ({ lean: async () => ({ _id: validTheme.categoryId }) }));
  const query = { sort: () => query, skip: () => query, limit: () => query, lean: async () => [] };
  context.mock.method(ThemeModel, "find", (value: unknown) => { filter = value; return query; });
  context.mock.method(ThemeModel, "countDocuments", async () => 0);
  context.mock.method(ThemeModel, "aggregate", async () => []);
  const result = await listPublishedThemes(catalogQuerySchema.parse({ category: "creatives" }));
  assert.deepEqual(filter, { status: "published", categoryId: validTheme.categoryId });
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
  context.mock.method(CategoryModel, "findOne", () => ({ lean: async () => null }));
  await assert.rejects(() => listPublishedThemes(catalogQuerySchema.parse({ category: "missing" })), (error: unknown) => error instanceof AppError && error.status === 404);
});

test("category deletion protects assigned themes and unused categories can be removed", async (context) => {
  const { default: CategoryModel } = await import("../models/category.ts");
  const { default: ThemeModel } = await import("../models/theme.ts");
  const { deleteCategory } = await import("../services/category.service.ts");
  context.mock.method(ThemeModel, "exists", async () => ({ _id: validTheme.categoryId }));
  const deletion = context.mock.method(CategoryModel, "findByIdAndDelete", async () => ({ _id: validTheme.categoryId }));
  await assert.rejects(() => deleteCategory(validTheme.categoryId), (error: unknown) => error instanceof AppError && error.status === 409);
  assert.equal(deletion.mock.callCount(), 0);
  context.mock.method(ThemeModel, "exists", async () => null);
  await deleteCategory(validTheme.categoryId);
  assert.equal(deletion.mock.callCount(), 1);
});


test("seed media provides real PNGs, a tutorial MP4, and a working multi-file template ZIP", async () => {
  const { seedImage, seedTemplateZip, seedTutorialMp4 } = await import("../utils/seed-assets.ts");
  const { default: sharp } = await import("sharp");
  const theme = { name: "Demo & Studio", slug: "demo-studio", color: "172033", accent: "F4B942", shortDescription: "A demo starter template." };
  const images = await Promise.all(["home", "projects", "preview"].map((view) => seedImage(theme, view as "home" | "projects" | "preview")));
  for (const image of images) {
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.format, "png"); assert.equal(metadata.width, 1200); assert.equal(metadata.height, 800);
  }
  assert.equal(images[0]!.equals(images[1]!), false);
  assert.equal(images[0]!.equals(images[2]!), false);
  const tutorial = await seedTutorialMp4();
  assert.equal(tutorial.toString("ascii", 4, 8), "ftyp");
  assert.ok(tutorial.length > 1000);
  const archive = seedTemplateZip(theme);
  const files = new Map<string, string>();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.readUInt32LE(offset + 18), nameSize = archive.readUInt16LE(offset + 26), extraSize = archive.readUInt16LE(offset + 28);
    const name = archive.toString("utf8", offset + 30, offset + 30 + nameSize);
    const start = offset + 30 + nameSize + extraSize;
    files.set(name, archive.toString("utf8", start, start + size)); offset = start + size;
  }
  assert.deepEqual([...files.keys()], ["index.html", "styles.css", "README.md"]);
  assert.match(files.get("index.html")!, /Demo &amp; Studio/);
  assert.match(files.get("index.html")!, /href="styles.css"/);
  assert.match(files.get("styles.css")!, /@media/);
  assert.match(files.get("README.md")!, /Open index.html/);
  assert.equal(archive.readUInt16LE(archive.length - 22 + 10), 3);
});

test("theme search matches partial words, technology punctuation, and literal special characters", async () => {
  const { themeSearchTerms } = await import("../utils/theme-search.ts");
  assert.ok(themeSearchTerms("aur")[0]!.test("Aurora Studio"));
  for (const query of ["nextjs", "Next.js", "NEXT-JS"]) {
    assert.ok(themeSearchTerms(query).every((term) => term.test("Next.js")));
  }
  assert.ok(themeSearchTerms("c++")[0]!.test("C++"));
  assert.equal(themeSearchTerms("c++")[0]!.test("CSS"), false);
  assert.deepEqual(themeSearchTerms(" .* () "), []);
  assert.equal(themeSearchTerms("React react").length, 1);
});

test("theme search combines keywords across name, stack, descriptions, features, and categories", async () => {
  const { themeSearchTerms, themeSearchFilter } = await import("../utils/theme-search.ts");
  const categoryId = validTheme.categoryId;
  const categories = [{ _id: categoryId, name: "Agencies", slug: "agencies", description: "Themes for creative studios" }];
  const filter = themeSearchFilter(themeSearchTerms("studio react responsive agencies"), categories);
  const clauses = filter.$and!;
  assert.equal(clauses.length, 4);
  const matches = (theme: Record<string, unknown>) => clauses.every((clause) => clause.$or!.some((condition) => Object.entries(condition).some(([field, pattern]) => {
    const value = theme[field];
    if (pattern instanceof RegExp) return (Array.isArray(value) ? value : [value]).some((item) => typeof item === "string" && pattern.test(item));
    if (field === "categoryId") return (pattern as { $in: unknown[] }).$in.includes(value);
    return false;
  })));
  assert.equal(matches({ name: "Studio Grid", stack: ["React", "TypeScript"], shortDescription: "Responsive layouts", categoryId }), true);
  assert.equal(matches({ name: "Studio Grid", stack: ["Astro"], description: "Responsive layouts", categoryId }), false);
  const single = themeSearchFilter(themeSearchTerms("responsive"));
  assert.ok(single.$and![0]!.$or!.some((clause) => "shortDescription" in clause));
  assert.ok(single.$and![0]!.$or!.some((clause) => "features" in clause));
  assert.deepEqual(themeSearchFilter([]), {});
});
