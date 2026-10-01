# Portfolio Theme Marketplace — Product Requirements Document

| Field           | Value                             |
| --------------- | --------------------------------- |
| Version         | 1.0                               |
| Status          | Draft                             |
| Date            | September 13, 2026                |
| Product type    | Single-vendor digital marketplace |
| Primary product | Downloadable portfolio themes     |
| Platforms       | Responsive web application        |
| Owners          | Product and Engineering           |

## 1. Product summary

The Portfolio Theme Marketplace enables developers, designers, and other professionals to discover and purchase ready-made portfolio themes.

Customers can:

* Browse published themes.
* Search, filter, and sort themes.
* inspect theme features, technology stack, screenshots, videos, and price.
* Open an externally hosted live demo.
* Add themes to a cart.
* Apply eligible Stripe-managed promotions during Checkout.
* Complete payment using Stripe Checkout.
* Access purchased themes from their account.
* Download each purchased theme up to five times.

Administrators can:

* Manage themes and their media/source files.
* Monitor orders, sales, Stripe promotions, and revenue.
* View sales performance for individual themes.
* Search, filter, block, and activate users.
* Send marketing offers to selected active customers.
* Upload private theme ZIP files and public theme media to AWS S3.

This MVP is a single-vendor store. It does not allow third-party creators to publish themes or receive payouts.

---

## 2. Goals

### Product goals

* Provide a simple theme-discovery and checkout experience.
* Deliver purchased source files securely.
* Prevent customers from purchasing the same theme twice.
* Limit each purchase to five download requests.
* Provide accurate, filterable sales analytics.
* Give administrators complete control over users, themes, media, orders, and promotional email campaigns.
* Make payment fulfillment reliable and idempotent.
* Establish an architecture that can support more digital products later.

### Success metrics

* Checkout conversion rate.
* Successful payment-to-entitlement fulfillment rate.
* Download success rate.
* Revenue and paid order count.
* Sales per theme.
* Promotional email delivery success.
* Checkout failure rate.
* Upload processing failure rate.
* Unauthorized download attempts.

### Non-goals for MVP

* Multi-vendor onboarding and payouts.
* Subscriptions.
* Customer reviews and ratings.
* License-key DRM.
* Native mobile applications.
* Automated refunds.
* Multiple storefront currencies.
* Affiliate programs.
* Marketplace commissions.

---

## 3. User roles

| Role     | Capabilities                                                               |
| -------- | -------------------------------------------------------------------------- |
| Visitor  | Browse, search, filter, view theme details, and open demos                 |
| Customer | Visitor capabilities plus cart, checkout, orders, purchases, and downloads |
| Admin    | Manage themes, users, orders, promotional email, uploads, and analytics    |

User authorization must always be enforced by the Express API. Hiding admin UI elements is not sufficient authorization.

---

## 4. Technology stack

### Frontend

* React 19 with Vite and TypeScript.
* Tailwind CSS v4.
* React Context API.
* Native `fetch`; Axios is prohibited.
* Zod for runtime validation.
* Application auth context with email/password and Google sign-in.
* React Router.
* Custom hooks for loading, error, cancellation, and data handling.

Context should only hold genuinely shared state:

* Authenticated application profile.
* Cart.
* Toast/notification state.

Form state, upload state, and page-specific state should remain local to their components.

### Backend

* Node.js.
* Express.
* TypeScript.
* MongoDB with Mongoose.
* Zod.
* Express JWT access-token verification and rotating refresh sessions.
* Stripe Checkout and webhooks.
* AWS S3.
* Multer for controlled server-side image ingestion.
* Sharp for image processing.
* Redis-backed rate limiting in production.
* Centralized error handling and structured logging.

### Suggested repository structure

```text
apps/
  web/
  api/
packages/
  shared/
    schemas/
    types/
    constants/
```

Backend modules should follow:

```text
module/
  routes
  controller
  service
  repository
  model
  schema
  types
```

---

## 5. Core business rules

### Authentication and accounts

* The application owns password hashing, JWT issuance, refresh-token rotation, and session revocation.
* Google Identity Services is used only to obtain an ID token, which the API verifies before linking a verified email.
* Application roles are `customer` and `admin`.
* Account states are `active` and `blocked`.
* Blocked users may browse public pages but cannot:

  * Modify a cart.
  * Start checkout.
  * Access orders.
  * Generate download links.
* Admin permissions must be verified by the API on every admin request.

### Pricing

* Prices must be stored as integer minor units.

```ts
{
  priceMinor: 4900,
  currency: "USD"
}
```

