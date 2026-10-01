# Portfolio Theme Marketplace

A single-vendor marketplace for production-ready portfolio templates. Visitors browse published themes, customers buy securely through Stripe, PayPal, or Paymob, and administrators manage themes, users, orders, email promotions, uploads, and revenue analytics.

## Docker environments

Requirements: Docker Desktop, or Docker Engine with Docker Compose v2.

The repository has two independent environments and four private environment files:

| Environment | Client variables | Server variables | Public endpoints |
| --- | --- | --- | --- |
| Development | `client/.env.development` | `server/.env.development` | UI: `http://localhost:5173`; API: `http://localhost:5000` |
| Production | `client/.env.production` | `server/.env.production` | UI: `https://foliokit.store`; API: `https://api.foliokit.store` |

The completed environment files are ignored by Git. Their `.example` counterparts contain every supported variable and are safe to commit.

### Development

Create the two local files and replace the placeholders with development/test credentials:

```sh
cp client/.env.development.example client/.env.development
cp server/.env.development.example server/.env.development
```

Then start the hot-reloading development stack:

```sh
docker compose up --build
```

Open `http://localhost:5173`. Source changes under `client`, `server`, and `shared` are mounted into their containers. MongoDB and local uploads persist in named volumes.

Useful commands:

```sh
docker compose ps
docker compose logs -f server client
docker compose down
```

### Production

Production uses Nginx to serve the React build on `foliokit.store` and reverse-proxy Express on `api.foliokit.store`. Certbot obtains and renews one Let's Encrypt certificate for both hostnames; Nginx redirects HTTP to HTTPS and reloads when the certificate changes.

1. Provision a Linux server with Docker Engine and Compose v2.
2. Create DNS `A` records for both `foliokit.store` and `api.foliokit.store` pointing to that server. Add matching `AAAA` records only when IPv6 is configured on the server.
3. Allow inbound TCP ports 80 and 443, and ensure no other process is using them.
4. Create the production environment files:

```sh
cp client/.env.production.example client/.env.production
cp server/.env.production.example server/.env.production
```

5. Replace every placeholder. Put the MongoDB Atlas connection string in `MONGODB_URI`, URL-encoding special characters in its username or password, and allow the production server's public IP in Atlas Network Access. Production uses Atlas directly; no MongoDB container is started.
6. Start the stack. `--env-file` is required because Vite variables are compiled into the browser bundle at image-build time:

```sh
docker compose --env-file client/.env.production -f docker-compose.production.yaml up -d --build --remove-orphans
docker compose --env-file client/.env.production -f docker-compose.production.yaml ps
```

Nginx creates a short-lived self-signed certificate only for the first boot. After DNS is reachable, Certbot replaces it with the trusted certificate and Nginx reloads automatically (normally within about one minute after issuance). Check issuance with:

```sh
docker compose --env-file client/.env.production -f docker-compose.production.yaml logs -f certbot nginx
```

For upgrades, back up MongoDB Atlas, deploy the new source, and run the production `up -d --build` command again. Compose preserves the certificate volumes. `docker compose down` keeps them; do not add `--volumes` unless you intentionally want to erase persisted certificates.

### Automatic production deployment from GitHub

The workflow at `.github/workflows/deploy-production.yml` runs after every push to `main` and can also be started manually from GitHub Actions. It connects to the VPS, fast-forwards its existing `main` checkout to the exact pushed commit, validates the production configuration, stops the running stack, rebuilds every changed image, starts the stack, waits for its health checks, and removes unused images.

In the GitHub repository, open **Settings → Secrets and variables → Actions** and create these repository or `production` environment secrets:

- `VPS_HOST`: the VPS IP address or hostname.
- `VPS_USERNAME`: the Linux deployment user.
- `VPS_PASSWORD`: that user's SSH password.
- `VPS_PORT`: optional; defaults to `22`.
- `VPS_HOST_FINGERPRINT`: strongly recommended SHA-256 SSH host fingerprint, which prevents connecting to an impersonated server.

Under the **Variables** tab, optionally set `VPS_APP_PATH`. It defaults to `/var/www/foliokit-store`.

Prepare the VPS once before enabling the workflow:

