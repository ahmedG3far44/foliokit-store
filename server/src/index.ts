import cors from 'cors';
import helmet from 'helmet';
import express from 'express'
import mongoose from 'mongoose';
import env from './config/env.ts';
import mainRoutes from './routes/main.route.ts'

import { clerkMiddleware } from '@clerk/express'
import { verifyRegion } from './middlewares/verifyRegion.ts';
import { connectDatabase } from './config/database.ts';
import { errorHandler, notFound } from './middlewares/error.ts';
import { stripeWebhookHandler } from './routes/webhook.route.ts';
import { paypalWebhookHandler } from './routes/paypal-webhook.route.ts';
import { paymobWebhookHandler } from './routes/paymob-webhook.route.ts';
import { emailConfigurationIssues } from './services/email.service.ts';


const app = express()
const PORT = env.PORT;

const emailIssues = emailConfigurationIssues();
if (emailIssues.length) console.warn(`Email configuration warnings:\n- ${emailIssues.join("\n- ")}`);

app.set('trust proxy', true);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(cors({ origin: env.CLIENT_URL.split(",").map((value) => value.trim()), credentials: true }));

app.use(verifyRegion);

app.use(clerkMiddleware({
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
  secretKey: env.CLERK_SECRET_KEY,
  authorizedParties: env.CLIENT_URL.split(",").map((value) => value.trim()),
}));

app.post("/api/v1/webhooks/stripe", express.raw({ type: "application/json", limit: "256kb" }), stripeWebhookHandler);
app.post("/api/v1/webhooks/paypal", express.raw({ type: "application/json", limit: "256kb" }), paypalWebhookHandler);
app.post("/api/v1/webhooks/paymob", express.json({ limit: "256kb" }), paymobWebhookHandler);

app.use(express.json({ limit: "1mb" }));

app.get("/health/live", (_req, res) => { res.json({ status: "ok" }); });

app.get("/health/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", database: ready ? "connected" : "disconnected" });
});


app.use("/api/v1", mainRoutes)

app.use(notFound);

app.use(errorHandler);

connectDatabase()
  .then(() => app.listen(PORT, () => console.log(`Server listening at http://localhost:${PORT}`)))
  .catch((error) => {
    console.error("Unable to start server", error);
    process.exit(1);
  });

export default app;
