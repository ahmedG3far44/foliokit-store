import { listCategories, saveCategory, deleteCategory } from "../services/category.service.ts";
import { categoryInputSchema } from "../schemas/marketplace.ts";
import { raw, Router } from "express";
import { requireAdmin, requireDatabaseUser } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rate-limit.ts";
import { discountInputSchema, discountStatusSchema, idSchema, parseOrThrow, paymentSettingsSchema, themeInputSchema, themePatchSchema, uploadCompleteSchema, uploadInitSchema, uploadPartSchema } from "../schemas/marketplace.ts";
import { audit } from "../services/audit.service.ts";
import { getAdminOrder, listAdminOrders, marketplaceInsights, themeSales } from "../services/order.service.ts";
import { archiveOrDeleteTheme, createTheme, getAdminTheme, listAdminThemes, publishTheme, updateTheme } from "../services/theme.service.ts";
import { cancelUpload, completeUpload, initiateUpload, uploadPart } from "../services/upload.service.ts";
import { AppError } from "../utils/app-error.ts";
import { paidOrderInvoiceForAdmin } from "../services/pdf.service.ts";
import { createDiscount, listDiscounts, paymentSettings, updateDiscount, updatePaymentSettings } from "../services/discount.service.ts";

const router = Router(); router.use(requireDatabaseUser, requireAdmin);

router.get("/categories", async (_req, res, next) => { try { res.json({ success: true, data: await listCategories() }); } catch (error) { next(error); } });
router.post("/categories", async (req, res, next) => { try { const category = await saveCategory(parseOrThrow(categoryInputSchema, req.body), req.currentUser!._id); await audit(req, "category.create", "category", String(category._id), undefined, category.toObject()); res.status(201).json({ success: true, data: { id: String(category._id) } }); } catch (error) { next(error); } });
router.put("/categories/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); const category = await saveCategory(parseOrThrow(categoryInputSchema, req.body), req.currentUser!._id, id); await audit(req, "category.update", "category", id, undefined, category.toObject()); res.json({ success: true, data: { id } }); } catch (error) { next(error); } });
router.delete("/categories/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); await deleteCategory(id); await audit(req, "category.delete", "category", id); res.json({ success: true, data: null }); } catch (error) { next(error); } });

router.get("/insights", async (req, res, next) => { try { const allowed = ["day", "week", "month", "six_months", "year"] as const; const period = allowed.includes(req.query.period as typeof allowed[number]) ? req.query.period as typeof allowed[number] : "month"; res.json({ success: true, data: await marketplaceInsights(period, req.query.from ? String(req.query.from) : undefined, req.query.to ? String(req.query.to) : undefined) }); } catch (error) { next(error); } });

router.get("/themes", async (req, res, next) => { try { res.json({ success: true, data: await listAdminThemes(req.query) }); } catch (error) { next(error); } });
router.get("/themes/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); res.json({ success: true, data: await getAdminTheme(id) }); } catch (error) { next(error); } });
router.post("/themes", async (req, res, next) => { try { const input = parseOrThrow(themeInputSchema, req.body); const theme = await createTheme(req.currentUser!._id, input); await audit(req, "theme.create", "theme", String(theme._id), undefined, theme.toObject()); res.status(201).json({ success: true, data: await getAdminTheme(String(theme._id)), message: "Theme created as draft" }); } catch (error) { next(error); } });
router.put("/themes/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); const before = await getAdminTheme(id); const theme = await updateTheme(id, req.currentUser!._id, parseOrThrow(themeInputSchema, req.body)); await audit(req, "theme.update", "theme", id, before, theme.toObject()); res.json({ success: true, data: await getAdminTheme(id), message: "Theme updated" }); } catch (error) { next(error); } });
router.post("/themes/:id/publish", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); const published = req.body.published !== false; const theme = await publishTheme(id, published); await audit(req, published ? "theme.publish" : "theme.unpublish", "theme", id, undefined, { status: theme.status }); res.json({ success: true, data: await getAdminTheme(id), message: published ? "Theme published" : "Theme returned to draft" }); } catch (error) { next(error); } });
router.delete("/themes/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); const result = await archiveOrDeleteTheme(id); await audit(req, result.archived ? "theme.archive" : "theme.delete", "theme", id); res.json({ success: true, data: result, message: result.archived ? "Theme archived because it has sales" : "Theme deleted" }); } catch (error) { next(error); } });

router.post("/uploads/initiate", rateLimit("upload-init", 30, 60_000, true), async (req, res, next) => { try { res.status(201).json({ success: true, data: await initiateUpload(req.currentUser!._id, parseOrThrow(uploadInitSchema, req.body)) }); } catch (error) { next(error); } });
router.put("/uploads/:id/parts/:partNumber", rateLimit("upload-parts", 300, 60_000, true), raw({ type: "application/octet-stream", limit: "8mb" }), async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); const { partNumber } = parseOrThrow(uploadPartSchema, { partNumber: Number(req.params.partNumber) }); if (!Buffer.isBuffer(req.body)) throw new AppError(400, "INVALID_UPLOAD_PART", "The file part could not be read"); const ETag = await uploadPart(id, req.currentUser!._id, partNumber, req.body); res.json({ success: true, data: { ETag } }); } catch (error) { next(error); } });
router.post("/uploads/:id/complete", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); const { parts } = parseOrThrow(uploadCompleteSchema, req.body); const asset = await completeUpload(id, req.currentUser!._id, parts); await audit(req, "asset.upload", "asset", id, undefined, asset); res.json({ success: true, data: asset, message: asset.status === "ready" ? "Upload ready" : "Upload is processing" }); } catch (error) { next(error); } });