* Floating-point values must not be used for financial calculations.
* The server calculates all checkout totals from current database values.
* The frontend must never send a trusted price or final total.
* Completed orders retain immutable price and discount snapshots.

### Ownership

A customer owns a theme when a paid entitlement exists for:

```text
userId + themeId
```

The database must have a unique compound index on this pair.

Ownership must be checked:

1. When adding the theme to the cart.
2. Before creating a Stripe Checkout Session.
3. During webhook fulfillment.

If already owned, the API returns:

```json
{
  "code": "THEME_ALREADY_OWNED",
  "message": "You already own this theme.",
  "purchaseUrl": "/account/purchases"
}
```

### Download limit

* Each entitlement allows a maximum of five download-link generations in the MVP.
* A download is counted when the API successfully generates a presigned URL.
* The update must be atomic and conditional:

```text
downloadsUsed < downloadLimit
```

This prevents concurrent fifth and sixth requests from both succeeding.

A browser redirect cannot reliably prove the complete ZIP was transferred. If completed-transfer counting becomes necessary, a future version can reconcile CloudFront or S3 access logs.

### Theme deletion

Themes that have sales must be archived, not permanently deleted. Existing customers retain access to the purchased theme version unless access is removed because of a refund, chargeback, security incident, or legal takedown.

---

## 6. Customer experience

### 6.1 Browse themes

The theme catalog must support:

* Pagination.
* Search by theme name.
* Technology-stack filtering.
* Price-range filtering.
* Featured filter.
* Sorting by:

  * Newest.
  * Price ascending.
  * Price descending.
  * Best selling.
* Published themes only.

Each theme card displays:

* Cover image.
* Name.
* Short description.
* Technology stack.
* Price.
* Featured/new badge when applicable.
* Purchased state for authenticated owners.
* View details CTA.

### 6.2 Theme details

The details page displays:

* Theme name.
* Short and full description.
* Image gallery.
* Demo videos.
* Technology stack.
* Feature list.
* Current version.
* Last update date.
* Price.
* Live preview button.
* Add-to-cart button.
* Purchased state.
* Basic license information.
* Browser and deployment compatibility where applicable.

The preview URL must:

* Use HTTPS.
* Be validated by the server.
* Open in a new tab.
* Use `noopener` and `noreferrer`.

### 6.3 Cart

Customers can:

* Add an unowned theme.
* Remove a theme.
* View subtotal.
* Continue to Stripe Checkout.

Rules:

* A theme may appear only once.
* Archived/unpublished themes cannot be added.
* Ownership is rechecked before checkout.
* Price and availability are refreshed before session creation.
* If a price changes, the updated total must be shown before payment.

### 6.4 Checkout

1. The customer clicks Checkout.
2. The API authenticates the customer and verifies account status.
3. The API reloads themes and prices from MongoDB.
4. Ownership, publication status, and prices are validated.
5. The API creates a Stripe Checkout Session.
6. The customer completes payment on Stripe.
7. Stripe sends a signed webhook.
8. The API creates the paid order and entitlements.
9. The cart is cleared.
10. The success page polls the order status if fulfillment is still processing.

The purchase-page redirect must never fulfill an order. Only a verified Stripe webhook may confirm payment and grant downloads.

### 6.5 Purchases

The purchases page displays:

* Purchased theme.
* Order number.
* Purchase date.
* Purchased version.
* Downloads used.
* Downloads remaining.
* Download button.
* Link to order details.

### 6.6 Download

1. Customer requests a download.
2. API verifies authentication and account status.
3. API verifies ownership and asset availability.
4. MongoDB atomically increments the counter if it is below five.
5. API generates a short-lived S3 presigned GET URL.
6. API records a download event.
7. Customer receives the ZIP using an attachment filename.

Presigned URLs should expire after 60–120 seconds.

---

## 7. Admin experience

### 7.1 Dashboard

The dashboard supports these date presets:

* Today.
* Yesterday.
* Last seven days.
* Last 30 days.
* Last six calendar months.
* Last 12 months.
* Custom `from` and `to`.

Default reporting timezone is UTC. A configured business timezone may be added later.

Dashboard metrics:

* Paid order count.
* Gross revenue.
* Discount amount.
* Net sales.
* Average order value.
* Sales trend.
* Top-selling themes.
* Recent orders.
* Theme-level units and revenue.

Definitions:

| Metric              | Definition                                                |
| ------------------- | --------------------------------------------------------- |
| Order count         | Distinct successfully paid orders                         |
| Theme sales         | Paid units for a theme                                    |
| Gross revenue       | Sum of pre-discount paid item prices                      |
| Discount amount     | Discounts applied to paid orders                          |
| Net sales           | Captured total minus refunds when refund support is added |
| Average order value | Net sales divided by paid order count                     |

