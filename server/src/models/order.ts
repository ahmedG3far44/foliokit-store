import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;
export interface OrderItemDocument {
  _id: Types.ObjectId;
  themeId: Types.ObjectId;
  name: string;
  slug: string;
  version: string;
  priceMinor: number;
  discountMinor: number;
  totalMinor: number;
  sourceAssetId: Types.ObjectId;
}
export interface OrderDocument {
  orderNumber: string;
  userId: Types.ObjectId;
  status: "pending" | "paid" | "failed" | "refunded";
  paymentProvider: "stripe" | "paypal";
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeSubtotalMinor?: number;
  paypalToken?: string;
  paypalTransactionId?: string;
  checkoutKey: string;
  checkoutUrl?: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentAmountMinor?: number;
  paymentCurrency?: string;
  paymentExchangeRate?: number;
  discountSnapshot?: {
    discountId?: Types.ObjectId;
    code: string;
    type?: "percentage" | "fixed";
    percentage?: number;
    percentageBps?: number;
    amountMinor?: number;
    currency?: string;
  };
  customerSnapshot?: { name: string; email: string; phone?: string };
  regionSnapshot?: { country?: string; region?: string; city?: string; timezone?: string };
  items: OrderItemDocument[];
  paidAt?: Date;
  refundedAt?: Date;
  refundAmountMinor?: number;
  invoiceEmailSentAt?: Date;
  refundEmailSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<OrderItemDocument>({
  themeId: { type: Schema.Types.ObjectId, ref: "Theme", required: true },
  name: { type: String, required: true }, slug: { type: String, required: true }, version: { type: String, required: true },
  priceMinor: { type: Number, required: true }, discountMinor: { type: Number, required: true }, totalMinor: { type: Number, required: true },
  sourceAssetId: { type: Schema.Types.ObjectId, ref: "UploadAsset", required: true },
});
const schema = new Schema<OrderDocument>({
  orderNumber: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
  paymentProvider: { type: String, enum: ["stripe", "paypal"], default: "stripe" },
  stripeCheckoutSessionId: { type: String, unique: true, sparse: true },
  stripePaymentIntentId: { type: String, unique: true, sparse: true },
  stripeSubtotalMinor: { type: Number, min: 0, validate: Number.isInteger },
  paypalToken: { type: String, unique: true, sparse: true },
  paypalTransactionId: { type: String, unique: true, sparse: true },
  checkoutKey: { type: String, required: true, unique: true },
  checkoutUrl: { type: String, select: false },
  currency: { type: String, required: true, uppercase: true },
  subtotalMinor: { type: Number, required: true }, discountMinor: { type: Number, required: true }, taxMinor: { type: Number, required: true, default: 0 }, totalMinor: { type: Number, required: true },
  paymentAmountMinor: { type: Number, min: 0, validate: Number.isInteger },
  paymentCurrency: { type: String, uppercase: true },
  paymentExchangeRate: { type: Number, min: 0.01, max: 1000 },
  discountSnapshot: {
    discountId: { type: Schema.Types.ObjectId, ref: "Discount" },
    code: String,
    type: { type: String, enum: ["percentage", "fixed"] },
    percentage: Number,
    percentageBps: Number,
    amountMinor: Number,
    currency: String,
  },
  customerSnapshot: { name: String, email: String, phone: String },
  regionSnapshot: { country: String, region: String, city: String, timezone: String },
  items: { type: [itemSchema], required: true },
  paidAt: { type: Date, index: true },
  refundedAt: Date,
  refundAmountMinor: { type: Number, min: 0, validate: Number.isInteger },
  invoiceEmailSentAt: Date,
  refundEmailSentAt: Date,
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, paidAt: -1 });
const OrderModel = models.Order ?? model<OrderDocument>("Order", schema);
export default OrderModel;
