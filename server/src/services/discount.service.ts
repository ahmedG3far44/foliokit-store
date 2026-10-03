import env from "../config/env.ts";
import DiscountModel, { type DiscountDocument } from "../models/discount.ts";
import PaymentSettingsModel from "../models/payment-settings.ts";

import { AppError } from "../utils/app-error.ts";


export type PaymentProvider = "stripe" | "paypal";
export type DiscountInput = {
  code: string;
  type: "percentage" | "fixed";
  percentageBps?: number;
  amountMinor?: number;
  currency?: string;
  usageLimit: number;
  expiresAt: Date;
  active: boolean;
};

const providerLabels: Record<PaymentProvider, string> = { stripe: "Stripe", paypal: "PayPal" };

export function normalizeDiscountCode(value: string): string {
  return value.trim().toUpperCase();
}

function providerConfigured(provider: PaymentProvider): boolean {
  if (provider === "stripe") return Boolean(env.STRIPE_SECRET_KEY);
  if (provider === "paypal") return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  return false;
}

function serializeDiscount(discount: DiscountDocument & { _id: unknown }) {
  return {
    id: String(discount._id),
    code: discount.code,
    type: discount.type,
    percentageBps: discount.percentageBps,
    amountMinor: discount.amountMinor,
    currency: discount.currency,
    usageLimit: discount.usageLimit,
    timesUsed: discount.timesUsed,
    expiresAt: discount.expiresAt,
    active: discount.active,
    createdAt: discount.createdAt,
    updatedAt: discount.updatedAt,
  };
}

export async function paymentSettings(includeConfiguration = false, _currency?: string) {
  const settings = await PaymentSettingsModel.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { enabledProviders: ["stripe", "paypal"] } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();
  const enabled = new Set(settings?.enabledProviders ?? []);
  const providers = (["stripe", "paypal"] as PaymentProvider[]).map((id) => {
    const configured = providerConfigured(id);
    return {
      id,
      label: providerLabels[id],
      enabled: enabled.has(id) && configured,
      ...(includeConfiguration ? { configured, selected: enabled.has(id) && configured } : {}),
    };
  });
  return { enabledPaymentProviders: providers.filter((provider) => provider.enabled).map((provider) => provider.id), providers };
}

export async function updatePaymentSettings(enabledProviders: PaymentProvider[]) {
  const unique = [...new Set(enabledProviders)];
  if (!unique.length) throw new AppError(422, "PAYMENT_PROVIDER_REQUIRED", "Enable at least one payment method");
  const unconfigured = unique.filter((provider) => !providerConfigured(provider));
  if (unconfigured.length) throw new AppError(409, "PAYMENT_PROVIDER_NOT_CONFIGURED", `${unconfigured.map((provider) => providerLabels[provider]).join(" and ")} must be configured before customers can use it`);
  await PaymentSettingsModel.findOneAndUpdate(
    { key: "default" },
    { $set: { enabledProviders: unique } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true },
  );
  return paymentSettings(true);
}

export async function assertPaymentProviderEnabled(provider: PaymentProvider, currency?: string): Promise<void> {
  const settings = await paymentSettings(false, currency);
  if (!settings.enabledPaymentProviders.includes(provider)) {
    throw new AppError(409, "PAYMENT_PROVIDER_UNAVAILABLE", `${providerLabels[provider]} is not currently available. Choose another payment method`);
  }
}

export async function listDiscounts() {
  const discounts = await DiscountModel.find().sort({ createdAt: -1 }).lean();
  return discounts.map((discount) => serializeDiscount(discount as DiscountDocument & { _id: unknown }));
}

export async function createDiscount(input: DiscountInput, createdBy: unknown) {
  const discount = await DiscountModel.create({ ...input, code: normalizeDiscountCode(input.code), createdBy });
  return serializeDiscount(discount as DiscountDocument & { _id: unknown });
}

