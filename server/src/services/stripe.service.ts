import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import env from "../config/env.ts";

export interface MarketplaceLineItem {
  name: string;
  description?: string;
  unitAmountMinor: number;
  quantity?: number;
}

interface MarketplaceCheckoutInput {
  items: MarketplaceLineItem[];
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface StripeAmountSnapshot {
  amount_subtotal?: number | null;
  amount_total?: number | null;
  currency?: string | null;
  total_details?: { amount_discount?: number | null; amount_shipping?: number | null; amount_tax?: number | null } | null;
}

export function validateStripeCheckoutAmounts(session: StripeAmountSnapshot, expectedSubtotalMinor: number, expectedCurrency: string) {
  const currency = session.currency?.toUpperCase();
  const subtotal = session.amount_subtotal;
  const total = session.amount_total;
  const stripeDiscount = session.total_details?.amount_discount ?? 0;
  const shipping = session.total_details?.amount_shipping ?? 0;
  const tax = session.total_details?.amount_tax ?? (typeof total === "number" && typeof subtotal === "number" ? total - subtotal + stripeDiscount : null);
  if (currency !== expectedCurrency.toUpperCase()) throw new Error("Stripe checkout currency does not match the order snapshot");
  if (subtotal !== expectedSubtotalMinor) throw new Error("Stripe checkout subtotal does not match the order snapshot");
  if (!Number.isInteger(stripeDiscount) || stripeDiscount < 0 || stripeDiscount > subtotal) throw new Error("Stripe checkout contains an invalid provider discount");
  if (shipping !== 0) throw new Error("Stripe checkout contains an unexpected shipping charge");
  if (typeof total !== "number" || typeof tax !== "number" || tax < 0 || total !== subtotal - stripeDiscount + tax) throw new Error("Stripe checkout total does not match its subtotal, discount, and tax");
  return { subtotalMinor: subtotal, discountMinor: stripeDiscount, taxMinor: tax, totalMinor: total, currency };
}

export async function calculateMarketplaceTaxEstimate(input: { items: Array<{ reference: string; amountMinor: number }>; currency: string; customerIp?: string }) {
  const taxableItems = input.items.filter((item) => Number.isInteger(item.amountMinor) && item.amountMinor > 0);
  const taxableMinor = taxableItems.reduce((sum, item) => sum + item.amountMinor, 0);
  const rawIp = input.customerIp?.split(",")[0]?.trim().replace(/^::ffff:/, "");
  const usableIp = rawIp && !["::1", "127.0.0.1", "localhost"].includes(rawIp) ? rawIp : undefined;

  if (!taxableMinor) return { taxMinor: 0, taxPercentage: 0, taxStatus: "estimated" as const };
  if (!env.STRIPE_SECRET_KEY || !usableIp) return { taxMinor: 0, taxStatus: "calculated_at_checkout" as const };

  try {
    const calculation = await stripeClient().tax.calculations.create({
      currency: input.currency.toLowerCase(),
      customer_details: { ip_address: usableIp },
      line_items: taxableItems.map((item) => ({
        amount: item.amountMinor,
        reference: item.reference,
        tax_behavior: "exclusive",
        tax_code: "txcd_10202003",
      })),
    });
    const taxMinor = calculation.tax_amount_exclusive;
    const taxPercentage = Number(((taxMinor / taxableMinor) * 100).toFixed(2));
    return { taxMinor, taxPercentage, taxStatus: "estimated" as const };
  } catch {
    return { taxMinor: 0, taxStatus: "calculated_at_checkout" as const };
  }
}

function stripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY");
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export async function verifyStripeCredentials(): Promise<void> {
  const stripe = stripeClient();
  const [, endpoints] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.webhookEndpoints.list({ limit: 100 }),
  ]);
  const expectedUrl = `${env.PUBLIC_API_URL}/api/v1/webhooks/stripe`;
  const endpoint = endpoints.data.find((candidate) => candidate.url.replace(/\/$/, "") === expectedUrl && candidate.status === "enabled");
  if (!endpoint) throw new Error(`Stripe has no enabled webhook endpoint at ${expectedUrl}`);
  const enabledEvents = new Set(endpoint.enabled_events);
  const acceptsAllEvents = enabledEvents.has("*");
  for (const event of [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "charge.refunded",
    "refund.created",
    "refund.updated",
  ] as const) {
    if (!acceptsAllEvents && !enabledEvents.has(event)) throw new Error(`Stripe webhook is missing event ${event}`);
  }
}

function successUrlWithSessionId(value: string): string {
  if (value.includes("{CHECKOUT_SESSION_ID}")) return value;
  return `${value}${value.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
}

export async function createMarketplaceStripeCheckout(input: MarketplaceCheckoutInput) {
  if (!input.items.length) throw new Error("Checkout requires at least one item");
  if (input.items.some((item) => !Number.isInteger(item.unitAmountMinor) || item.unitAmountMinor < 0)) throw new Error("Stripe checkout contains an invalid item price");

  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    customer_email: input.customerEmail,
    allow_promotion_codes: false,
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    line_items: input.items.map((item) => ({
      price_data: {
        currency: input.currency.toLowerCase(), unit_amount: item.unitAmountMinor,
        product_data: { name: item.name, tax_code: "txcd_10202003", ...(item.description ? { description: item.description } : {}) },
      },
      quantity: item.quantity ?? 1,
    })),
    success_url: successUrlWithSessionId(input.successUrl),
    cancel_url: input.cancelUrl,
    client_reference_id: input.metadata.orderId,
    metadata: input.metadata,
    payment_intent_data: { metadata: input.metadata },
  }, { idempotencyKey: input.idempotencyKey });

  return { id: session.id, url: session.url, paymentStatus: session.payment_status, amountSubtotal: session.amount_subtotal, amountTotal: session.amount_total, currency: session.currency, totalDetails: session.total_details };
}

export function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, toleranceSeconds = 300): boolean {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("Stripe webhook secret is not configured");
  const parts = signatureHeader.split(",").map((part) => part.trim().split("=", 2) as [string, string]);
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  return signatures.some((signature) => {
    const receivedBuffer = Buffer.from(signature);
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  });
}
