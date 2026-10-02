import { createHash } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import env from "../config/env.ts";

export interface PaypalLineItem {
  name: string;
  description?: string;
  unitAmountMinor: number;
  quantity?: number;
}

interface PaypalCheckoutInput {
  items: PaypalLineItem[];
  currency: string;
  customerEmail: string;
  returnUrl: string;
  cancelUrl: string;
  orderId: string;
  orderNumber: string;
  idempotencyKey: string;
}

interface PaypalAmount {
  currency_code?: string;
  value?: string;
}

interface PaypalCapture {
  id?: string;
  status?: string;
  amount?: PaypalAmount;
}

interface PaypalPurchaseUnit {
  reference_id?: string;
  custom_id?: string;
  invoice_id?: string;
  amount?: PaypalAmount;
  payments?: { captures?: PaypalCapture[] };
}

interface PaypalOrderResponse {
  id?: string;
  status?: string;
  purchase_units?: PaypalPurchaseUnit[];
  links?: Array<{ href?: string; rel?: string; method?: string }>;
}

interface PaypalVerificationResponse {
  verification_status?: string;
}

interface PaypalWebhookResponse {
  id?: string;
  url?: string;
  event_types?: Array<{ name?: string }>;
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;

function apiBaseUrl(): string {
  return env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function assertConfigured(): void {
  const missing = [
    !env.PAYPAL_CLIENT_ID && "PAYPAL_CLIENT_ID",
    !env.PAYPAL_CLIENT_SECRET && "PAYPAL_CLIENT_SECRET",
  ].filter(Boolean);
  if (missing.length) throw new Error(`PayPal is not configured. Set ${missing.join(", ")}`);
}

function requestId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 38);
}

function paypalError(status: number, body: unknown): Error {
  const payload = body as { name?: string; message?: string; details?: Array<{ description?: string }> } | null;
  const detail = payload?.details?.find((item) => item.description)?.description;
  return new Error(detail ?? payload?.message ?? payload?.name ?? `PayPal API returned HTTP ${status}`);
}

async function accessToken(): Promise<string> {
  assertConfigured();
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token;
  const credentials = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${apiBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token) throw paypalError(response.status, body);
  accessTokenCache = { token: body.access_token, expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 300) - 60) * 1000 };
  return body.access_token;
}

export async function verifyPaypalCredentials(): Promise<void> {
  await accessToken();
  if (!env.PAYPAL_WEBHOOK_ID) throw new Error("PAYPAL_WEBHOOK_ID is missing");
  const webhook = await paypalRequest<PaypalWebhookResponse>(`/v1/notifications/webhooks/${encodeURIComponent(env.PAYPAL_WEBHOOK_ID)}`);
  const expectedUrl = `${env.PUBLIC_API_URL}/api/v1/webhooks/paypal`;
  if (webhook.id !== env.PAYPAL_WEBHOOK_ID || webhook.url?.replace(/\/$/, "") !== expectedUrl) {
    throw new Error(`PayPal webhook must point to ${expectedUrl}`);
  }
  const configuredEvents = new Set(webhook.event_types?.map((event) => event.name));
  const acceptsAllEvents = configuredEvents.has("*");
  for (const event of ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"]) {
    if (!acceptsAllEvents && !configuredEvents.has(event)) throw new Error(`PayPal webhook is missing event ${event}`);
  }
}

async function paypalRequest<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["PayPal-Request-Id"] = requestId(init.idempotencyKey);
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw paypalError(response.status, body);
  return body as T;
}

function minorToDecimal(amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) throw new Error("PayPal checkout contains an invalid amount");
  return (amountMinor / 100).toFixed(2);
}

export function paypalDecimalToMinor(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function validatePaypalAmount(amount: string | undefined, currency: string | undefined, expectedAmountMinor: number, expectedCurrency: string): void {
  if (paypalDecimalToMinor(amount) !== expectedAmountMinor) throw new Error("PayPal payment amount does not match the order snapshot");
  if (currency?.toUpperCase() !== expectedCurrency.toUpperCase()) throw new Error("PayPal payment currency does not match the order snapshot");
}

function capturedPayment(order: PaypalOrderResponse): PaypalCapture | undefined {
  return order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []).find((capture) => Boolean(capture.id));
}

export async function createMarketplacePaypalCheckout(input: PaypalCheckoutInput) {
  if (!input.items.length) throw new Error("Checkout requires at least one item");
  const totalMinor = input.items.reduce((sum, item) => sum + item.unitAmountMinor * (item.quantity ?? 1), 0);
  const currency = input.currency.toUpperCase();
  const order = await paypalRequest<PaypalOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `${input.idempotencyKey}:create`,
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: input.orderId,
        custom_id: input.orderId,
        invoice_id: input.orderNumber,
        amount: {
          currency_code: currency,
          value: minorToDecimal(totalMinor),
          breakdown: { item_total: { currency_code: currency, value: minorToDecimal(totalMinor) } },
        },
        items: input.items.map((item) => ({
          name: item.name.slice(0, 127),
          ...(item.description ? { description: item.description.slice(0, 127) } : {}),
          quantity: String(item.quantity ?? 1),
          unit_amount: { currency_code: currency, value: minorToDecimal(item.unitAmountMinor) },
        })),
      }],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  const url = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
  if (!order.id || !url) throw new Error("PayPal returned no order approval URL");
  return { token: order.id, url, totalMinor };
}

export async function captureMarketplacePaypalCheckout(input: {
  token: string;
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}) {
  const details = await paypalRequest<PaypalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(input.token)}`);
  const unit = details.purchase_units?.[0];
  if (details.id !== input.token || unit?.custom_id !== input.orderId || unit.invoice_id !== input.orderNumber) throw new Error("PayPal checkout does not match this order");
  validatePaypalAmount(unit.amount?.value, unit.amount?.currency_code, input.amountMinor, input.currency);

  const alreadyCaptured = capturedPayment(details);
  const payment = alreadyCaptured ? details : await paypalRequest<PaypalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(input.token)}/capture`, {
    method: "POST",
    body: {},
    idempotencyKey: `${input.idempotencyKey}:capture`,
  });
  const capture = capturedPayment(payment);
  if (capture?.amount) validatePaypalAmount(capture.amount.value, capture.amount.currency_code, input.amountMinor, input.currency);
  return { transactionId: capture?.id, paymentStatus: capture?.status ?? payment.status };
}

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function verifyPaypalWebhookSignature(event: unknown, headers: IncomingHttpHeaders): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID) throw new Error("PayPal webhook verification is not configured. Set PAYPAL_WEBHOOK_ID");
  const transmissionId = header(headers, "paypal-transmission-id");
  const transmissionTime = header(headers, "paypal-transmission-time");
  const signature = header(headers, "paypal-transmission-sig");
  const certUrl = header(headers, "paypal-cert-url");
  const algorithm = header(headers, "paypal-auth-algo");
  if (!transmissionId || !transmissionTime || !signature || !certUrl || !algorithm) return false;
  const result = await paypalRequest<PaypalVerificationResponse>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: algorithm,
      transmission_sig: signature,
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    },
  });
  return result.verification_status === "SUCCESS";
}
