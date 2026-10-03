import * as Sentry from "@sentry/node";
import env from "./config/env.ts";


const SENTRY_DSN = "https://f523f6b8bed1ff50f7c4577dbe80da60@o4511847820165120.ingest.de.sentry.io/4512191970934864";
const SENTRY_RELEASE = "1.0.0";


Sentry.init({
    dsn: SENTRY_DSN,
    environment: env.NODE_ENV,
    release: SENTRY_RELEASE,
    tracesSampleRate: env.NODE_ENV === "production"
        ? 0.1
        : 1.0,
});