1. Clone this GitHub repository into `VPS_APP_PATH`, leave it on the `main` branch, and make sure `git fetch origin main` works non-interactively. Private repositories require a read-only deploy key or another GitHub credential on the VPS.
2. Create `client/.env.production` and `server/.env.production` in that checkout. They remain ignored by Git and are not overwritten during deployment.
3. Install Docker Engine and Docker Compose v2. Add `VPS_USERNAME` to the Docker group so it can run `docker compose` without `sudo`.
4. Keep TCP ports 80 and 443 open for Nginx and certificate renewal.

Password authentication is supported as requested, although a dedicated SSH deploy key is safer for a long-lived production server.

### Production URLs

- Client: `https://foliokit.store`
- API health: `https://api.foliokit.store/health/ready`
- Stripe webhook: `https://api.foliokit.store/api/v1/webhooks/stripe`
- PayPal webhook: `https://api.foliokit.store/api/v1/webhooks/paypal`
- Paymob webhook: `https://api.foliokit.store/api/v1/webhooks/paymob`

### Production provider changes

#### Authentication

- Generate two different random values of at least 32 characters for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Keep both server-only and use different values in development and production.
- Create a Google OAuth 2.0 **Web application** client. Add `http://localhost:5173` and `https://foliokit.store` as Authorized JavaScript origins. This Google Identity Services flow verifies an ID token at the API, so it does not use a callback URL or a Google client secret.
- Set the same public web client ID as `GOOGLE_CLIENT_ID` on the server and `VITE_GOOGLE_CLIENT_ID` on the client.
- Set `CLIENT_URL` to the exact browser origin. The API validates mutating-request origins and sends `HttpOnly`, `Secure` production cookies; every client API request uses `credentials: "include"`.
- Access tokens expire after `ACCESS_TOKEN_TTL_MINUTES` and refresh sessions after `REFRESH_TOKEN_TTL_DAYS`. Refresh tokens rotate and only their SHA-256 hashes are stored in MongoDB.

#### Resend

- Add and verify `foliokit.store`, then publish the exact DKIM and SPF records Resend supplies. Publish and monitor a DMARC policy too.
- Create a production sending-only API key restricted to the verified domain and set `RESEND_API_KEY`.
- Keep all `EMAIL_FROM_*` values on the verified domain.

#### Stripe

- Activate the Stripe account and replace `sk_test_...` with the live `sk_live_...` secret in `STRIPE_SECRET_KEY`.
- In Stripe live mode, create the webhook endpoint shown above and subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.created`, and `refund.updated`.
- Copy that live endpoint's new `whsec_...` value into `STRIPE_WEBHOOK_SECRET`. Test and live webhook secrets are different.

#### PayPal

- Use a verified PayPal Business account, open the **Live** tab for the REST app, and replace the sandbox client ID and secret with its live credentials.
- Set `PAYPAL_ENVIRONMENT=live`.
- On that same live app, register the PayPal webhook URL shown above for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, and `PAYMENT.CAPTURE.REFUNDED`; put the resulting live listener ID in `PAYPAL_WEBHOOK_ID`.

#### Cloudflare R2 and Paymob

- Configure the R2 bucket and production credentials, then run `docker compose --env-file client/.env.production -f docker-compose.production.yaml exec server npm run r2:setup:compiled` once so browser uploads allow `https://foliokit.store`.
- For Paymob, replace test keys, integration IDs, and HMAC secret with values from Live mode and keep `PUBLIC_API_URL=https://api.foliokit.store`.

## Run without Docker (optional)

Use the two development environment files described above, run `npm install` in both packages, then run `npm run dev` in `server` and `client`. The local API remains on port 5000 and the Vite client on port 5173.

## Create the first administrator

Set `ADMIN_EMAIL`, `ADMIN_NAME`, and a strong `ADMIN_PASSWORD`, then run from `server`:

```sh
npm run seed
```

With Docker, run the same one-time operation inside the server container:

```sh
docker compose exec server npm run seed:compiled
```

The seed is idempotent. It creates or updates the administrator's hashed password, preserves the `admin` role for `ADMIN_EMAIL`, and adds six draft themes with external placeholder images. A source ZIP is optional when publishing, but a theme cannot be purchased until its ZIP is ready. Administrators are routed to `/dashboard/insights`; customers return to `/`.