Analytics use `paidAt`, not order creation time.

### 7.2 User management

Admins can:

* List users.
* Search by name or email.
* Filter by role.
* Filter by account status.
* Sort or filter by joining date.
* View user details.
* Block accounts.
* Reactivate accounts.
* Change eligible roles.
* Paginate results.

Safeguards:

* An admin cannot block or demote their own account.
* The final active admin cannot be blocked or demoted.
* User changes are recorded in an audit log.

### 7.3 Theme management

Admins can create, view, update, archive, and publish themes.

Theme fields:

* Name.
* Slug.
* Short description.
* Full description.
* Technology stack.
* Features.
* Price in minor units.
* Currency.
* Version.
* Changelog.
* Setup instructions.
* Deployment instructions.
* Preview URL.
* Gallery images.
* Demo videos.
* Source ZIP file.
* Featured status.
* `draft`, `published`, or `archived` status.
* SEO title and description.

A theme cannot be published unless it has:

* Valid name and slug.
* Description.
* Price and currency.
* At least one image.
* A valid preview URL.
* A processed, ready ZIP asset.
* At least one feature.
* At least one technology.

### 7.4 Theme sales

For every theme, admins can see:

* Number of paid orders.
* Units sold.
* Gross sales.
* Discount amount.
* Net sales.
* Date-filtered performance.
* Recent customers and orders.

### 7.5 Promotions and event email

Admins can select active customers, enter offer copy and a call-to-action, and send a branded promotion email. Actual promotion codes, eligibility rules, and discounts are configured and applied only in Stripe. The same admin page can send welcome, invoice, refund, and promotion templates to a specified address using dummy data.

The system also sends a welcome email on a customer's first login, a PDF invoice after a verified successful payment, and a refund confirmation after Stripe confirms a full refund.

---

## 8. Functional requirements

| ID        | Requirement                        | Priority | Acceptance condition                                           |
| --------- | ---------------------------------- | -------: | -------------------------------------------------------------- |
| AUTH-001  | Authenticate with email/password or Google | Must | API rejects protected requests without a valid access cookie |
| AUTH-002  | Enforce customer/admin RBAC        |     Must | Customer receives `403` from every admin endpoint              |
| AUTH-003  | Block and reactivate users         |     Must | Blocked user cannot cart, checkout, or download                |
| CAT-001   | List published themes              |     Must | Draft and archived themes are excluded                         |
| CAT-002   | View theme details                 |     Must | Page includes features, media, stack, price, and preview       |
| CAT-003   | Search, filter, sort, paginate     |     Must | Query parameters return deterministic results                  |
| CART-001  | Add/remove cart items              |     Must | Duplicate items are rejected                                   |
| CART-002  | Reject already-owned themes        |     Must | Owned theme returns `409 THEME_ALREADY_OWNED`                  |
| CART-003  | Revalidate cart before checkout    |     Must | Changed prices and unavailable products are detected           |
| PAY-001   | Create Stripe Checkout Session     |     Must | Session uses server-calculated prices                          |
| PAY-002   | Verify Stripe webhook signature    |     Must | Invalid signatures receive `400`                               |
| PAY-003   | Fulfill payment idempotently       |     Must | Replaying an event creates no duplicate order                  |
| PAY-004   | Handle delayed payment fulfillment |     Must | Success page shows pending and polls order state               |
| DL-001    | Create private download URL        |     Must | Only an eligible owner receives a short-lived URL              |
| DL-002    | Enforce five-download maximum      |     Must | Sixth concurrent or sequential request is rejected             |
| DL-003    | Record download event              |     Must | Every issued URL has an auditable event                        |
| ADM-001   | Manage users                       |     Must | Admin can search, filter, block, and activate                  |
| ADM-002   | Manage orders                      |     Must | Admin can inspect payment and order details                    |
| ADM-003   | Manage themes                      |     Must | Admin can create, edit, publish, and archive                   |
| MEDIA-001 | Upload images, videos, and ZIP     |     Must | Type, size, authorization, and status are validated            |
| MEDIA-002 | Optimize images with Sharp         |     Must | Metadata is stripped and optimized variants created            |
| MEDIA-003 | Show upload state                  |     Must | UI displays preparing, uploading, processing, ready, or failed |
| EMAIL-001 | Send event-specific email          |     Must | Welcome, invoice, refund, and promotion templates are distinct |
| EMAIL-002 | Send selected promotions           |     Must | Only selected active customers receive the admin-authored offer |
| ANA-001   | Dashboard date filtering           |     Must | All metrics use the same selected interval                     |
| ANA-002   | Track sales per theme              |     Must | Units and paid totals match order-item aggregation             |
| AUD-001   | Audit sensitive admin actions      |   Should | Actor, action, target, and timestamp are stored                |

