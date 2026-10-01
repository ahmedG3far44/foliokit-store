export type UserRole = "admin" | "customer";
export type UserStatus = "active" | "blocked";
export type UserProvider = "email" | "google" | "github" | "microsoft" | "apple" | "unknown";
export type TransactionStatus = "pending" | "success" | "declined";
export type PaymentProvider = "stripe" | "paypal" | "paymob";
export type BillingType = "subscription" | "one_time";
export type PlanDuration = "one_time" | "monthly" | "yearly" | "custom";

export interface IUser {
  id: string;
  email: string;
  provider: UserProvider;
  emailVerified: boolean;
  avatarUrl?: string;
  name: string;
  username?: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: string;
  welcomeEmailSentAt?: string;
  marketingOptOutAt?: string;
  joinedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type sizeType = "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";

export interface PlanType {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  currency: string;
  duration: PlanDuration;
  durationDays?: number;
  billingType: BillingType;
  features: string[];
  published: boolean;
  viral: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionType {
  id: string;
  userId: string;
  planId: PlanType | string;
  status: "active" | "canceled" | "trialing" | "expired";
  startDate: string;
  expirationDate?: string;
  provider?: string;
  externalSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionType {
  id: string;
  userId: IUser | string;
  planId?: PlanType | string;
  product?: { name: string; description?: string };
  provider: "stripe" | "paypal" | "paymob" | "manual";
  externalId?: string;
  amount: number;
  amountMinor?: number;
  currency: string;
  status: TransactionStatus;
  paidAt?: string;
  refundedAt?: string;
  refundAmountMinor?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type ThemeStatus = "draft" | "published" | "archived";
export type AssetKind = "image" | "video" | "theme_zip";
export type AssetStatus = "pending" | "uploading" | "processing" | "ready" | "failed";

export interface PublicAsset {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  originalName: string;
  contentType?: string;
  sizeBytes: number;
  url?: string;
  variants?: Array<{ format: string; url: string; width?: number; height?: number; sizeBytes: number }>;
}

export interface ThemeType {
  id: string;
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
  instructionsFormat?: "plain" | "html";
  previewUrl: string;
  previewAsset?: PublicAsset;
  images: PublicAsset[];
  videos: PublicAsset[];
  sourceAsset?: Pick<PublicAsset, "id" | "kind" | "status" | "originalName" | "sizeBytes">;
  status: ThemeStatus;
  featured: boolean;
  publishedAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  salesCount?: number;
  canPublish?: boolean;
  missingPublishRequirements?: string[];
  purchased?: boolean;
  canPurchase?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogResponse {
  items: ThemeType[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  stacks: string[];
}

export interface DiscountSnapshot {
  code: string;
  type?: "percentage" | "fixed";
  percentage?: number;
  percentageBps?: number;
  amountMinor?: number;
  currency?: string;
}

export interface DiscountType {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  percentageBps?: number;
  amountMinor?: number;
  currency?: string;
  usageLimit: number;
  timesUsed: number;
  expiresAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountQuote {
  code: string;
  type: "percentage" | "fixed";
  percentageBps?: number;
  amountMinor?: number;
  currency?: string;
  discountMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  taxPercentage?: number;
  taxStatus: "estimated" | "calculated_at_checkout";
  totalMinor: number;
  expiresAt: string;
}

export interface PaymentProviderOption {
  id: PaymentProvider;
  label: string;
  enabled: boolean;
  configured?: boolean;
  selected?: boolean;
  supportedCurrencies?: string[];
}

export interface PaymentSettingsType {
  enabledPaymentProviders: PaymentProvider[];
  providers: PaymentProviderOption[];
  paymobUsdToEgpRate?: number;
}

export interface CartType {
  items: Array<{ themeId: string; name: string; slug: string; priceMinor: number; currency: string; addedAt: string; previewAsset?: PublicAsset }>;
  subtotalMinor: number;
  taxMinor: number;
  taxPercentage?: number;
  taxStatus: "estimated" | "calculated_at_checkout";
  totalMinor: number;
  currency: string;
  updatedAt: string;
}

export type OrderStatus = "pending" | "paid" | "failed" | "refunded";
export interface OrderItemType {
  id?: string;
  themeId: string;
  name: string;
  slug: string;
  version: string;
  priceMinor: number;
  discountMinor: number;
  totalMinor: number;
}

export interface OrderType {
  id: string;
  orderNumber: string;
  userId: IUser | string;
  status: OrderStatus;
  paymentProvider: PaymentProvider;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentAmountMinor?: number;
  paymentCurrency?: string;
  paymentExchangeRate?: number;
  discountSnapshot?: DiscountSnapshot;
  customerSnapshot?: { name: string; email: string; phone?: string };
  regionSnapshot?: { country?: string; region?: string; city?: string; timezone?: string };
  items: OrderItemType[];
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementType {
  id: string;
  theme: Pick<ThemeType, "id" | "name" | "slug" | "shortDescription"> | null;
  orderId: string;
  purchasedVersion: string;
  downloadLimit: number;
  downloadsUsed: number;
  status: "active" | "revoked";
  purchasedAt: string;
  lastDownloadedAt?: string;
}

export interface PurchaseOverviewType {
  entitlements: EntitlementType[];
  orders: OrderType[];
}

export interface SiteContentType {
  privacyHtml: string;
  termsHtml: string;
  refundHtml: string;
  socials: {
    instagram: string;
    tiktok: string;
    youtube: string;
    linkedin: string;
  };
  updatedAt?: string;
}

// Stripe types:
export interface CheckoutItem {
  id: string;
  name: string;
  description?: string;

  /**
   * Amount in the smallest currency unit.
   *
   * $49.99 USD => 4999
   */
  unitAmount: number;

  quantity?: number;
}

export interface CreateCheckoutInput {
  items: CheckoutItem[];
  currency: string;
  customerEmail: string;

  successUrl: string;
  cancelUrl: string;

  orderId?: string;
  userId: string;
}
