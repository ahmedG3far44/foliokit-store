import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;
export interface ThemeDocument {
  categoryId?: Types.ObjectId;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  stack: string[];
  features: string[];
  priceMinor: number;
  currency: string;
  version: string;
  changelog?: string;
  setupInstructions?: string;
  deployInstructions?: string;
  instructionsFormat?: "plain" | "html";
  previewUrl: string;
  previewAssetId?: Types.ObjectId;
  imageAssetIds: Types.ObjectId[];
  videoAssetIds: Types.ObjectId[];
  sourceAssetId?: Types.ObjectId;
  status: "draft" | "published" | "archived";
  featured: boolean;
  salesCount: number;
  publishedAt?: Date;
  createdBy: Types.ObjectId;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ThemeDocument>({
  categoryId: { type: Schema.Types.ObjectId, ref: "Category", index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  shortDescription: { type: String, required: true, trim: true, maxlength: 240 },
  description: { type: String, required: true, trim: true },
  stack: { type: [String], default: [] },
  features: { type: [String], default: [] },
  priceMinor: { type: Number, required: true, min: 0, validate: Number.isInteger },
  currency: { type: String, default: "USD", uppercase: true, minlength: 3, maxlength: 3 },
  version: { type: String, default: "1.0.0" },
  changelog: String,
  setupInstructions: String,
  deployInstructions: String,
  instructionsFormat: { type: String, enum: ["plain", "html"], default: "plain" },
  previewUrl: { type: String, required: true },
  previewAssetId: { type: Schema.Types.ObjectId, ref: "UploadAsset" },
  imageAssetIds: [{ type: Schema.Types.ObjectId, ref: "UploadAsset" }],
  videoAssetIds: [{ type: Schema.Types.ObjectId, ref: "UploadAsset" }],
  sourceAssetId: { type: Schema.Types.ObjectId, ref: "UploadAsset" },
  status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
  featured: { type: Boolean, default: false, index: true },
  salesCount: { type: Number, default: 0, min: 0 },
  publishedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  seoTitle: { type: String, maxlength: 70 },
  seoDescription: { type: String, maxlength: 170 },
}, { timestamps: true });

schema.index({ status: 1, publishedAt: -1 });
schema.index({ name: "text", description: "text", stack: "text" });
const ThemeModel = models.Theme ?? model<ThemeDocument>("Theme", schema);
export default ThemeModel;
