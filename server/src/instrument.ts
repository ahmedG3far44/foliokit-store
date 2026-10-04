import * as Sentry from "@sentry/node";
import env from "./config/env.ts";

Sentry.init({
  dsn: env.SENTRY_DSN,
  enabled: Boolean(env.SENTRY_DSN),
  environment: env.NODE_ENV,
  release: env.SENTRY_RELEASE,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
});