router.get("/orders", async (req, res, next) => { try { res.json({ success: true, data: await listAdminOrders(req.query) }); } catch (error) { next(error); } });
router.get("/orders/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); res.json({ success: true, data: await getAdminOrder(id) }); } catch (error) { next(error); } });
router.get("/orders/:id/invoice", rateLimit("admin-invoice", 30, 60_000, true), async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idSchema, req.params);
    const invoice = await paidOrderInvoiceForAdmin(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(invoice.pdf);
  } catch (error) { next(error); }
});

router.get("/payment-settings", async (_req, res, next) => {
  try { res.json({ success: true, data: await paymentSettings(true) }); } catch (error) { next(error); }
});
router.put("/payment-settings", async (req, res, next) => {
  try {
    const { enabledProviders } = parseOrThrow(paymentSettingsSchema, req.body);
    const before = await paymentSettings(true);
    const updated = await updatePaymentSettings(enabledProviders);
    await audit(req, "payment_settings.update", "payment_settings", "default", before, updated);
    res.json({ success: true, data: updated, message: "Payment methods updated" });
  } catch (error) { next(error); }
});
router.get("/discounts", async (_req, res, next) => {
  try { res.json({ success: true, data: await listDiscounts() }); } catch (error) { next(error); }
});
router.post("/discounts", async (req, res, next) => {
  try {
    const input = parseOrThrow(discountInputSchema, req.body);
    const discount = await createDiscount(input, req.currentUser!._id);
    await audit(req, "discount.create", "discount", discount.id, undefined, discount);
    res.status(201).json({ success: true, data: discount, message: "Discount code created" });
  } catch (error) { next(error); }
});
router.patch("/discounts/:id", async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idSchema, req.params);
    const input = parseOrThrow(discountStatusSchema, req.body);
    const discount = await updateDiscount(id, input);
    await audit(req, input.active ? "discount.activate" : "discount.deactivate", "discount", id, undefined, discount);
    res.json({ success: true, data: discount, message: input.active ? "Discount activated" : "Discount paused" });
  } catch (error) { next(error); }
});

// PRD-compatible aliases; the existing PUT routes remain for backward compatibility.
router.get("/analytics", async (req, res, next) => { try { const allowed = ["day", "week", "month", "six_months", "year"] as const; const period = allowed.includes(req.query.period as typeof allowed[number]) ? req.query.period as typeof allowed[number] : "day"; res.json({ success: true, data: await marketplaceInsights(period, req.query.from ? String(req.query.from) : undefined, req.query.to ? String(req.query.to) : undefined) }); } catch (error) { next(error); } });
router.get("/analytics/themes", async (req, res, next) => { try { res.json({ success: true, data: await themeSales(req.query.from ? String(req.query.from) : undefined, req.query.to ? String(req.query.to) : undefined) }); } catch (error) { next(error); } });
router.patch("/themes/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); const before = await getAdminTheme(id); const theme = await updateTheme(id, req.currentUser!._id, parseOrThrow(themePatchSchema, req.body)); await audit(req, "theme.update", "theme", id, before, theme.toObject()); res.json({ success: true, data: await getAdminTheme(id), message: "Theme updated" }); } catch (error) { next(error); } });
router.post("/uploads", rateLimit("upload-init", 30, 60_000, true), async (req, res, next) => { try { res.status(201).json({ success: true, data: await initiateUpload(req.currentUser!._id, parseOrThrow(uploadInitSchema, req.body)) }); } catch (error) { next(error); } });
router.delete("/uploads/:id", async (req, res, next) => { try { const { id } = parseOrThrow(idSchema, req.params); await cancelUpload(id, req.currentUser!._id); await audit(req, "asset.cancel", "asset", id); res.json({ success: true, data: null, message: "Upload canceled" }); } catch (error) { next(error); } });

export default router;
