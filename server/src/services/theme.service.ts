import mongoose, { type QueryFilter } from "mongoose";
import CategoryModel from "../models/category.ts";
import EntitlementModel from "../models/entitlement.ts";
import OrderModel from "../models/order.ts";
import ThemeModel, { type ThemeDocument } from "../models/theme.ts";
import UploadAssetModel from "../models/upload-asset.ts";
import { AppError } from "../utils/app-error.ts";
import { serializeAsset } from "./upload.service.ts";
import { themeSearchFilter, themeSearchTerms } from "../utils/theme-search.ts";
import { themeAssetIssues, type ThemeAssetSelection } from "../utils/theme-assets.ts";

type CatalogQuery = { page: number; limit: number; category?: string; search?: string; stack?: string; minPrice?: number; maxPrice?: number; featured?: "true" | "false"; sort: "newest" | "price_asc" | "price_desc" | "popular" };

async function searchThemes(search: string): Promise<QueryFilter<ThemeDocument>> {
  const terms = themeSearchTerms(search);
  if (!terms.length) return {};
  const categories = await CategoryModel.find({ $or: terms.flatMap((term) => [
    { name: term }, { slug: term }, { description: term },
  ]) }).select("_id name slug description").lean();
  return themeSearchFilter(terms, categories);
}

async function mediaFor(theme: Pick<ThemeDocument, "imageAssetIds" | "videoAssetIds" | "previewAssetId">) {
  const ids = [...theme.imageAssetIds, ...theme.videoAssetIds, ...(theme.previewAssetId ? [theme.previewAssetId] : [])];
  const assets = await UploadAssetModel.find({ _id: { $in: ids }, status: "ready" }).select("+bucket +key +variants.key").lean();
  const serialized = await Promise.all(assets.map(async (asset) => [String(asset._id), await serializeAsset(asset)] as const));
  const byId = new Map(serialized);
  return {
    previewAsset: theme.previewAssetId ? byId.get(String(theme.previewAssetId)) : undefined,
    assetIssues: themeAssetIssues({ previewAssetId: theme.previewAssetId?.toString(), imageAssetIds: theme.imageAssetIds.map(String), videoAssetIds: theme.videoAssetIds.map(String) }, new Map(assets.map((asset) => [String(asset._id), asset]))).filter((issue) => issue.path[0] !== "sourceAssetId"),
    images: theme.imageAssetIds.map((id) => byId.get(String(id))).filter(Boolean),
    videos: theme.videoAssetIds.map((id) => byId.get(String(id))).filter(Boolean),
  };
}

async function serializeTheme(theme: ThemeDocument & { _id: unknown }, userId?: string) {
  const [media, entitlement, source] = await Promise.all([
    mediaFor(theme),
    userId ? EntitlementModel.exists({ userId, themeId: theme._id, status: "active" }) : null,
    theme.sourceAssetId ? UploadAssetModel.findById(theme.sourceAssetId).lean() : null,
  ]);
  const missingPublishRequirements = [
    ...media.assetIssues.map((issue) => issue.message),
    ...(source?.kind !== "theme_zip" || source.status !== "ready" ? ["source ZIP"] : []),
    ...(!theme.previewUrl ? ["public preview URL"] : []),
    ...(!theme.description ? ["description"] : []),
    ...(!theme.features.length ? ["feature list"] : []),
  ];
  return {
    categoryId: theme.categoryId ? String(theme.categoryId) : undefined, id: String(theme._id), name: theme.name, slug: theme.slug, shortDescription: theme.shortDescription,
    description: theme.description, stack: theme.stack, features: theme.features, priceMinor: theme.priceMinor,
    currency: theme.currency, version: theme.version, changelog: theme.changelog, setupInstructions: theme.setupInstructions,
    deployInstructions: theme.deployInstructions, instructionsFormat: theme.instructionsFormat ?? "plain", previewUrl: theme.previewUrl, previewAsset: media.previewAsset, images: media.images, videos: media.videos,
    sourceAsset: source ? { id: String(source._id), kind: source.kind, status: source.status, originalName: source.originalName, sizeBytes: source.sizeBytes } : undefined,
    status: theme.status, featured: theme.featured, salesCount: theme.salesCount, purchased: Boolean(entitlement),
    canPurchase: source?.kind === "theme_zip" && source.status === "ready",
    canPublish: missingPublishRequirements.length === 0, missingPublishRequirements,
    publishedAt: theme.publishedAt, seoTitle: theme.seoTitle, seoDescription: theme.seoDescription, createdAt: theme.createdAt, updatedAt: theme.updatedAt,
  };
}