---

## 9. Pages and routes

### Public and customer routes

| Route                      | Purpose                                |
| -------------------------- | -------------------------------------- |
| `/`                        | Landing page and featured themes       |
| `/themes`                  | Searchable theme catalog               |
| `/themes/:slug`            | Theme details                          |
| `/cart`                    | Shopping cart                          |
| `/sign-in`                 | Email/password or Google sign-in       |
| `/sign-up`                 | Email/password or Google registration  |
| `/purchase`                | Purchases and payment fulfillment polling |
| `/checkout/cancel`         | Cancelled checkout                     |
| `/account/purchases`       | Owned themes and downloads             |
| `/account/orders/:orderId` | Customer order details                 |

### Admin routes

| Route                    | Purpose                         |
| ------------------------ | ------------------------------- |
| `/dashboard/insights`          | Analytics dashboard             |
| `/dashboard/themes`            | Theme list                      |
| `/dashboard/themes/new`        | Create theme                    |
| `/dashboard/themes/:themeId`   | Edit theme and view performance |
| `/dashboard/orders`            | Order management                |
| `/dashboard/orders/:orderId`   | Order details                   |
| `/dashboard/users`             | User management                 |
| `/dashboard/promotions`        | Promotion email composer        |

---

## 10. Data model

### User

```ts
{
  email: string;
  passwordHash?: string;
  googleId?: string;
  emailVerified: boolean;
  name: string;
  imageUrl?: string;
  role: "customer" | "admin";
  status: "active" | "blocked";
  joinedAt: Date;
  blockedAt?: Date;
  blockedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

* Unique lowercase email index.
* Sparse unique `googleId` index.
* `{ role: 1, status: 1 }`.
* `joinedAt`.

### Theme

```ts
{
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  stack: string[];
  features: string[];
  priceMinor: number;
  currency: string;
  version: string;
  changelog?: string;
  setupInstructions?: string;
  deployInstructions?: string;
  previewUrl: string;
  imageAssetIds: ObjectId[];
  videoAssetIds: ObjectId[];
  sourceAssetId: ObjectId;
  status: "draft" | "published" | "archived";
  featured: boolean;
  publishedAt?: Date;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

* Unique lowercase slug.
* `{ status: 1, publishedAt: -1 }`.
* Text index on name, description, and stack.

### Cart

```ts
{
  userId: ObjectId;
  items: [{
    themeId: ObjectId;
    addedAt: Date;
  }];
  updatedAt: Date;
}
```

Indexes:

* Unique `userId`.
* Unique theme IDs inside the cart must also be enforced by service logic.

### Order

```ts
{
  orderNumber: string;
  userId: ObjectId;
  status: "pending" | "paid" | "failed" | "refunded";
  paymentProvider: "stripe";
  stripeCheckoutSessionId: string;
  stripePaymentIntentId?: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  discountSnapshot?: {
    code: string;
    percentage: number;
  };
  items: [{
    themeId: ObjectId;
    name: string;
    slug: string;
    version: string;
    priceMinor: number;
    discountMinor: number;
    totalMinor: number;
    sourceAssetId: ObjectId;
  }];
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

* Unique `orderNumber`.
* Unique `stripeCheckoutSessionId`.
* Sparse unique `stripePaymentIntentId`.
* `{ userId: 1, createdAt: -1 }`.
* `{ status: 1, paidAt: -1 }`.

### Entitlement

```ts
{
  userId: ObjectId;
  themeId: ObjectId;
  orderId: ObjectId;
  orderItemId: ObjectId;
  purchasedVersion: string;
  sourceAssetId: ObjectId;
  downloadLimit: 5;
  downloadsUsed: number;
  status: "active" | "revoked";
  purchasedAt: Date;
  lastDownloadedAt?: Date;
}
```

Indexes:

* Unique `{ userId: 1, themeId: 1 }`.
* `{ userId: 1, purchasedAt: -1 }`.

The entitlement references the purchased source version. Replacing a theme ZIP must not silently modify previous customers’ purchased artifact unless this is an explicit product policy.

### UploadAsset

```ts
{
  kind: "image" | "video" | "theme_zip";
  status: "pending" | "uploading" | "processing" | "ready" | "failed";
  bucket: string;
  key: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  checksum?: string;
  variants?: [{
    format: string;
    key: string;
    width?: number;
    height?: number;
    sizeBytes: number;
  }];
  uploadedBy: ObjectId;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Additional collections

* `DownloadEvent`: entitlement, user, IP hash, user-agent summary, timestamp, result.
* `StripeWebhookEvent`: unique Stripe event ID and processing status.
* `AuditLog`: admin actor, action, resource, before/after summary, timestamp.

---

## 11. API design

Base path:

```text
/api/v1
```

### Public themes

| Method | Endpoint        | Purpose                             |
| ------ | --------------- | ----------------------------------- |
| GET    | `/themes`       | List/search/filter published themes |
| GET    | `/themes/:slug` | Get published theme details         |

### Cart and checkout

| Method | Endpoint               | Purpose                        |
| ------ | ---------------------- | ------------------------------ |
| GET    | `/cart`                | Get current cart               |
| POST   | `/cart/items`          | Add a theme                    |
| DELETE | `/cart/items/:themeId` | Remove a theme                 |
| POST   | `/checkout/sessions`   | Create Stripe Checkout Session |

### Purchases

| Method | Endpoint                     | Purpose                          |
| ------ | ---------------------------- | -------------------------------- |
| GET    | `/orders`                    | List customer orders             |
| GET    | `/orders/:orderId`           | View owned order                 |
| GET    | `/orders/:orderId/invoice`   | Download paid-order invoice PDF  |
| GET    | `/entitlements`              | List purchased themes            |
| POST   | `/entitlements/:id/download` | Generate authorized download URL |

### Webhooks

| Method | Endpoint           | Purpose                                    |
| ------ | ------------------ | ------------------------------------------ |
| POST   | `/webhooks/stripe` | Process verified Stripe events             |
| POST   | `/auth/register`   | Register with email and password            |
| POST   | `/auth/login`      | Sign in with email and password              |
| POST   | `/auth/google`     | Verify a Google ID token and sign in         |
| POST   | `/auth/refresh`    | Rotate the refresh session                   |
| POST   | `/auth/logout`     | Revoke the current refresh session           |

The Stripe route must receive the raw request body before JSON parsing.

### Admin

| Method | Endpoint                      | Purpose                    |
| ------ | ----------------------------- | -------------------------- |
| GET    | `/admin/analytics`            | Dashboard metrics          |
| GET    | `/admin/analytics/themes`     | Theme-level sales          |
| GET    | `/admin/users`                | List/search/filter users   |
| PATCH  | `/admin/users/:id/status`     | Block or activate          |
| PATCH  | `/admin/users/:id/role`       | Change role                |
| GET    | `/admin/orders`               | List orders                |
| GET    | `/admin/orders/:id`           | Order details              |
| GET    | `/admin/orders/:id/invoice`   | Download paid-order invoice |
| POST   | `/admin/themes`               | Create theme               |
| PATCH  | `/admin/themes/:id`           | Update theme               |
| POST   | `/admin/themes/:id/publish`   | Publish theme              |
| DELETE | `/admin/themes/:id`           | Archive theme              |
| POST   | `/admin/emails/promotions`    | Send a selected promotion campaign |
| POST   | `/admin/emails/test`          | Send a template with dummy data |
| POST   | `/admin/uploads`              | Initialize upload          |
| POST   | `/admin/uploads/:id/parts`    | Sign multipart parts       |
| POST   | `/admin/uploads/:id/complete` | Finalize upload            |
| DELETE | `/admin/uploads/:id`          | Cancel abandoned upload    |

### Pagination envelope

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 120,
    "totalPages": 6
  }
}
```

### Error envelope

```json
{
  "type": "https://api.example.com/problems/theme-already-owned",
  "title": "Theme already owned",
  "status": 409,
  "code": "THEME_ALREADY_OWNED",
  "detail": "You already own this theme.",
  "requestId": "req_123",
  "errors": []
}
```

---

## 12. Stripe payment fulfillment

The webhook handler must:

1. Verify the Stripe signature.
2. Claim the event using a unique `stripeEventId`.
3. Return safely if it was already processed.
4. Load the internal pending checkout reference.
5. Validate payment status and expected currency/amount.
6. Create or transition the order to `paid`.
7. Create entitlements using unique indexes.
8. Send the idempotent invoice email with its PDF attachment.
9. Clear purchased cart items.
10. Mark the webhook event processed.

Use MongoDB transactions when deployed on a replica set.

If transactions are temporarily unavailable, every write must remain idempotent through unique indexes, upserts, and explicit processing states.

Relevant events:

* `checkout.session.completed`.
* `checkout.session.async_payment_succeeded`.
* `checkout.session.async_payment_failed`.
* `checkout.session.expired`.
* `charge.refunded`, `refund.created`, and `refund.updated` for successful full refunds.

---

## 13. S3 upload and delivery

### Default limits

| Asset          |      Maximum | Processing                      |
| -------------- | -----------: | ------------------------------- |
| Image          |  10 MB input | Sharp optimization              |
| Video          |       250 MB | Direct/multipart upload         |
| Theme ZIP      |       100 MB | Private direct/multipart upload |
| Gallery images | 12 per theme | Configurable                    |
| Demo videos    |  3 per theme | Configurable                    |

### Image processing

Sharp must:

* Auto-rotate based on orientation.
* Strip unnecessary metadata.
* Resize oversized images.
* Generate responsive variants.
* Generate WebP and/or AVIF with JPEG fallback.
* Reject invalid or decompression-bomb-like images.

Multer should use memory storage only for small image-processing requests and enforce strict file and body limits.

### ZIP and video upload

Large ZIP and video files should not pass through Express in production.

Recommended flow:

1. Admin initializes the upload.
2. Server validates authorization and metadata.
3. Server returns presigned S3 upload information.
4. Browser uploads directly to S3.
5. Admin completes the multipart upload.
6. Server verifies object metadata and checksum.
7. Asset enters processing/scanning.
8. Asset becomes `ready` or `failed`.

Required checks:

* Sanitized filenames and generated S3 keys.
* Extension and MIME validation.
* Magic-byte/file-signature validation.
* ZIP traversal detection.
* Archive expansion-size and file-count limits.
* Malware scanning before publication.
* Server-side encryption.
* S3 Block Public Access for source ZIPs.
* Lifecycle cleanup for abandoned uploads.

### Upload progress

The project must use `fetch` only. Browser `fetch` does not offer broadly reliable upload byte-progress events.

Therefore:

* Multipart uploads display progress based on completed parts.
* Small single uploads may show an indeterminate progress state.
* Cancellation uses `AbortController`.
* Failed parts can be retried.
* Axios and `XMLHttpRequest` must not be introduced only for progress reporting.

---

## 14. Frontend data hook

A reusable custom hook should support typed data, loading, errors, cancellation, and manual execution.

```ts
type UseApiState<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  execute: (
    input?: RequestInit,
  ) => Promise<T | null>;
  reset: () => void;
};
```

A shared `apiFetch` wrapper should:

* Use native `fetch`.
* Send `access_token` and `refresh_token` cookies with `credentials: "include"`.
* Refresh once after a `401`, then retry the original request.
* Set JSON headers.
* Parse the standardized error format.
* Validate responses with Zod.
* Accept an `AbortSignal`.
* Avoid automatically retrying non-idempotent requests.
* Handle `401`, `403`, `409`, `422`, and `429` consistently.

---

## 15. Rate limiting

Use a Redis-backed distributed store in production. An in-memory store is acceptable only for local development.

| Operation              |                            Suggested limit |
| ---------------------- | -----------------------------------------: |
| Public catalog         |                     120 requests/minute/IP |
| Authenticated API      | 60 requests/minute/user plus IP protection |
| Cart mutations         |                    60 requests/minute/user |
| Checkout creation      |                 5 requests/10 minutes/user |
| Checkout IP protection |                        20 requests/hour/IP |
| Email template testing |                20 requests/minute/admin |
| Download generation    |                10 requests/10 minutes/user |
| Admin mutations        |                     60 requests/hour/admin |
| Upload initialization  |                     20 requests/hour/admin |

The Stripe webhook should not use a generic user limiter. Protect it with:

* Signature verification.
* Event-ID deduplication.
* Strict body-size limits.
* Endpoint-level monitoring.

A successful response should include rate-limit headers where practical. Rejections return `429 RATE_LIMITED`.

---

## 16. Security requirements

* Verify access JWTs and load the current user and role from MongoDB on the server.
* Hash passwords with bcrypt and store only refresh-token hashes.
* Rotate refresh tokens, revoke sessions on logout/block/delete, and detect token reuse.
* Enforce admin role and active status server-side.
* Use property allowlists to prevent mass assignment.
* Validate params, queries, bodies, and responses using Zod.
* Configure Helmet.
* Apply a strict CORS allowlist.
* Protect cookie-based flows against CSRF if cookies are used.
* Verify Stripe signatures using the raw body.
* Use Stripe idempotency keys.
* Deduplicate webhook events.
* Keep S3 source assets private.
* Never return internal S3 keys for source files.
* Use short-lived presigned download URLs.
* Force safe `Content-Disposition` filenames.
* Validate external preview URLs to reduce phishing and SSRF risks.
* Render plain text or sanitized Markdown for descriptions.
* Prevent MongoDB operator injection.
* Limit request and upload sizes.
* Scan ZIP files for malware and archive bombs.
* Encrypt S3 objects at rest.
* Store secrets in deployment secrets management.
* Redact tokens, signatures, URLs, and sensitive PII from logs.
* Record sensitive admin operations in an audit log.
* Use TLS everywhere.

---

## 17. Admin seed script

Because Google owns authentication credentials, `seed.ts` must not create or store an admin password.

Required environment inputs:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace_with_a_strong_unique_password
```

