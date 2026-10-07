import { createHash } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { QueryFilter } from "mongoose";
import { getR2Client, getR2SigningDate } from "../config/r2.ts";
import EntitlementModel, { type EntitlementDocument } from "../models/entitlement.ts";
import OrderModel, { type OrderDocument } from "../models/order.ts";
import { DownloadEventModel } from "../models/operations.ts";
import { AppError } from "../utils/app-error.ts";

import env from "../config/env.ts";
import UserModel from "../models/user.ts";
import UploadAssetModel from "../models/upload-asset.ts";

function serializeOrder(order: OrderDocument & { _id: unknown }) {
  return { id: String(order._id), orderNumber: order.orderNumber, userId: String(order.userId), status: order.status, paymentProvider: order.paymentProvider, currency: order.currency, subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor, taxMinor: order.taxMinor ?? 0, totalMinor: order.totalMinor, paymentAmountMinor: order.paymentAmountMinor, paymentCurrency: order.paymentCurrency, paymentExchangeRate: order.paymentExchangeRate, discountSnapshot: order.discountSnapshot, customerSnapshot: order.customerSnapshot, regionSnapshot: order.regionSnapshot, items: order.items.map((item) => ({ id: String(item._id), themeId: String(item.themeId), name: item.name, slug: item.slug, version: item.version, priceMinor: item.priceMinor, discountMinor: item.discountMinor, totalMinor: item.totalMinor })), paidAt: order.paidAt, refundedAt: order.refundedAt, refundAmountMinor: order.refundAmountMinor, createdAt: order.createdAt, updatedAt: order.updatedAt };
}