export async function updateDiscount(id: string, input: Partial<DiscountInput>) {
  const update = { ...input, ...(input.code ? { code: normalizeDiscountCode(input.code) } : {}) };
  const discount = await DiscountModel.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after", runValidators: true });
  if (!discount) throw new AppError(404, "DISCOUNT_NOT_FOUND", "Discount code not found");
  return serializeDiscount(discount as DiscountDocument & { _id: unknown });
}

export function calculateDiscountMinor(discount: Pick<DiscountDocument, "type" | "percentageBps" | "amountMinor">, subtotalMinor: number): number {
  if (!Number.isInteger(subtotalMinor) || subtotalMinor <= 0) throw new AppError(409, "CART_EMPTY", "Add an item before applying a discount");
  const amount = discount.type === "percentage"
    ? Math.floor(subtotalMinor * (discount.percentageBps ?? 0) / 10_000)
    : discount.amountMinor ?? 0;
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError(422, "DISCOUNT_INVALID", "This discount does not reduce the current order");
  if (amount >= subtotalMinor) throw new AppError(422, "DISCOUNT_EXCEEDS_TOTAL", "This discount cannot be applied because it covers the entire order total");
  return amount;
}

async function validDiscount(code: string, currency: string, subtotalMinor: number) {
  const discount = await DiscountModel.findOne({ code: normalizeDiscountCode(code) });
  if (!discount) throw new AppError(404, "DISCOUNT_NOT_FOUND", "That discount code was not found");
  if (!discount.active) throw new AppError(409, "DISCOUNT_INACTIVE", "That discount code is not active");
  if (discount.expiresAt.getTime() <= Date.now()) throw new AppError(409, "DISCOUNT_EXPIRED", "That discount code has expired");
  if (discount.timesUsed >= discount.usageLimit) throw new AppError(409, "DISCOUNT_LIMIT_REACHED", "That discount code has reached its usage limit");
  if (discount.type === "fixed" && discount.currency !== currency.toUpperCase()) throw new AppError(409, "DISCOUNT_CURRENCY_MISMATCH", `That code is only valid for ${discount.currency} orders`);
  const discountMinor = calculateDiscountMinor(discount, subtotalMinor);
  return { discount, discountMinor };
}

export async function quoteDiscount(code: string, currency: string, subtotalMinor: number) {
  const { discount, discountMinor } = await validDiscount(code, currency, subtotalMinor);
  return {
    code: discount.code,
    type: discount.type,
    percentageBps: discount.percentageBps,
    amountMinor: discount.amountMinor,
    currency: discount.currency,
    discountMinor,
    expiresAt: discount.expiresAt,
  };
}

export async function claimDiscount(code: string, currency: string, subtotalMinor: number) {
  const { discount, discountMinor } = await validDiscount(code, currency, subtotalMinor);
  const claimed = await DiscountModel.findOneAndUpdate(
    { _id: discount._id, active: true, expiresAt: { $gt: new Date() }, timesUsed: { $lt: discount.usageLimit } },
    { $inc: { timesUsed: 1 } },
    { returnDocument: "after" },
  );
  if (!claimed) throw new AppError(409, "DISCOUNT_LIMIT_REACHED", "That discount code is no longer available");
  return { discount: claimed, discountMinor };
}

export async function releaseDiscountClaim(id: unknown): Promise<void> {
  await DiscountModel.updateOne({ _id: id, timesUsed: { $gt: 0 } }, { $inc: { timesUsed: -1 } });
}

export function allocateDiscount(items: Array<{ priceMinor: number }>, discountMinor: number): number[] {
  const subtotal = items.reduce((sum, item) => sum + item.priceMinor, 0);
  let allocated = 0;
  return items.map((item, index) => {
    const value = index === items.length - 1
      ? discountMinor - allocated
      : Math.floor(discountMinor * item.priceMinor / subtotal);
    const safeValue = Math.min(item.priceMinor, Math.max(0, value));
    allocated += safeValue;
    return safeValue;
  });
}
