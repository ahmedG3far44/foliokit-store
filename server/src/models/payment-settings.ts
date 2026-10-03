import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

export interface PaymentSettingsDocument {
  key: string;
  enabledProviders: Array<"stripe" | "paypal">;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PaymentSettingsDocument>({
  key: { type: String, required: true, unique: true, default: "default" },
  enabledProviders: {
    type: [{ type: String, enum: ["stripe", "paypal"] }],
    default: ["stripe", "paypal"],
    validate: [(value: string[]) => value.length > 0, "Enable at least one payment provider"],
  },
}, { timestamps: true });

const PaymentSettingsModel = models.PaymentSettings ?? model<PaymentSettingsDocument>("PaymentSettings", schema);
export default PaymentSettingsModel;