export async function listOrdersForUser(userId: unknown) { return (await OrderModel.find({ userId }).sort({ createdAt: -1 }).lean()).map((item) => serializeOrder(item as OrderDocument & { _id: unknown })); }
export async function getOrderForUser(userId: unknown, id: string) { const order = await OrderModel.findOne({ _id: id, userId }).lean(); if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found"); return serializeOrder(order as OrderDocument & { _id: unknown }); }
export async function getOrderByStripeSessionForUser(userId: unknown, sessionId: string) { const order = await OrderModel.findOne({ stripeCheckoutSessionId: sessionId, userId }).lean(); if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found"); return serializeOrder(order as OrderDocument & { _id: unknown }); }

export async function listPurchases(userId: unknown) {
  const rows = await EntitlementModel.find({ userId }).populate("themeId", "name slug shortDescription imageAssetIds").sort({ purchasedAt: -1 }).lean();
  return rows.map((row) => { const theme = row.themeId as unknown as { _id: unknown; name: string; slug: string; shortDescription: string }; return { id: String(row._id), theme: theme ? { id: String(theme._id), name: theme.name, slug: theme.slug, shortDescription: theme.shortDescription } : null, orderId: String(row.orderId), purchasedVersion: row.purchasedVersion, downloadsUsed: row.downloadsUsed, downloadLimit: row.downloadLimit, status: row.status, purchasedAt: row.purchasedAt, lastDownloadedAt: row.lastDownloadedAt }; });
}

export async function issueDownload(input: { entitlementId: string; userId: unknown; ip?: string; userAgent?: string }) {
  const entitlement = await EntitlementModel.findOneAndUpdate({ _id: input.entitlementId, userId: input.userId, status: "active", $expr: { $lt: ["$downloadsUsed", "$downloadLimit"] } }, { $inc: { downloadsUsed: 1 }, $set: { lastDownloadedAt: new Date() } }, { returnDocument: "before" }).lean<EntitlementDocument & { _id: unknown }>();
  const event = { entitlementId: input.entitlementId, userId: input.userId, ipHash: input.ip ? createHash("sha256").update(input.ip).digest("hex") : undefined, userAgent: input.userAgent?.slice(0, 300) };
  if (!entitlement) { await DownloadEventModel.create({ ...event, result: "denied" }); throw new AppError(409, "DOWNLOAD_LIMIT_REACHED", "No downloads remain for this purchase"); }
  const asset = await UploadAssetModel.findOne({ _id: entitlement.sourceAssetId, kind: "theme_zip", status: "ready" }).select("+bucket +key");
  if (!asset) {
    await EntitlementModel.updateOne({ _id: input.entitlementId }, { $inc: { downloadsUsed: -1 } });
    await DownloadEventModel.create({ ...event, result: "denied" });
    throw new AppError(503, "DOWNLOAD_UNAVAILABLE", "The download is temporarily unavailable");
  }
  const url = await getSignedUrl(getR2Client(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: asset.key, ResponseContentDisposition: `attachment; filename="${asset.originalName.replaceAll('"', "")}"` }), { expiresIn: env.R2_DOWNLOAD_URL_TTL_SECONDS, signingDate: await getR2SigningDate() });
  await DownloadEventModel.create({ ...event, result: "issued" });
  return { url, expiresInSeconds: env.R2_DOWNLOAD_URL_TTL_SECONDS, downloadsUsed: entitlement.downloadsUsed + 1, downloadLimit: entitlement.downloadLimit };
}

export async function listAdminOrders(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1), pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const filter: QueryFilter<OrderDocument> = {};
  if (query.status) filter.status = String(query.status) as OrderDocument["status"];
  if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: new Date(String(query.from)) } : {}), ...(query.to ? { $lte: new Date(`${String(query.to)}T23:59:59.999`) } : {}) };
  if (query.search) { const regex = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); const users = await UserModel.find({ $or: [{ name: regex }, { email: regex }] }).select("_id").lean(); filter.$or = [{ orderNumber: regex }, { userId: { $in: users.map((user) => user._id) } }]; }
  const [items, total] = await Promise.all([OrderModel.find(filter).populate("userId", "name email avatarUrl").sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(), OrderModel.countDocuments(filter)]);
  return { items: items.map((item) => ({ ...serializeOrder(item as OrderDocument & { _id: unknown }), user: item.userId })), page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminOrder(id: string) { const order = await OrderModel.findById(id).populate("userId", "name email phone avatarUrl provider").lean(); if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found"); return { ...serializeOrder(order as OrderDocument & { _id: unknown }), user: order.userId }; }

export function analyticsWindow(period: "day" | "week" | "month" | "six_months" | "year", from?: string, to?: string, now = new Date()) {
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date(now);
  const start = from ? new Date(`${from}T00:00:00.000`) : new Date(end);
  if (!from) {
    if (period === "day") start.setHours(0, 0, 0, 0);
    else if (period === "week") start.setDate(start.getDate() - 6);
    else if (period === "month") start.setDate(start.getDate() - 29);
    else if (period === "six_months") start.setMonth(start.getMonth() - 6);
    else start.setFullYear(start.getFullYear() - 1);
  }
  return { start, end };
}

export async function marketplaceInsights(period: "day" | "week" | "month" | "six_months" | "year", from?: string, to?: string) {
  const { start, end } = analyticsWindow(period, from, to);
  const [summary, series, popular, totalUsers, newUsers] = await Promise.all([
    OrderModel.aggregate([{ $match: { status: "paid", paidAt: { $gte: start, $lte: end } } }, { $group: { _id: null, revenueMinor: { $sum: "$totalMinor" }, totalSales: { $sum: { $size: "$items" } }, orders: { $sum: 1 } } }]),
    OrderModel.aggregate([{ $match: { status: "paid", paidAt: { $gte: start, $lte: end } } }, { $group: { _id: { $dateToString: { format: period === "day" ? "%Y-%m-%d %H:00" : period === "six_months" || period === "year" ? "%Y-%m" : "%Y-%m-%d", date: "$paidAt" } }, revenueMinor: { $sum: "$totalMinor" }, sales: { $sum: { $size: "$items" } }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    OrderModel.aggregate([{ $match: { status: "paid" } }, { $unwind: "$items" }, { $group: { _id: "$items.themeId", name: { $first: "$items.name" }, sales: { $sum: 1 }, revenueMinor: { $sum: "$items.totalMinor" } } }, { $sort: { sales: -1 } }, { $limit: 5 }]),
    UserModel.countDocuments(), UserModel.countDocuments({ joinedAt: { $gte: start, $lte: end } }),
  ]);
  return { period, from: start, to: end, totalUsers, newUsers, revenueMinor: summary[0]?.revenueMinor ?? 0, totalSales: summary[0]?.totalSales ?? 0, orders: summary[0]?.orders ?? 0, sales: series.map((row) => ({ label: row._id, revenueMinor: row.revenueMinor, sales: row.sales, orders: row.orders })), viralThemes: popular.map((row) => ({ id: String(row._id), name: row.name, sales: row.sales, revenueMinor: row.revenueMinor })) };
}

export async function themeSales(from?: string, to?: string) {
  const range = from || to ? { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(`${to}T23:59:59.999`) } : {}) } : undefined;
  return OrderModel.aggregate([{ $match: { status: "paid", ...(range ? { paidAt: range } : {}) } }, { $unwind: "$items" }, { $group: { _id: "$items.themeId", name: { $first: "$items.name" }, slug: { $first: "$items.slug" }, sales: { $sum: 1 }, revenueMinor: { $sum: "$items.totalMinor" } } }, { $sort: { revenueMinor: -1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, slug: 1, sales: 1, revenueMinor: 1 } }]);
}
