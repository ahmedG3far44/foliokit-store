import dotenv from "dotenv";

const nodeEnvironment = process.env.NODE_ENV ?? "development";
dotenv.config({ path: `.env.${nodeEnvironment}` });
dotenv.config();

const env = {
  NODE_ENV: nodeEnvironment,
  PORT: Number(process.env.PORT ?? 5000),

  CLIENT_URL: process.env.CLIENT_URL ?? "http://localhost:5173",
  MONGODB_URI: process.env.MONGO_URI ?? process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/saas",

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET?.trim() || "development-access-secret-change-before-production",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET?.trim() || "development-refresh-secret-change-before-production",
  ACCESS_TOKEN_TTL_MINUTES: Math.min(60, Math.max(5, Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? 15))),
  REFRESH_TOKEN_TTL_DAYS: Math.min(90, Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30))),

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "ahmedjaafarbadri@gmail.com",
  ADMIN_NAME: process.env.ADMIN_NAME ?? "System Admin",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "",

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_KEY_SECRETS ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRETS ?? "",

  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ?? "",
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET ?? "",
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID ?? "",
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT === "live" ? "live" as const : "sandbox" as const,

  PAYMOB_SECRET_KEY: process.env.PAYMOB_SECRET_KEY ?? "",
  PAYMOB_PUBLIC_KEY: process.env.PAYMOB_PUBLIC_KEY ?? "",
  PAYMOB_INTEGRATION_ID: process.env.PAYMOB_INTEGRATION_ID ?? "",
  PAYMOB_INTEGRATION_IDS: process.env.PAYMOB_INTEGRATION_IDS ?? "",
  PAYMOB_CURRENCY: (process.env.PAYMOB_CURRENCY ?? "EGP").trim().toUpperCase(),
  PAYMOB_HMAC_SECRET: process.env.PAYMOB_HMAC_SECRET ?? "",
  PAYMOB_BASE_URL: (process.env.PAYMOB_BASE_URL ?? "https://accept.paymob.com").replace(/\/$/, ""),
  PUBLIC_API_URL: (process.env.PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/$/, ""),

  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",

  EMAIL_FROM_ACCOUNT: process.env.EMAIL_FROM_ACCOUNT ?? "Foliokit Account <account@foliokit.store>",
  EMAIL_FROM_BILLING: process.env.EMAIL_FROM_BILLING ?? "Foliokit Billing <billing@foliokit.store>",
  EMAIL_FROM_MARKETING: process.env.EMAIL_FROM_MARKETING ?? "Foliokit Offers <offers@foliokit.store>",
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO ?? "support@foliokit.store",
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "",
  R2_MEDIA_URL_TTL_SECONDS: Math.min(604_800, Math.max(300, Number(process.env.R2_MEDIA_URL_TTL_SECONDS ?? 3600))),
  R2_DOWNLOAD_URL_TTL_SECONDS: Math.min(900, Math.max(60, Number(process.env.R2_DOWNLOAD_URL_TTL_SECONDS ?? 90))),
  LOCAL_UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR ?? "local-uploads",
  LOCAL_MEDIA_BASE_URL: (process.env.LOCAL_MEDIA_BASE_URL ?? `http://localhost:${Number(process.env.PORT ?? 5000)}`).replace(/\/$/, ""),
  MAX_IMAGE_SIZE_MB: Number(process.env.MAX_IMAGE_SIZE_MB ?? 10),
  MAX_VIDEO_SIZE_MB: Number(process.env.MAX_VIDEO_SIZE_MB ?? 250),
  MAX_THEME_ZIP_SIZE_MB: Number(process.env.MAX_THEME_ZIP_SIZE_MB ?? 100),
};

if (env.NODE_ENV === "production") {
  if (env.JWT_ACCESS_SECRET.length < 32) throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters in production");
  if (env.JWT_REFRESH_SECRET.length < 32) throw new Error("JWT_REFRESH_SECRET must contain at least 32 characters in production");
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) throw new Error("JWT access and refresh secrets must be different");
}


export default env;