The seed should:

1. Initialize the application database.
2. Upsert the MongoDB user by `ADMIN_EMAIL`.
3. Set `role: "admin"` and `status: "active"`.
4. Hash `ADMIN_PASSWORD`; optionally link the same verified email on Google sign-in.
5. Never log credentials or secrets.
6. Be safe to execute multiple times.

Admin credentials come from deployment environment variables and are never hard-coded in source control.

---

## 18. Standard application errors

* `AUTH_REQUIRED`
* `FORBIDDEN`
* `ACCOUNT_BLOCKED`
* `VALIDATION_ERROR`
* `THEME_NOT_FOUND`
* `THEME_UNAVAILABLE`
* `THEME_ALREADY_OWNED`
* `CART_EMPTY`
* `CART_CHANGED`
* `CHECKOUT_CONFLICT`
* `PAYMENT_PENDING`
* `ORDER_NOT_FOUND`
* `ENTITLEMENT_NOT_FOUND`
* `DOWNLOAD_LIMIT_REACHED`
* `ASSET_NOT_READY`
* `UPLOAD_TOO_LARGE`
* `UNSUPPORTED_FILE_TYPE`
* `RATE_LIMITED`
* `INTERNAL_ERROR`

---

## 19. Important edge cases

| Scenario                                       | Expected behavior                                               |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Price changes while in cart                    | Checkout is stopped and customer sees the new total             |
| Theme archived during checkout                 | Do not create a new session; already-paid orders are fulfilled  |
| Stripe webhook replay                          | Return success without creating duplicate records               |
| Two webhooks process together                  | Unique indexes and transaction prevent duplication              |
| Duplicate Checkout sessions                    | Only one entitlement can be created                             |
| Purchase redirect arrives before webhook       | Show payment-processing state and poll                          |
| Account blocked after payment                  | Order remains recorded; download policy requires admin decision |
| Fifth and sixth downloads arrive together      | Atomic condition permits only one if four were already used     |
| Theme ZIP is updated                           | Existing entitlement uses purchased asset/version by default    |
| Upload succeeds but finalization fails         | Asset remains non-publishable and can be retried                |
| Theme already owned                            | Remove/reject it and link to purchases                          |
| Theme has prior sales                          | Archive instead of hard delete                                  |

