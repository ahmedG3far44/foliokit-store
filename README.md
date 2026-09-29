# Portfolio Theme Marketplace

A single-vendor marketplace for production-ready portfolio templates. Visitors browse published themes, customers buy securely through Stripe, PayPal, or Paymob, and administrators manage themes, users, orders, email promotions, uploads, and revenue analytics.

## Run locally with Docker

Requirements: Docker Desktop (or Docker Engine with Compose v2).

1. Copy `.env.example` to `.env`.
2. Set a long, URL-safe `MONGO_ROOT_PASSWORD` and add the Clerk keys. The client build requires `VITE_CLERK_PUBLISHABLE_KEY`.
3. Add Stripe, Resend, and Cloudflare R2 credentials for the corresponding marketplace features.
4. Build and start the stack:

```sh
docker compose up -d --build
```

Open `http://localhost:8080` (or the port set by `HTTP_PORT`). MongoDB and the API are isolated from the host; only the reverse proxy is published. Data survives restarts in a named Docker volume.

Useful commands:

```sh
docker compose ps
docker compose logs -f api
docker compose down
```

`docker compose down` keeps the database. Only add `--volumes` when you deliberately want to erase local database and volume data.

The externally routed API health endpoints are `GET /health/live` and `GET /health/ready`.

## Production deployment with a domain

The production stack uses Caddy in front of the React and Express containers. Caddy obtains and renews trusted TLS certificates automatically and redirects HTTP to HTTPS.

1. Provision a Linux server with Docker Engine and the Compose plugin.
2. Point the domain's DNS `A` record (and `AAAA` when using IPv6) to the server. Set `DOMAIN` to that exact hostname, without `https://` or a path.
3. Allow inbound TCP ports 80 and 443 and UDP port 443. Ports 80 and 443 must not be occupied by another web server.
4. Copy the project and `.env` to the server. Set `DOMAIN`, `ACME_EMAIL`, a strong URL-safe MongoDB password, and every application credential used in production.
5. In Clerk, allow `https://your-domain.example` as an application origin/redirect URL.
6. Start the production stack:

```sh
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml ps
```

Once DNS reaches the server, visit `https://your-domain.example`. Certificate state is persisted in the `caddy_data` volume, and MongoDB data is persisted in `mongodb_data`.

For upgrades, pull or copy the new source and run the production `up -d --build` command again. Back up the MongoDB volume before application or database upgrades.

### Production integration URLs

- Stripe webhook: `https://your-domain.example/api/v1/webhooks/stripe`
- PayPal webhook: `https://your-domain.example/api/v1/webhooks/paypal`
- Paymob webhook: `https://your-domain.example/api/v1/webhooks/paymob`
- Live health check: `https://your-domain.example/health/live`
- Readiness check: `https://your-domain.example/health/ready`

## Run without Docker (optional)

1. Copy `server/.env.example` to `server/.env`, then configure MongoDB and Clerk. Cloudflare R2 is optional during local development; when its credentials are absent, admin uploads are stored under `server/local-uploads` and served by the local API.
2. Create `client/.env` with `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_BASE_URL=http://localhost:3000/api/v1`.
3. Run `npm install` in both `server` and `client`.
4. Start the API with `npm run dev` in `server`, then the UI with `npm run dev` in `client`.

## Create the first administrator

First create the account in Clerk. Set `ADMIN_EMAIL` to the exact Clerk email and optionally set `ADMIN_CLERK_USER_ID`, then run from `server`:

```sh
npm run seed
```

With Docker, run the same one-time operation inside the API container:

```sh
docker compose exec api npm run seed:compiled
```

The seed is idempotent and deliberately fails if it cannot resolve a real Clerk identity. It never creates an unlinked database-only administrator. It also adds six draft themes with external placeholder images. A source ZIP is optional when publishing, but a theme cannot be purchased until its ZIP is ready. Sign in through `/sign-in`; the restored Clerk session is synchronized into MongoDB, and an admin is then routed to `/admin`.

## Cloudflare R2 storage and payments

