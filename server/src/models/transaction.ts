import mongoose from "mongoose";
import type { Types } from "mongoose";

const { Schema, model, models } = mongoose;

export interface TransactionDocument {
  userId: Types.ObjectId;
  orderId?: Types.ObjectId;
  planId?: Types.ObjectId;
  product?: { name: string; description?: string };
  provider: "stripe" | "paypal" | "manual";
  externalId?: string;
  amount: number;
  amountMinor?: number;
  currency: string;
  status: "pending" | "success" | "declined";
  paidAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<TransactionDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", index: true },
  planId: { type: Schema.Types.ObjectId, ref: "Plan" },
  product: { name: String, description: String },
  provider: { type: String, enum: ["stripe", "paypal", "manual"], required: true, index: true },
  externalId: { type: String, unique: true, sparse: true },
  amount: { type: Number, required: true, min: 0 },
  amountMinor: { type: Number, min: 0, validate: Number.isInteger },
  currency: { type: String, default: "USD", uppercase: true },
  status: { type: String, enum: ["pending", "success", "declined"], default: "pending", index: true },
  paidAt: Date,
  metadata: Schema.Types.Mixed,
}, { timestamps: true });

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ orderId: 1, provider: 1 }, { unique: true, partialFilterExpression: { orderId: { $type: "objectId" } } });
transactionSchema.set("toJSON", {
  transform: (_document, value) => {
    const result = value as unknown as Record<string, unknown>;
    result.id = String(result._id);
    delete result._id;
    delete result.__v;
    return value;
  },
});

const TransactionModel = models.Transaction ?? model<TransactionDocument>("Transaction", transactionSchema);
export default TransactionModel;