---

## 20. Critical acceptance scenarios

### Successful purchase

```gherkin
Given an active customer has an unpublished ownership state
And the cart contains a published theme
When Stripe confirms successful payment
Then exactly one paid order is created
And exactly one entitlement is created
And the purchased cart item is removed
And the theme appears in the customer's purchases
```

### Duplicate purchase prevention

```gherkin
Given the customer already owns a theme
When the customer attempts to add it to the cart or checkout
Then the API responds with 409 THEME_ALREADY_OWNED
And no Checkout Session is created
```

### Download concurrency

```gherkin
Given an entitlement has four downloads used
When two download requests execute concurrently
Then exactly one request receives a URL
And the other receives DOWNLOAD_LIMIT_REACHED
And downloadsUsed equals five
```

### Webhook replay

```gherkin
Given a Stripe event has already been processed
When Stripe sends the same event again
Then the API returns a successful response
And no duplicate order, entitlement, invoice email, or refund email is created
```

### Blocked customer

```gherkin
Given a customer's status is blocked
When they attempt checkout or download
Then the API returns 403 ACCOUNT_BLOCKED
And no Checkout Session or presigned URL is created
```

### Theme publication

```gherkin
Given an admin-created theme has valid metadata and ready assets
When the admin publishes it
Then it becomes visible in the public catalog

Given its ZIP is missing or still processing
When publication is requested
Then publication is rejected with ASSET_NOT_READY
```

