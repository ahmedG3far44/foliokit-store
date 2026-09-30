import env from "../config/env.ts";
import UserModel from "../models/user.ts";

import { getResendClient } from "../config/resend.ts";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const emailTemplateTypes = ["welcome", "invoice", "refund", "promotion"] as const;
export type EmailTemplateType = typeof emailTemplateTypes[number];

export interface EmailTemplateVariables {
  name?: string;
  orderNumber?: string;
  amountMinor?: number;
  currency?: string;
  paymentAmountMinor?: number;
  paymentCurrency?: string;
  paymentExchangeRate?: number;
  items?: Array<{ name: string; priceMinor: number }>;
  orderUrl?: string;
  orderDate?: string;
  discount?: {
    code: string;
    type?: "percentage" | "fixed";
    percentageBps?: number;
    amountMinor?: number;
    appliedAmountMinor: number;
  };
  offerTitle?: string;
  offerDescription?: string;
  discountDetails?: string;
  actionUrl?: string;
  ctaLabel?: string;
  expiresAt?: string;
  unsubscribeUrl?: string;
}

interface SendTemplateInput {
  to: string;
  type: EmailTemplateType;
  variables?: EmailTemplateVariables;
  attachment?: { filename: string; content: Buffer };
  idempotencyKey?: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const senderByType: Record<EmailTemplateType, () => string> = {
  welcome: () => env.EMAIL_FROM_ACCOUNT,
  invoice: () => env.EMAIL_FROM_BILLING,
  refund: () => env.EMAIL_FROM_ACCOUNT,
  promotion: () => env.EMAIL_FROM_MARKETING,
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeEmailSubject(value: unknown, fallback = "A message from Foliokit"): string {
  const normalized = String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  return normalized || fallback;
}

function money(value = 0, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(value / 100);
}

function primaryClientUrl(): string {
  return env.CLIENT_URL.split(",")[0]?.trim().replace(/\/$/, "") || "http://localhost:5173";
}

function emailAddress(value: string): string {
  return value.match(/<([^>]+)>/)?.[1]?.trim() ?? value.trim();
}

function isValidMailbox(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress(value));
}

export function emailConfigurationIssues(): string[] {
  const issues: string[] = [];
  for (const [label, value] of [
    ["EMAIL_FROM_ACCOUNT", env.EMAIL_FROM_ACCOUNT],
    ["EMAIL_FROM_BILLING", env.EMAIL_FROM_BILLING],
    ["EMAIL_FROM_MARKETING", env.EMAIL_FROM_MARKETING],
    ["EMAIL_REPLY_TO", env.EMAIL_REPLY_TO],
  ] as const) {
    const address = emailAddress(value);
    if (!isValidMailbox(value)) issues.push(`${label} is not a valid email address`);
    if (env.NODE_ENV === "production" && /(^|@)(example\.com|resend\.dev)$/i.test(address)) issues.push(`${label} must use a verified production domain`);
  }
  if (!env.RESEND_API_KEY) issues.push("RESEND_API_KEY is missing");
  if (!env.EMAIL_UNSUBSCRIBE_SECRET) issues.push("EMAIL_UNSUBSCRIBE_SECRET is missing; promotion emails are disabled");
  if (!env.BUSINESS_ADDRESS.trim()) issues.push("BUSINESS_ADDRESS is missing; promotion emails are disabled");
  return issues;
}

function assertBaseEmailConfiguration(type: EmailTemplateType): void {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured");
  const sender = senderByType[type]();
  if (!isValidMailbox(sender) || !isValidMailbox(env.EMAIL_REPLY_TO)) throw new Error("Email sender configuration is invalid");
  if (env.NODE_ENV === "production" && /(^|@)(example\.com|resend\.dev)$/i.test(emailAddress(sender))) {
    throw new Error("Production email must use a verified sender domain");
  }
}

function assertMarketingConfiguration(): void {
  assertBaseEmailConfiguration("promotion");
  if (!env.EMAIL_UNSUBSCRIBE_SECRET) throw new Error("Promotion email unsubscribe secret is not configured");
  if (!env.BUSINESS_ADDRESS.trim()) throw new Error("Promotion email business address is not configured");
}

function transactionalHeaders(reference: string): Record<string, string> {
  return {
    "Auto-Submitted": "auto-generated",
    "X-Auto-Response-Suppress": "All",
    "X-Entity-Ref-ID": reference,
  };
}

function marketingHeaders(reference: string, unsubscribeUrl?: string): Record<string, string> {
  return {
    "X-Entity-Ref-ID": reference,
    ...(unsubscribeUrl ? {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    } : {}),
  };
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function emailShell(
  preheader: string,
  heading: string,
  body: string,
  action?: { label: string; url: string },
  options: { head?: string; marketing?: boolean; unsubscribeUrl?: string } = {},
): string {
  const actionHtml = action ? `<tr><td style="padding:8px 40px 34px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#5340c6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:8px">${escapeHtml(action.label)}</a></td></tr>` : "";
  const marketingFooter = `You received this offer because you have a Foliokit customer account.${env.BUSINESS_ADDRESS ? ` ${escapeHtml(env.BUSINESS_ADDRESS)}.` : ""}${options.unsubscribeUrl ? ` <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#6150c8">Unsubscribe from offers</a>.` : ""}`;
  const footer = options.marketing ? marketingFooter : "This transactional email was sent by Foliokit about your account or purchase. If you did not expect it, contact support.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title>${options.head ?? ""}</head><body style="margin:0;background:#f4f5f3;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f3;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e6e3;border-radius:14px;overflow:hidden"><tr><td style="background:#171a18;padding:22px 40px;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:.08em">FOLIOKIT</td></tr><tr><td style="padding:38px 40px 14px"><p style="margin:0 0 10px;color:#5340c6;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Portfolio Market</p><h1 style="margin:0;font-size:30px;line-height:1.18;letter-spacing:-.03em">${escapeHtml(heading)}</h1></td></tr><tr><td style="padding:8px 40px 28px;color:#5f6762;font-size:15px;line-height:1.7">${body}</td></tr>${actionHtml}<tr><td style="border-top:1px solid #ecefec;padding:20px 40px;color:#89918d;font-size:12px;line-height:1.5">${footer}</td></tr></table></td></tr></table></body></html>`;
}

export function renderEmailTemplate(type: EmailTemplateType, variables: EmailTemplateVariables = {}): RenderedEmail {
  const rawName = variables.name || "there";
  const name = escapeHtml(rawName);
  const rawOrderNumber = variables.orderNumber || "ORD-DEMO-001";
  const orderNumber = escapeHtml(rawOrderNumber);
  const currency = (variables.currency || "USD").toUpperCase();
  const amountMinor = variables.amountMinor ?? 4900;
  const total = escapeHtml(money(amountMinor, currency));

  if (type === "welcome") {
    const subject = normalizeEmailSubject(`Welcome to Foliokit, ${rawName}`, "Welcome to Foliokit");
    return {
      subject,
      html: emailShell(subject, `Welcome, ${rawName}`, `<p style="margin:0 0 16px">Hi ${name},</p><p style="margin:0">Your account is ready. Explore production-ready portfolio themes, save your favorites, and manage every purchase from your Foliokit library.</p>`, { label: "Explore themes", url: `${primaryClientUrl()}/themes` }),
      text: `Hi ${rawName},\n\nYour Foliokit account is ready. Explore portfolio themes at ${primaryClientUrl()}/themes.`,
    };
  }

  if (type === "invoice") {
    const subject = normalizeEmailSubject(`Payment receipt and invoice — ${rawOrderNumber}`, "Your Foliokit payment receipt");
    const orderUrl = variables.orderUrl || `${primaryClientUrl()}/purchases`;
    const items = variables.items?.length ? variables.items : [{ name: "Foliokit portfolio theme", priceMinor: amountMinor }];
    const discount = variables.discount && variables.discount.appliedAmountMinor > 0 ? variables.discount : undefined;
    const discountValue = discount?.type === "percentage" && discount.percentageBps
      ? `${(discount.percentageBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% off`
      : discount?.type === "fixed" && discount.amountMinor
        ? `${money(discount.amountMinor, currency)} off`
        : discount ? `${money(discount.appliedAmountMinor, currency)} off` : "";
    const discountLabel = discount ? `${escapeHtml(discount.code)} · ${escapeHtml(discountValue)}` : "";
    const discountHtml = discount
      ? `<tr><td style="padding:0 14px 14px;color:#17785a;font-size:12px">DISCOUNT <span style="font-weight:700">(${discountLabel})</span></td><td style="padding:0 14px 14px;text-align:right;color:#17785a;font-weight:700">−${escapeHtml(money(discount.appliedAmountMinor, currency))}</td></tr>`
      : "";
    const discountText = discount ? ` Discount ${discount.code} (${discountValue}): -${money(discount.appliedAmountMinor, currency)}.` : "";
    const paymentCurrency = variables.paymentCurrency?.toUpperCase();
    const convertedPayment = paymentCurrency && paymentCurrency !== currency && variables.paymentAmountMinor !== undefined
      ? money(variables.paymentAmountMinor, paymentCurrency)
      : undefined;
    const exchangeRate = convertedPayment && variables.paymentExchangeRate
      ? ` (1 ${currency} = ${variables.paymentExchangeRate.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${paymentCurrency})`
      : "";
    const convertedPaymentHtml = convertedPayment
      ? `<tr><td style="padding:0 14px 14px;color:#69716d;font-size:12px">CHARGED BY PAYMOB${escapeHtml(exchangeRate)}</td><td style="padding:0 14px 14px;text-align:right;font-weight:700">${escapeHtml(convertedPayment)}</td></tr>`
      : "";
    const convertedPaymentText = convertedPayment ? ` Paymob charged: ${convertedPayment}${exchangeRate}.` : "";
    const orderMarkup = {
      "@context": "https://schema.org",
      "@type": "Order",
      merchant: { "@type": "Organization", name: "Foliokit" },
      orderNumber: rawOrderNumber,
      orderDate: variables.orderDate || new Date().toISOString(),
      priceCurrency: currency,
      price: (amountMinor / 100).toFixed(2),
      acceptedOffer: items.map((item) => ({
        "@type": "Offer",
        priceCurrency: currency,
        price: (item.priceMinor / 100).toFixed(2),
        itemOffered: { "@type": "Product", name: item.name },
      })),
      url: orderUrl,
      orderStatus: "https://schema.org/OrderDelivered",
    };
    return {
      subject,
      html: emailShell(subject, "Payment confirmed", `<p style="margin:0 0 18px">Hi ${name},</p><p style="margin:0 0 22px">Your payment was successful. A PDF invoice with the full order breakdown is attached.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f5;border-radius:9px"><tr><td style="padding:14px;color:#69716d;font-size:12px">ORDER</td><td style="padding:14px;text-align:right;font-weight:700">${orderNumber}</td></tr>${discountHtml}<tr><td style="padding:0 14px 14px;color:#69716d;font-size:12px">ORDER TOTAL</td><td style="padding:0 14px 14px;text-align:right;font-weight:700">${total}</td></tr>${convertedPaymentHtml}</table>`, { label: "View purchases", url: orderUrl }, { head: `<script type="application/ld+json">${jsonLd(orderMarkup)}</script>` }),
      text: `Hi ${rawName},\n\nPayment confirmed for ${rawOrderNumber}.${discountText} Order total: ${money(amountMinor, currency)}.${convertedPaymentText} Your PDF invoice is attached.\n\nView purchases: ${orderUrl}`,
    };
  }

  if (type === "refund") {
    const subject = normalizeEmailSubject(`Refund confirmed — ${rawOrderNumber}`, "Your Foliokit refund is complete");
    return {
      subject,
      html: emailShell(subject, "Your refund is complete", `<p style="margin:0 0 18px">Hi ${name},</p><p style="margin:0 0 22px">Stripe confirmed your refund. Your order has been updated and access to its downloadable items has been removed.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f5;border-radius:9px"><tr><td style="padding:14px;color:#69716d;font-size:12px">ORDER</td><td style="padding:14px;text-align:right;font-weight:700">${orderNumber}</td></tr><tr><td style="padding:0 14px 14px;color:#69716d;font-size:12px">REFUNDED</td><td style="padding:0 14px 14px;text-align:right;font-weight:700">${total}</td></tr></table>`),
      text: `Hi ${rawName},\n\nStripe confirmed a ${money(amountMinor, currency)} refund for ${rawOrderNumber}.`,
    };
  }

  const offerTitle = normalizeEmailSubject(variables.offerTitle, "A special offer from Foliokit");
  const offerDescription = variables.offerDescription || "A limited Foliokit offer is ready for your next portfolio project.";
  const discountDetails = variables.discountDetails || "Visit Stripe Checkout to see the offer details and eligibility.";
  const expiry = variables.expiresAt ? `<p style="margin:18px 0 0;color:#7a827e;font-size:13px">Offer ends ${escapeHtml(variables.expiresAt)}.</p>` : "";
  const actionUrl = variables.actionUrl || `${primaryClientUrl()}/themes`;
  return {
    subject: offerTitle,
    html: emailShell(offerTitle, offerTitle, `<p style="margin:0 0 16px">Hi ${name},</p><p style="margin:0 0 18px">${escapeHtml(offerDescription)}</p><div style="background:#f0efff;border-left:3px solid #5340c6;border-radius:7px;padding:15px 16px;color:#3f3586;font-weight:700">${escapeHtml(discountDetails)}</div>${expiry}`, { label: variables.ctaLabel || "View the offer", url: actionUrl }, { marketing: true, unsubscribeUrl: variables.unsubscribeUrl }),
    text: `Hi ${rawName},\n\n${offerTitle}\n${offerDescription}\n${discountDetails}${variables.expiresAt ? `\nOffer ends ${variables.expiresAt}.` : ""}\n\n${actionUrl}${variables.unsubscribeUrl ? `\n\nUnsubscribe from offers: ${variables.unsubscribeUrl}` : ""}`,
  };
}

function unsubscribeSignature(encodedUserId: string): string {
  return createHmac("sha256", env.EMAIL_UNSUBSCRIBE_SECRET).update(encodedUserId).digest("base64url");
}

export function createMarketingUnsubscribeToken(userId: string): string {
  if (!env.EMAIL_UNSUBSCRIBE_SECRET) throw new Error("Promotion email unsubscribe secret is not configured");
  const encodedUserId = Buffer.from(userId, "utf8").toString("base64url");
  return `${encodedUserId}.${unsubscribeSignature(encodedUserId)}`;
}

export function verifyMarketingUnsubscribeToken(token: string): string | null {
  if (!env.EMAIL_UNSUBSCRIBE_SECRET) return null;
  const [encodedUserId, signature, extra] = token.split(".");
  if (!encodedUserId || !signature || extra) return null;
  const expected = Buffer.from(unsubscribeSignature(encodedUserId));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const userId = Buffer.from(encodedUserId, "base64url").toString("utf8");
    return /^[a-f\d]{24}$/i.test(userId) ? userId : null;
  } catch {
    return null;
  }
}

export function marketingUnsubscribeUrl(userId: string): string {
  return `${primaryClientUrl()}/api/v1/emails/unsubscribe?token=${encodeURIComponent(createMarketingUnsubscribeToken(userId))}`;
}

export async function unsubscribeFromMarketing(token: string): Promise<boolean> {
  const userId = verifyMarketingUnsubscribeToken(token);
  if (!userId) return false;
  const result = await UserModel.updateOne({ _id: userId }, { $set: { marketingOptOutAt: new Date() } });
  return result.matchedCount > 0;
}

export async function sendEmailTemplate(input: SendTemplateInput) {
  assertBaseEmailConfiguration(input.type);
  const resend = getResendClient();
  const variables = { ...input.variables };
  if (input.type === "promotion" && !variables.unsubscribeUrl) {
    variables.unsubscribeUrl = `mailto:${env.EMAIL_REPLY_TO}?subject=unsubscribe`;
  }
  const template = renderEmailTemplate(input.type, variables);
  const reference = input.idempotencyKey || `${input.type}/${randomUUID()}`;
  const result = await resend.emails.send({
    from: senderByType[input.type](),
    to: [input.to],
    replyTo: env.EMAIL_REPLY_TO,
    subject: normalizeEmailSubject(template.subject),
    html: template.html,
    text: template.text,
    headers: input.type === "promotion"
      ? marketingHeaders(reference, variables.unsubscribeUrl?.startsWith("https://") ? variables.unsubscribeUrl : undefined)
      : transactionalHeaders(reference),
    ...(input.attachment ? { attachments: [{ filename: input.attachment.filename, content: input.attachment.content }] } : {}),
  }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);
  if (result.error) throw new Error(result.error.message || "Email delivery failed");
  if (!result.data?.id) throw new Error("Email provider returned no delivery identifier");
  return result.data;
}

export async function sendPromotionEmails(
  recipients: Array<{ id: string; email: string; name: string }>,
  variables: Omit<EmailTemplateVariables, "name" | "unsubscribeUrl">,
  campaignId: string,
): Promise<number> {
  assertMarketingConfiguration();
  const resend = getResendClient();
  const payload = recipients.map((recipient) => {
    const unsubscribeUrl = marketingUnsubscribeUrl(recipient.id);
    const template = renderEmailTemplate("promotion", { ...variables, name: recipient.name, unsubscribeUrl });
    return {
      from: senderByType.promotion(),
      to: [recipient.email],
      replyTo: env.EMAIL_REPLY_TO,
      subject: normalizeEmailSubject(template.subject),
      html: template.html,
      text: template.text,
      headers: marketingHeaders(`promotion/${campaignId}/${recipient.id}`, unsubscribeUrl),
    };
  });
  const result = await resend.batch.send(payload, { idempotencyKey: `promotion/${campaignId}` });
  if (result.error) throw new Error(result.error.message || "Promotion delivery failed");
  if (!result.data?.data.length) throw new Error("Email provider returned no promotion deliveries");
  return result.data.data.length;
}
