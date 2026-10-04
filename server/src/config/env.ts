import dotenv from "dotenv";

const nodeEnvironment = process.env.NODE_ENV ?? "development";
dotenv.config({ path: `.env.${nodeEnvironment}` });
dotenv.config();

const configuredSentrySampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? (nodeEnvironment === "production" ? 0.1 : 1));

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
  MAX_IMAGE_SIZE_MB: Number(process.env.MAX_IMAGE_SIZE_MB ?? 10),
  MAX_VIDEO_SIZE_MB: Number(process.env.MAX_VIDEO_SIZE_MB ?? 250),
  MAX_THEME_ZIP_SIZE_MB: Number(process.env.MAX_THEME_ZIP_SIZE_MB ?? 100),

  SENTRY_DSN: process.env.SENTRY_DSN?.trim() ?? "",
  SENTRY_RELEASE: process.env.SENTRY_RELEASE?.trim() || undefined,
  SENTRY_TRACES_SAMPLE_RATE: Number.isFinite(configuredSentrySampleRate)
    ? Math.min(1, Math.max(0, configuredSentrySampleRate))
    : nodeEnvironment === "production" ? 0.1 : 1,
};

function isPlaceholder(value: string): boolean {
  return !value.trim() || /(?:replace[_-]?me|change[_-]?me|example\.com|username:password|your[_-])/i.test(value);
}

if (env.NODE_ENV === "production") {
  const issues: string[] = [];
  const requiredValues = {
    MONGODB_URI: env.MONGODB_URI,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET,
    PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID,
    RESEND_API_KEY: env.RESEND_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.R2_BUCKET,
    SENTRY_DSN: env.SENTRY_DSN,
  };
  for (const [name, value] of Object.entries(requiredValues)) {
    if (isPlaceholder(value)) issues.push(`${name} is missing or still contains a placeholder`);
  }
  if (!env.CLIENT_URL.split(",").every((url) => url.trim().startsWith("https://"))) issues.push("CLIENT_URL must contain HTTPS origins");
  if (!env.PUBLIC_API_URL.startsWith("https://")) issues.push("PUBLIC_API_URL must use HTTPS");
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI)) issues.push("MONGODB_URI is not a MongoDB connection string");
  if (env.JWT_ACCESS_SECRET.length < 32) issues.push("JWT_ACCESS_SECRET must contain at least 32 characters");
  if (env.JWT_REFRESH_SECRET.length < 32) issues.push("JWT_REFRESH_SECRET must contain at least 32 characters");
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) issues.push("JWT access and refresh secrets must be different");
  if (!env.STRIPE_SECRET_KEY.startsWith("sk_live_")) issues.push("STRIPE_SECRET_KEY must be a live-mode key");
  if (!env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) issues.push("STRIPE_WEBHOOK_SECRET is not a webhook signing secret");
  if (env.PAYPAL_ENVIRONMENT !== "live") issues.push("PAYPAL_ENVIRONMENT must be live");
  if (!env.RESEND_API_KEY.startsWith("re_")) issues.push("RESEND_API_KEY is not a Resend API key");
  if (issues.length) throw new Error(`Invalid production configuration:\n- ${issues.join("\n- ")}`);
}


export default env;