### Analytics filter

```gherkin
Given paid orders inside and outside a selected date range
When the admin selects a dashboard range
Then every KPI and theme result uses paidAt within the same range
And order totals are not double-counted
```

---

## 21. Non-functional requirements

### Performance

* Catalog API p95 response under 500 ms under normal load.
* Admin list endpoints must be paginated.
* Catalog images must use responsive optimized variants.
* Theme pages should lazy-load videos and non-primary images.
* Use database indexes matching search and analytics patterns.
* Avoid loading ZIP/video objects through Express.

### Accessibility

Target WCAG 2.2 AA:

* Keyboard-accessible navigation.
* Visible focus states.
* Form labels and accessible errors.
* Sufficient contrast.
* Alt text for theme screenshots.
* Reduced-motion support.
* Accessible tables, dialogs, and upload status.

### SEO

* Crawlable theme pages.
* Unique title and meta description.
* Open Graph metadata.
* Canonical URLs.
* Structured product data where appropriate.
* Generated sitemap containing published themes.

### Reliability and observability

* Structured logs containing request IDs.
* Error tracking.
* Stripe webhook failure alerts.
* Upload processing alerts.
* Download-denial metrics.
* Database backups.
* S3 object versioning for source assets.
* Health and readiness endpoints.

---

## 22. Testing strategy