## Cloudflare R2 storage and payments

- Set `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. Runtime credentials need Object Read & Write access to that bucket.
- Placeholder R2 values are treated as unconfigured. Development automatically falls back to local storage; production returns a clear storage configuration error and never silently uses local files.
- Run `npm run r2:setup` from `server` once with R2 Admin Read & Write credentials to configure browser upload CORS for `CLIENT_URL` and expose the `ETag` header. You can replace them with bucket-scoped Object Read & Write credentials afterward.
- With Docker, use `docker compose exec server npm run r2:setup:compiled` locally or `docker compose --env-file client/.env.production -f docker-compose.production.yaml exec server npm run r2:setup:compiled` in production.
- The R2 bucket stays private. The API returns temporary signed preview URLs for images and videos; theme ZIP keys are never returned, and downloads always use shorter-lived signed URLs.
- Set Stripe's webhook endpoint to `POST /api/v1/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.created`, and `refund.updated`.
- Only a verified Stripe webhook with the expected amount and currency grants entitlements. Stripe returns customers to `/purchase`, which shows a processing state and polls until the webhook marks the order paid.
- For PayPal, create a REST app and set its client ID and secret as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Use `PAYPAL_ENVIRONMENT=sandbox` while testing and switch it to `live` only with the matching live credentials.
- Register `POST /api/v1/webhooks/paypal` on the same PayPal REST app, subscribe to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, and `PAYMENT.CAPTURE.REFUNDED`, and save the registered listener ID as `PAYPAL_WEBHOOK_ID`. PayPal returns through `/purchase`; the API captures the approved order and the verified webhook remains the asynchronous source of truth and refund handler.
- For Paymob Unified Checkout, set `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, and `PAYMOB_HMAC_SECRET` from the same Test or Live mode. For one integration, set `PAYMOB_INTEGRATION_ID` plus its exact `PAYMOB_CURRENCY` (for example `EGP`). For more than one currency, set `PAYMOB_INTEGRATION_IDS=EGP:123456,USD:789012`; this mapping takes precedence. Copy an **online Payment Integration ID** from Developers → Payment Integrations after selecting the same Test/Live mode as the keys; an iframe ID or an ID from the other mode is rejected by the Intention API. Set `PAYMOB_BASE_URL` to your regional Paymob origin (the default is Egypt) and `PUBLIC_API_URL` to the public HTTPS origin serving the API.
- Configure Paymob's processed callback as `POST /api/v1/webhooks/paymob`. The application also sends that URL as the intention notification URL, verifies the SHA-512 HMAC, and checks the stored order amount, currency, integration ID, and order reference before granting downloads.
- Paid customers can download an invoice from `GET /api/v1/orders/:id/invoice`; administrators can use `GET /api/v1/admin/orders/:id/invoice`. Pending, failed, and refunded orders do not produce invoices.

## Admin workspace

The `/dashboard` workspace includes paid-order insights, account access/role management, portfolio theme drafting and publishing, multipart asset uploads, marketplace order inspection, customer email promotions, template test sends, and the existing legacy-transaction tools. The API remains namespaced under `/api/v1/admin`. Stripe owns promotion-code configuration and application. Themes with paid sales are archived instead of deleted, and user removal retains anonymized financial records.

## Production email delivery

- Verify `foliokit.store` in Resend and publish the exact SPF and DKIM records Resend provides. Add a DMARC record and monitor it before moving to a stricter policy.
- Keep the account, billing, and marketing sender addresses stable and on the verified domain. Transactional email delivery does not require marketing-campaign settings.
- Promotions include one-click unsubscribe headers and an unsubscribe link. Opted-out customers are excluded from the admin recipient list and are checked again when a campaign is sent.
- Invoice messages include Gmail Order structured data. Register the production billing sender with Google after it has an established sending history if you want Gmail to recognize the purchase markup outside self-tests.
- Mailbox providers make the final Spam and category decision. Test the authenticated production domain with several major providers and monitor bounces, complaints, and domain reputation after deployment.

## Verification

Run `npm run build` in both packages and `npm run lint` in `client` before deployment.

Validate the container definitions without starting services:

```sh
docker compose config --quiet
docker compose --env-file client/.env.production -f docker-compose.production.yaml config --quiet
```
