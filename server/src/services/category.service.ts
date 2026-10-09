import CategoryModel from "../models/category.ts";
import ThemeModel from "../models/theme.ts";
import UploadAssetModel from "../models/upload-asset.ts";
import { serializeAsset } from "./upload.service.ts";
import { AppError } from "../utils/app-error.ts";

export async function listCategories() {
  const categories = await CategoryModel.find().sort({ sortOrder: 1, name: 1 }).lean();
  return Promise.all(categories.map(async (category) => {
    const asset = category.imageAssetId ? await UploadAssetModel.findOne({ _id: category.imageAssetId, kind: "image", status: "ready" }).select("+bucket +key +variants.key").lean() : null;
    return { id: String(category._id), name: category.name, slug: category.slug, description: category.description, imageUrl: category.imageUrl, imageAssetId: category.imageAssetId ? String(category.imageAssetId) : undefined, image: asset ? await serializeAsset(asset) : undefined, sortOrder: category.sortOrder };
  }));
}

export async function saveCategory(input: Record<string, unknown>, userId: unknown, id?: string) {
  if (await ThemeModel.exists({ slug: input.slug })) throw new AppError(409, "SLUG_IN_USE", "This URL is already used by a theme");
  const existing = id ? await CategoryModel.findById(id).lean() : null;
  if (id && !existing) throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
  if (input.imageAssetId && String(existing?.imageAssetId) !== input.imageAssetId && !await UploadAssetModel.exists({ _id: input.imageAssetId, uploadedBy: userId, kind: "image", status: "ready" })) throw new AppError(422, "INVALID_CATEGORY_IMAGE", "Select a ready image uploaded by you");
  const category = id ? await CategoryModel.findByIdAndUpdate(id, { ...input, imageAssetId: input.imageAssetId ?? null, imageUrl: input.imageUrl ?? "" }, { returnDocument: "after", runValidators: true }) : await CategoryModel.create(input);
  if (!category) throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
  return category;
}

export async function deleteCategory(id: string) {
  if (await ThemeModel.exists({ categoryId: id })) throw new AppError(409, "CATEGORY_IN_USE", "Reassign this category’s themes before deleting it");
  const category = await CategoryModel.findByIdAndDelete(id);
  if (!category) throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
}
