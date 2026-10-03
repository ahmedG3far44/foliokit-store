import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;

const webhookSchema = new Schema({
  _id: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, enum: ["processing", "processed", "failed"], default: "processing" },
  errorCode: String,
  processedAt: Date,
}, { timestamps: true });
export const StripeWebhookEventModel = models.StripeWebhookEvent ?? model("StripeWebhookEvent", webhookSchema);
export const PaypalWebhookEventModel = models.PaypalWebhookEvent ?? model("PaypalWebhookEvent", webhookSchema);

const auditSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  requestId: String,
}, { timestamps: true });
auditSchema.index({ createdAt: -1 });
export const AuditLogModel = models.AuditLog ?? model("AuditLog", auditSchema);

export interface DownloadEventDocument { entitlementId: Types.ObjectId; userId: Types.ObjectId; ipHash?: string; userAgent?: string; result: "issued" | "denied" }
const downloadSchema = new Schema<DownloadEventDocument>({
  entitlementId: { type: Schema.Types.ObjectId, ref: "Entitlement", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  ipHash: String,
  userAgent: String,
  result: { type: String, enum: ["issued", "denied"], required: true },
}, { timestamps: true });
downloadSchema.index({ userId: 1, createdAt: -1 });
export const DownloadEventModel = models.DownloadEvent ?? model<DownloadEventDocument>("DownloadEvent", downloadSchema);