export async function listPublishedThemes(query: CatalogQuery, userId?: string) {
  const filter: QueryFilter<ThemeDocument> = { status: "published" };
  if (query.category) {
    const category = await CategoryModel.findOne({ slug: query.category }).lean();
    if (!category) throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    filter.categoryId = category._id;
  }
  if (query.search) Object.assign(filter, await searchThemes(query.search));
  if (query.stack) filter.stack = { $in: [new RegExp(`^${query.stack.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")] };
  if (query.featured) filter.featured = query.featured === "true";
  if (query.minPrice !== undefined || query.maxPrice !== undefined) filter.priceMinor = { ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}) };
  const sort: Record<string, 1 | -1> = query.sort === "price_asc" ? { priceMinor: 1 } : query.sort === "price_desc" ? { priceMinor: -1 } : query.sort === "popular" ? { salesCount: -1 } : { publishedAt: -1 };
  const [items, total, stackRows] = await Promise.all([
    ThemeModel.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    ThemeModel.countDocuments(filter),
    ThemeModel.aggregate<{ _id: string }>([{ $match: { status: "published" } }, { $unwind: "$stack" }, { $group: { _id: "$stack" } }, { $sort: { _id: 1 } }]),
  ]);
  return { items: await Promise.all(items.map((item) => serializeTheme(item as ThemeDocument & { _id: unknown }, userId))), page: query.page, pageSize: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)), stacks: stackRows.map((row) => row._id) };
}

export async function getPublishedTheme(slug: string, userId?: string) {
  const theme = await ThemeModel.findOne({ slug, status: "published" }).lean();
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  return serializeTheme(theme as ThemeDocument & { _id: unknown }, userId);
}

export async function listAdminThemes(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1), pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 12));
  const filter: QueryFilter<ThemeDocument> = {};
  if (query.status) filter.status = String(query.status) as ThemeDocument["status"];
  if (query.search) Object.assign(filter, await searchThemes(String(query.search)));
  const [items, total] = await Promise.all([ThemeModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(), ThemeModel.countDocuments(filter)]);
  return { items: await Promise.all(items.map((item) => serializeTheme(item as ThemeDocument & { _id: unknown }))), page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminTheme(id: string) {
  const theme = await ThemeModel.findById(id).lean();
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  return serializeTheme(theme as ThemeDocument & { _id: unknown });
}

async function validateThemeAssets(userId: unknown, input: Record<string, unknown>): Promise<void> {
  const selection = input as ThemeAssetSelection;
  const requested = [selection.previewAssetId, ...selection.imageAssetIds, ...selection.videoAssetIds, selection.sourceAssetId].filter(Boolean);
  const assets = await UploadAssetModel.find({ _id: { $in: requested }, uploadedBy: userId, status: "ready" }).select("_id kind contentType status").lean();
  const issues = themeAssetIssues(selection, new Map(assets.map((asset) => [String(asset._id), asset])));
  if (issues.length) throw new AppError(422, "THEME_ASSETS_INVALID", issues.map((issue) => issue.message).join(". "), issues);
}

async function validateThemeCategory(input: Record<string, unknown>) {
  if (input.categoryId && !await CategoryModel.exists({ _id: input.categoryId })) throw new AppError(422, "CATEGORY_NOT_FOUND", "Select an existing category");
  if (input.slug && await CategoryModel.exists({ slug: input.slug })) throw new AppError(409, "SLUG_IN_USE", "This URL is already used by a category");
}

export async function createTheme(userId: unknown, input: Record<string, unknown>) {
  await validateThemeCategory(input);
  await validateThemeAssets(userId, input);
  return ThemeModel.create({ ...input, createdBy: userId, status: "draft" });
}
export async function updateTheme(id: string, userId: unknown, input: Record<string, unknown>) {
  const existing = await ThemeModel.findById(id);
  if (!existing) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  await validateThemeCategory(input);
  await validateThemeAssets(userId, {
    previewAssetId: input.previewAssetId ?? existing.previewAssetId?.toString(),
    imageAssetIds: input.imageAssetIds ?? existing.imageAssetIds.map(String),
    videoAssetIds: input.videoAssetIds ?? existing.videoAssetIds.map(String),
    sourceAssetId: input.sourceAssetId ?? (existing.sourceAssetId ? String(existing.sourceAssetId) : undefined),
  });
  const theme = await ThemeModel.findByIdAndUpdate(id, input, { returnDocument: "after", runValidators: true });
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  return theme;
}

export async function publishTheme(id: string, publish: boolean) {
  const theme = await ThemeModel.findById(id);
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  if (publish) {
    const media = await mediaFor(theme);
    const source = theme.sourceAssetId ? await UploadAssetModel.exists({ _id: theme.sourceAssetId, kind: "theme_zip", status: "ready" }) : null;
    const missing = [...media.assetIssues.map((issue) => issue.message), ...(!source ? ["source ZIP"] : []), ...(!theme.previewUrl ? ["public preview URL"] : []), ...(!theme.description ? ["description"] : []), ...(!theme.features.length ? ["feature list"] : [])];
    if (missing.length) throw new AppError(409, "THEME_INCOMPLETE", `Complete the theme before publishing. Missing: ${missing.join(", ")}`, [], { missing });
    theme.status = "published"; theme.publishedAt = theme.publishedAt ?? new Date();
  } else theme.status = "draft";
  await theme.save();
  return theme;
}

export async function archiveOrDeleteTheme(id: string) {
  const theme = await ThemeModel.findById(id);
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  const hasSales = await OrderModel.exists({ status: "paid", "items.themeId": new mongoose.Types.ObjectId(id) });
  if (hasSales) { theme.status = "archived"; theme.featured = false; await theme.save(); return { archived: true }; }
  await theme.deleteOne(); return { archived: false };
}