### Unit tests

* Zod schemas.
* Pricing calculations.
* Email template rendering and escaping.
* Permission policies.
* Download-limit logic.
* Date-range calculation.
* Filename and S3-key sanitization.

### Integration tests

* JWT cookie-protected routes and refresh-token rotation.
* MongoDB unique indexes.
* Atomic download update.
* Cart revalidation.
* Stripe webhook processing.
* Webhook replay.
* Stripe promotion reconciliation and full-refund handling.
* S3 presigning.
* Admin role and status mutations.

### End-to-end tests

* Browse to purchase flow.
* Failed/cancelled checkout.
* Delayed webhook fulfillment.
* Purchased-theme state.
* Five allowed downloads and sixth rejection.
* Admin theme creation and publication.
* User blocking.
* Analytics filters.

Playwright may be used for testing; the “fetch only” restriction applies to application HTTP code, not testing infrastructure.

### Security and load testing

* Authentication bypass attempts.
* NoSQL injection payloads.
* Malicious preview URLs.
* Invalid file signatures.
* ZIP traversal and archive bombs.
* Checkout and download rate limits.
* Concurrent webhook and download requests.

---

## 23. Environment variables

### Web

```env
VITE_BASE_URL=
VITE_GOOGLE_CLIENT_ID=
VITE_STRIPE_PUBLISHABLE_KEY=
```

### API

```env
NODE_ENV=
PORT=
CLIENT_URL=
MONGODB_URI=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=30
GOOGLE_CLIENT_ID=
ADMIN_EMAIL=
ADMIN_PASSWORD=
REDIS_URL=
```

### Stripe

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

### AWS

```env
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_MEDIA_BUCKET=
AWS_S3_PRIVATE_BUCKET=
AWS_CLOUDFRONT_URL=
S3_DOWNLOAD_URL_TTL_SECONDS=90
MAX_IMAGE_SIZE_MB=10
MAX_VIDEO_SIZE_MB=250
MAX_THEME_ZIP_SIZE_MB=100
```

Production should prefer workload roles or short-lived AWS credentials instead of permanent access keys.

---

## 24. Delivery milestones

| Milestone        | Scope                                                             |
| ---------------- | ----------------------------------------------------------------- |
| 1. Foundation    | Monorepo, React, Express, MongoDB, JWT cookies, Zod, errors     |
| 2. Catalog       | Theme model, catalog, details page, search and filters            |
| 3. Admin catalog | Theme CRUD, S3 uploads, Sharp processing, publication             |
| 4. Commerce      | Cart, Stripe Checkout promotions, webhook fulfillment             |
| 5. Ownership     | Purchases, entitlements, secure downloads, download limits        |
| 6. Operations    | Users, orders, theme sales, analytics and date filters            |
| 7. Hardening     | Rate limits, auditing, scanning, accessibility, SEO, load testing |
| 8. Release       | Monitoring, backups, production configuration and launch checks   |

---

## 25. Definition of Done

A feature is complete when:

* Requirements and edge cases are implemented.
* Zod validates all external inputs.
* Authentication and authorization are server-enforced.
* Loading, empty, success, and error states are implemented.
* Unit and integration tests pass.
* Critical flows have E2E coverage.
* Logs do not expose secrets or download URLs.
* API errors follow the standard envelope.
* Accessibility checks pass.
* Relevant audit events are recorded.
* Documentation and environment-variable examples are updated.
* Production monitoring is available.

---