- Set `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. Runtime credentials need Object Read & Write access to that bucket.
- Placeholder R2 values are treated as unconfigured. Development automatically falls back to local storage; production returns a clear storage configuration error and never silently uses local files.
- Run `npm run r2:setup` from `server` once with R2 Admin Read & Write credentials to configure browser upload CORS for `CLIENT_URL` and expose the `ETag` header. You can replace them with bucket-scoped Object Read & Write credentials afterward.
- With Docker, use `docker compose exec api npm run r2:setup:compiled` locally or add `-f compose.prod.yaml` immediately after `docker compose` in production.
- The R2 bucket stays private. The API returns temporary signed preview URLs for images and videos; theme ZIP keys are never returned, and downloads always use shorter-lived signed URLs.
- Set Stripe's webhook endpoint to `POST /api/v1/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.created`, and `refund.updated`.
- Only a verified Stripe webhook with the expected amount and currency grants entitlements. Stripe returns customers to `/purchase`, which shows a processing state and polls until the webhook marks the order paid.
- For PayPal, create a REST app and set its client ID and secret as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Use `PAYPAL_ENVIRONMENT=sandbox` while testing and switch it to `live` only with the matching live credentials.
- Register `POST /api/v1/webhooks/paypal` on the same PayPal REST app, subscribe to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, and `PAYMENT.CAPTURE.REFUNDED`, and save the registered listener ID as `PAYPAL_WEBHOOK_ID`. PayPal returns through `/purchase`; the API captures the approved order and the verified webhook remains the asynchronous source of truth and refund handler.
- For Paymob Unified Checkout, set `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, and `PAYMOB_HMAC_SECRET` from the same Test or Live mode. For one integration, set `PAYMOB_INTEGRATION_ID` plus its exact `PAYMOB_CURRENCY` (for example `EGP`). For more than one currency, set `PAYMOB_INTEGRATION_IDS=EGP:123456,USD:789012`; this mapping takes precedence. Copy an **online Payment Integration ID** from Developers → Payment Integrations after selecting the same Test/Live mode as the keys; an iframe ID or an ID from the other mode is rejected by the Intention API. Set `PAYMOB_BASE_URL` to your regional Paymob origin (the default is Egypt) and `PUBLIC_API_URL` to the public HTTPS origin serving the API.
- Configure Paymob's processed callback as `POST /api/v1/webhooks/paymob`. The application also sends that URL as the intention notification URL, verifies the SHA-512 HMAC, and checks the stored order amount, currency, integration ID, and order reference before granting downloads.
- Paid customers can download an invoice from `GET /api/v1/orders/:id/invoice`; administrators can use `GET /api/v1/admin/orders/:id/invoice`. Pending, failed, and refunded orders do not produce invoices.

## Admin workspace

The `/admin` workspace includes paid-order insights, account access/role management, portfolio theme drafting and publishing, multipart asset uploads, marketplace order inspection, customer email promotions, template test sends, and the existing legacy-transaction tools. Stripe owns promotion-code configuration and application. Themes with paid sales are archived instead of deleted, and user removal retains anonymized financial records.

## Production email delivery

- Verify `foliokit.store` in Resend and publish the exact SPF and DKIM records Resend provides. Add a DMARC record and monitor it before moving to a stricter policy.
- Keep the account, billing, and marketing sender addresses stable and on the verified domain. Configure every email variable in `.env`; promotional sends remain disabled until `EMAIL_UNSUBSCRIBE_SECRET` and the legal `BUSINESS_ADDRESS` are present.
- Promotions include one-click unsubscribe headers and an unsubscribe link. Opted-out customers are excluded from the admin recipient list and are checked again when a campaign is sent.
- Invoice messages include Gmail Order structured data. Register the production billing sender with Google after it has an established sending history if you want Gmail to recognize the purchase markup outside self-tests.
- Mailbox providers make the final Spam and category decision. Test the authenticated production domain with several major providers and monitor bounces, complaints, and domain reputation after deployment.

## Verification

Run `npm run build` in both packages and `npm run lint` in `client` before deployment.

Validate the container definitions without starting services:

```sh
docker compose config --quiet
docker compose -f compose.prod.yaml config --quiet
```
