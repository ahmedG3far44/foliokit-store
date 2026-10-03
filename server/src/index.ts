import cors from 'cors';
import helmet from 'helmet';
import express from 'express'
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import env from './config/env.ts';
import mainRoutes from './routes/main.route.ts'

import { verifyRegion } from './middlewares/verifyRegion.ts';
import { connectDatabase } from './config/database.ts';
import { errorHandler, notFound, requestContext } from './middlewares/error.ts';
import { stripeWebhookHandler } from './routes/webhook.route.ts';
import { paypalWebhookHandler } from './routes/paypal-webhook.route.ts';
import { emailConfigurationIssues } from './services/email.service.ts';
// import { requireTrustedOrigin } from './middlewares/origin.ts';
// import "./instrumentation";
// import * as Sentry from "@sentry/node";

const app = express()
const PORT = env.PORT;

const emailIssues = emailConfigurationIssues();
if (emailIssues.length) console.warn(`Email configuration warnings:\n- ${emailIssues.join("\n- ")}`);

app.set('trust proxy', true);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(cors({ origin: env.CLIENT_URL.split(",").map((value) => value.trim()), credentials: true }));

app.use(verifyRegion);
app.use(requestContext);

app.post("/api/v1/webhooks/stripe", express.raw({ type: "application/json", limit: "256kb" }), stripeWebhookHandler);
app.post("/api/v1/webhooks/paypal", express.raw({ type: "application/json", limit: "256kb" }), paypalWebhookHandler);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.send(`<h1>Foliokit Server</h1>
    <h2>=============================</h2>
    <h2>ENV:</h2>
    <pre>
    <h3>MONGODB_URI: ${env.MONGODB_URI}</h3>
    <h3>JWT_ACCESS_SECRET: ${env.JWT_ACCESS_SECRET}</h3>
    <h3>JWT_REFRESH_SECRET: ${env.JWT_REFRESH_SECRET}</h3>
    <h3>ACCESS_TOKEN_TTL_MINUTES: ${env.ACCESS_TOKEN_TTL_MINUTES}</h3>
    <h3>REFRESH_TOKEN_TTL_DAYS: ${env.REFRESH_TOKEN_TTL_DAYS}</h3>
    <h3>GOOGLE_CLIENT_ID: ${env.GOOGLE_CLIENT_ID}</h3>
    <h3>STRIPE_SECRET_KEY: ${env.STRIPE_SECRET_KEY}</h3>
    <h3>STRIPE_WEBHOOK_SECRET: ${env.STRIPE_WEBHOOK_SECRET}</h3>
    <h3>CLOUDFLARE_ACCOUNT_ID: ${env.R2_ACCOUNT_ID}</h3>
    <h3>R2_ACCESS_KEY_ID: ${env.R2_ACCESS_KEY_ID}</h3>
    <h3>R2_SECRET_ACCESS_KEY: ${env.R2_SECRET_ACCESS_KEY}</h3>
    <h3>R2_BUCKET: ${env.R2_BUCKET}</h3>
    <h3>R2_MEDIA_URL_TTL_SECONDS: ${env.R2_MEDIA_URL_TTL_SECONDS}</h3>
    <h3>R2_DOWNLOAD_URL_TTL_SECONDS: ${env.R2_DOWNLOAD_URL_TTL_SECONDS}</h3>
    <h3>MAX_IMAGE_SIZE_MB: ${env.MAX_IMAGE_SIZE_MB}</h3>
    <h3>MAX_VIDEO_SIZE_MB: ${env.MAX_VIDEO_SIZE_MB}</h3>
    <h3>MAX_THEME_ZIP_SIZE_MB: ${env.MAX_THEME_ZIP_SIZE_MB}</h3>
    <h3>ADMIN_EMAIL: ${env.ADMIN_EMAIL}</h3>
    <h3>ADMIN_NAME: ${env.ADMIN_NAME}</h3>
    <h3>ADMIN_PASSWORD: ${env.ADMIN_PASSWORD}</h3>
    <h3>RESEND_API_KEY: ${env.RESEND_API_KEY}</h3>
    <h3>EMAIL_FROM_ACCOUNT: ${env.EMAIL_FROM_ACCOUNT}</h3>
    <h3>EMAIL_FROM_BILLING: ${env.EMAIL_FROM_BILLING}</h3>
    <h3>EMAIL_FROM_MARKETING: ${env.EMAIL_FROM_MARKETING}</h3>
    <h3>EMAIL_REPLY_TO: ${env.EMAIL_REPLY_TO}</h3>
    <h3>PAYPAL_CLIENT_ID: ${env.PAYPAL_CLIENT_ID}</h3>
    <h3>PAYPAL_CLIENT_SECRET: ${env.PAYPAL_CLIENT_SECRET}</h3>
    <h3>PAYPAL_WEBHOOK_ID: ${env.PAYPAL_WEBHOOK_ID}</h3>
    <h3>PAYPAL_ENVIRONMENT: ${env.PAYPAL_ENVIRONMENT}</h3>
    </pre>
    <h2>=============================</h2>`);
})

app.get("/health/live", (_req, res) => { res.json({ status: "ok", service: "Foliokit Server", version: "1.0.0", origin: env.CLIENT_URL }); });

app.get("/health/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", database: ready ? "connected" : "disconnected" });
});


app.use("/api/v1", mainRoutes)

// Sentry.setupExpressErrorHandler(app);

app.use(notFound);

app.use(errorHandler);

connectDatabase()
  .then(() => app.listen(PORT, () => console.log(`Server listening at http://localhost:${PORT}`)))
  .catch((error) => {
    console.error("Unable to start server", error);
    process.exit(1);
  });

export default app;
