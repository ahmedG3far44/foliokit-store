import { randomBytes } from "node:crypto";
import env from "../config/env.ts";
import CartModel from "../models/cart.ts";
import OrderModel, { type OrderItemDocument } from "../models/order.ts";
import ThemeModel from "../models/theme.ts";
import TransactionModel from "../models/transaction.ts";
import UploadAssetModel from "../models/upload-asset.ts";

import { AppError } from "../utils/app-error.ts";
import { getCart } from "./cart.service.ts";
import { failOrderPayment, fulfillPaidOrder } from "./fulfillment.service.ts";
import { sendInvoiceEmail } from "./payment-notification.service.ts";
import { captureMarketplacePaypalCheckout, createMarketplacePaypalCheckout } from "./paypal.service.ts";
import { createMarketplaceStripeCheckout, validateStripeCheckoutAmounts } from "./stripe.service.ts";
import { allocateDiscount, assertPaymentProviderEnabled, claimDiscount, type PaymentProvider, normalizeDiscountCode, releaseDiscountClaim } from "./discount.service.ts";

type CheckoutUser = { _id: unknown; email: string; name: string; phone?: string; role?: string };
type CheckoutRegion = { country?: string; region?: string; city?: string; timezone?: string };
function orderNumber(): string {
  return `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createCheckout(user: CheckoutUser, idempotencyKey: string, region?: CheckoutRegion, provider: PaymentProvider = "stripe", discountCode?: string) {
  if (user.role === "admin") throw new AppError(403, "ADMIN_PURCHASE_FORBIDDEN", "Administrator accounts cannot purchase themes");
  await assertPaymentProviderEnabled(provider);

  let order = await OrderModel.findOne({ checkoutKey: idempotencyKey, userId: user._id }).select("+checkoutUrl");
  if (order && order.paymentProvider !== provider) throw new AppError(409, "CHECKOUT_PROVIDER_MISMATCH", "This checkout attempt was created for another payment provider");
  if (order) await assertPaymentProviderEnabled(provider, order.currency);
  const requestedCode = discountCode ? normalizeDiscountCode(discountCode) : undefined;
  if (order && order.discountSnapshot?.code !== requestedCode) throw new AppError(409, "CHECKOUT_DISCOUNT_MISMATCH", "This checkout attempt was created with a different discount code");
  if (order?.checkoutUrl) return { orderId: String(order._id), checkoutUrl: order.checkoutUrl };

  if (!order) {
    const cartView = await getCart(user._id);
    if (!cartView.items.length) throw new AppError(409, "CART_EMPTY", "Add a theme to your cart before checkout");

    const cart = await CartModel.findOne({ userId: user._id });
    const themeIds = (cart?.items ?? []).map((item: { themeId: unknown }) => item.themeId);
    const themes = await ThemeModel.find({ _id: { $in: themeIds }, status: "published" });
    if (themes.length !== themeIds.length) throw new AppError(409, "CART_CHANGED", "One or more themes are no longer available. Review your cart and try again");
    if (new Set(themes.map((theme) => theme.currency)).size !== 1) throw new AppError(409, "MIXED_CURRENCY_CART", "Cart items must use one currency");

    const sourceIds = themes.map((theme) => theme.sourceAssetId).filter(Boolean);
    const readySources = await UploadAssetModel.find({ _id: { $in: sourceIds }, kind: "theme_zip", status: "ready" }).select("_id").lean();
    if (readySources.length !== themes.length) throw new AppError(409, "SOURCE_NOT_READY", "One or more theme downloads are not ready");

    const subtotalMinor = themes.reduce((sum, theme) => sum + theme.priceMinor, 0);
    const currency = themes[0]?.currency ?? "USD";
    await assertPaymentProviderEnabled(provider, currency);
    let claimedDiscountId: unknown;
    try {
      const claimed = requestedCode ? await claimDiscount(requestedCode, currency, subtotalMinor) : undefined;
      claimedDiscountId = claimed?.discount._id;
      const discountMinor = claimed?.discountMinor ?? 0;
      const allocations = allocateDiscount(themes, discountMinor);
      order = await OrderModel.create({
        orderNumber: orderNumber(), userId: user._id, checkoutKey: idempotencyKey, paymentProvider: provider, status: "pending",
        currency, subtotalMinor, discountMinor, taxMinor: 0, totalMinor: subtotalMinor - discountMinor,
        ...(claimed ? { discountSnapshot: {
          discountId: claimed.discount._id,
          code: claimed.discount.code,
          type: claimed.discount.type,
          percentageBps: claimed.discount.percentageBps,
          amountMinor: claimed.discount.amountMinor,
          currency: claimed.discount.currency,
        } } : {}),
        customerSnapshot: { name: user.name, email: user.email, ...(user.phone ? { phone: user.phone } : {}) },
        regionSnapshot: region,
        items: themes.map((theme, index) => ({
          themeId: theme._id, name: theme.name, slug: theme.slug, version: theme.version, priceMinor: theme.priceMinor,
          discountMinor: allocations[index], totalMinor: theme.priceMinor - allocations[index], sourceAssetId: theme.sourceAssetId,
        })),
      });
    } catch (error) {
      if (claimedDiscountId) await releaseDiscountClaim(claimedDiscountId);
      throw error;
    }
  }

  const transaction = await TransactionModel.findOneAndUpdate(
    { orderId: order._id, provider },
    {
      $set: { status: "pending", amount: order.totalMinor / 100, amountMinor: order.totalMinor, currency: order.currency },
      $setOnInsert: { userId: user._id, orderId: order._id, provider, product: { name: `${order.items.length} theme${order.items.length === 1 ? "" : "s"}`, description: order.orderNumber } },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  order.status = "pending";
  try {
    if (provider === "paypal") {
      const paypal = await createMarketplacePaypalCheckout({
        items: order.items.map((item: OrderItemDocument) => ({ name: item.name, description: `Theme license · version ${item.version}`, unitAmountMinor: item.totalMinor })),
        currency: order.currency,
        customerEmail: user.email,
        returnUrl: `${env.CLIENT_URL}/purchase?payment=paypal&order_id=${String(order._id)}`,
        cancelUrl: `${env.CLIENT_URL}/checkout/cancel`,
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        idempotencyKey,
      });
      order.paypalToken = paypal.token;
      order.checkoutUrl = paypal.url;
      order.paymentAmountMinor = paypal.totalMinor;
      order.paymentCurrency = order.currency;
      transaction.externalId = paypal.token;
      transaction.amountMinor = paypal.totalMinor;
      transaction.amount = paypal.totalMinor / 100;
      await Promise.all([order.save(), transaction.save()]);
      return { orderId: String(order._id), checkoutUrl: paypal.url };
    }



    const session = await createMarketplaceStripeCheckout({
      items: order.items.map((item: OrderItemDocument) => ({ name: item.name, description: `Theme license · version ${item.version}`, unitAmountMinor: item.totalMinor })),
      currency: order.currency,
      customerEmail: user.email,
      successUrl: `${env.CLIENT_URL}/purchase?payment=processing&order_id=${String(order._id)}`,
      cancelUrl: `${env.CLIENT_URL}/checkout/cancel`,
      metadata: { orderId: String(order._id), orderNumber: order.orderNumber, transactionId: String(transaction._id), userId: String(user._id) },
      idempotencyKey,
    });
    
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    const amounts = validateStripeCheckoutAmounts({ amount_subtotal: session.amountSubtotal, amount_total: session.amountTotal, currency: session.currency, total_details: session.totalDetails }, order.subtotalMinor - order.discountMinor, order.currency);
    order.taxMinor = amounts.taxMinor;
    order.stripeSubtotalMinor = amounts.subtotalMinor;
    order.totalMinor = amounts.totalMinor;
    order.paymentAmountMinor = amounts.totalMinor;
    order.paymentCurrency = amounts.currency;
    order.stripeCheckoutSessionId = session.id;
    order.checkoutUrl = session.url;
    transaction.externalId = session.id;
    transaction.amountMinor = amounts.totalMinor;
    transaction.amount = amounts.totalMinor / 100;
    await Promise.all([order.save(), transaction.save()]);
    return { orderId: String(order._id), checkoutUrl: session.url };
  } catch (error) {
    await Promise.all([
      OrderModel.updateOne({ _id: order._id }, { $set: { status: "failed" } }),
      TransactionModel.updateOne({ _id: transaction._id }, { $set: { status: "declined" } }),
    ]);
    throw error;
  }
}

export async function capturePaypalCheckout(user: CheckoutUser, token: string) {
  const order = await OrderModel.findOne({ userId: user._id, paymentProvider: "paypal", paypalToken: token });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "No PayPal order matches this checkout");
  if (order.status === "paid") {
    await fulfillPaidOrder(order, order.paypalTransactionId ?? token);
    return { orderId: String(order._id), status: order.status };
  }
  if (order.status === "refunded") throw new AppError(409, "ORDER_REFUNDED", "This order has already been refunded");

  try {
    const payment = await captureMarketplacePaypalCheckout({
      token,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      amountMinor: order.paymentAmountMinor ?? order.totalMinor,
      currency: order.paymentCurrency ?? order.currency,
      idempotencyKey: order.checkoutKey,
    });
    if (payment.transactionId) {
      order.paypalTransactionId = payment.transactionId;
      await order.save();
    }
    if (["COMPLETED", "PROCESSED"].includes(payment.paymentStatus ?? "")) {
      await fulfillPaidOrder(order, payment.transactionId ?? token);
      await sendInvoiceEmail(order._id);
      return { orderId: String(order._id), status: "paid" as const };
    }
    if (["DENIED", "DECLINED", "FAILED", "EXPIRED", "VOIDED"].includes(payment.paymentStatus ?? "")) {
      await failOrderPayment(order, payment.transactionId ?? token);
      return { orderId: String(order._id), status: "failed" as const };
    }
    return { orderId: String(order._id), status: "pending" as const };
  } catch (error) {
    console.error("PayPal capture failed", error);
    throw new AppError(502, "PAYPAL_CAPTURE_FAILED", "PayPal could not complete this payment. Please try again");
  }
}
