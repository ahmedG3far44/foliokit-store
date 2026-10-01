import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

export interface RefreshSessionDocument {
  userId: mongoose.Types.ObjectId;
  jti: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedByJti?: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshSessionSchema = new Schema<RefreshSessionDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  jti: { type: String, required: true, unique: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  revokedAt: Date,
  replacedByJti: String,
  userAgent: { type: String, maxlength: 300 },
  ip: { type: String, maxlength: 100 },
}, { timestamps: true });

refreshSessionSchema.index({ userId: 1, revokedAt: 1 });

const RefreshSessionModel = models.RefreshSession ?? model<RefreshSessionDocument>("RefreshSession", refreshSessionSchema);
export default RefreshSessionModel;
