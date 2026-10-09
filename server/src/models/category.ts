import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
const schema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: "", trim: true, maxlength: 2000 },
  imageUrl: String,
  imageAssetId: { type: Schema.Types.ObjectId, ref: "UploadAsset" },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });
export default models.Category ?? model("Category", schema);
