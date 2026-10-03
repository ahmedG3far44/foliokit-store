import type { QueryFilter } from "mongoose";
import OrderModel from "../models/order.ts";
import TransactionModel, { type TransactionDocument } from "../models/transaction.ts";
import UserModel, { type UserDocument } from "../models/user.ts";
import type { TransactionStatus, UserProvider, UserRole, UserStatus } from "../lib/types.ts";


export type InsightPeriod = "day" | "week" | "month" | "six_months" | "year";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pageValue = (value: unknown, fallback: number) => Math.max(1, Number(value) || fallback);

function periodStart(period: InsightPeriod): Date {
  const date = new Date();
  if (period === "day") date.setHours(date.getHours() - 23, 0, 0, 0);
  if (period === "week") date.setDate(date.getDate() - 6), date.setHours(0, 0, 0, 0);
  if (period === "month") date.setDate(date.getDate() - 29), date.setHours(0, 0, 0, 0);
  if (period === "six_months") date.setMonth(date.getMonth() - 5, 1), date.setHours(0, 0, 0, 0);
  if (period === "year") date.setMonth(date.getMonth() - 11, 1), date.setHours(0, 0, 0, 0);
  return date;
}

function bucketKey(date: Date, period: InsightPeriod): string {
  if (period === "day") return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
  if (period === "six_months" || period === "year") return `${date.getFullYear()}-${date.getMonth()}`;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function bucketLabel(date: Date, period: InsightPeriod): string {
  if (period === "day") return date.toLocaleTimeString("en", { hour: "numeric" });
  if (period === "six_months" || period === "year") return date.toLocaleDateString("en", { month: "short" });
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function timeline(period: InsightPeriod, transactions: TransactionDocument[]) {
  const cursor = periodStart(period);
  const now = new Date();
  const points: Array<{ key: string; label: string; revenue: number; sales: number }> = [];
  while (cursor <= now) {
    points.push({ key: bucketKey(cursor, period), label: bucketLabel(cursor, period), revenue: 0, sales: 0 });
    if (period === "day") cursor.setHours(cursor.getHours() + 1);
    else if (period === "six_months" || period === "year") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const transaction of transactions) {
    const point = byKey.get(bucketKey(transaction.createdAt, period));
    if (point) {
      point.revenue += transaction.amount;
      point.sales += 1;
    }
  }
  return points.map(({ key: _key, ...point }) => point);
}

export async function getInsights(period: InsightPeriod) {
  const start = periodStart(period);
  const newUserStart = new Date();
  newUserStart.setDate(newUserStart.getDate() - 30);

  const [transactions, totalUsers, newUsers] = await Promise.all([
    TransactionModel.find({ status: "success", createdAt: { $gte: start } }).lean<TransactionDocument[]>(),
    UserModel.countDocuments(),
    UserModel.countDocuments({ createdAt: { $gte: newUserStart } }),
    TransactionModel.aggregate<{ _id: string; sales: number; revenue: number }>([
      { $match: { status: "success", planId: { $exists: true } } },
      { $group: { sales: { $sum: 1 }, revenue: { $sum: "$amount" } } },
      { $sort: { sales: -1 } },
      { $limit: 5 },
    ]),
  ]);

  return {
    period,
    totalUsers,
    newUsers,
    revenue: transactions.reduce((sum, item) => sum + item.amount, 0),
    totalSales: transactions.length,
    sales: timeline(period, transactions),
  };
}

export async function listUsers(query: Record<string, unknown>) {
  const page = pageValue(query.page, 1);
  const pageSize = Math.min(100, pageValue(query.pageSize, 10));
  const filter: QueryFilter<UserDocument> = {};
  if (query.search) {
    const search = new RegExp(escapeRegExp(String(query.search)), "i");
    filter.$or = [{ name: search }, { email: search }];
  }
  if (query.provider) filter.provider = query.provider as UserProvider;
  if (query.status) filter.status = query.status as UserStatus;
  if (query.role) filter.role = query.role as UserRole;
  if (query.marketingEligible === "true") filter.marketingOptOutAt = { $exists: false };

  const [items, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    UserModel.countDocuments(filter),
  ]);
  const orderStats = await OrderModel.aggregate<{ _id: { userId: unknown; currency: string }; totalOrders: number; totalSpentMinor: number }>([
    { $match: { userId: { $in: items.map((item) => item._id) }, status: "paid" } },
    { $group: {
      _id: { userId: "$userId", currency: "$currency" },
      totalOrders: { $sum: 1 },
      totalSpentMinor: { $sum: "$totalMinor" },
    } },
  ]);
  const metricsByUser = new Map<string, { totalOrders: number; spentByCurrency: Array<{ currency: string; amountMinor: number }> }>();
  for (const row of orderStats) {
    const userId = String(row._id.userId);
    const metrics = metricsByUser.get(userId) ?? { totalOrders: 0, spentByCurrency: [] };
    metrics.totalOrders += row.totalOrders;
    if (row.totalSpentMinor > 0) metrics.spentByCurrency.push({ currency: row._id.currency, amountMinor: row.totalSpentMinor });
    metricsByUser.set(userId, metrics);
  }
  return {
    items: items.map((item) => ({
      ...item,
      id: String(item._id),
      totalOrders: metricsByUser.get(String(item._id))?.totalOrders ?? 0,
      spentByCurrency: metricsByUser.get(String(item._id))?.spentByCurrency ?? [],
    })),
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function setUserStatus(id: string, status: UserStatus) {
  return UserModel.findByIdAndUpdate(id, status === "blocked" ? { status, blockedAt: new Date() } : { status, $unset: { blockedAt: 1, blockedBy: 1 } }, { returnDocument: "after", runValidators: true });
}

export async function setUserRole(id: string, role: UserRole) {
  return UserModel.findByIdAndUpdate(id, { role }, { returnDocument: "after", runValidators: true });
}

async function reconcileOrderTransactionStatuses() {
  const candidates = await TransactionModel.find({
    orderId: { $exists: true },
    status: { $ne: "success" },
  }).select("_id orderId status").lean();
  if (!candidates.length) return;

  const orders = await OrderModel.find({
    _id: { $in: candidates.map((transaction) => transaction.orderId) },
    status: { $in: ["paid", "failed"] },
  }).select("_id status paidAt").lean();
  const ordersById = new Map(orders.map((order) => [String(order._id), order]));
  const operations = candidates.flatMap((transaction) => {
    const order = transaction.orderId ? ordersById.get(String(transaction.orderId)) : undefined;
    if (!order) return [];
    const status: TransactionStatus = order.status === "paid" ? "success" : "declined";
    if (transaction.status === status) return [];
    return [{
      updateOne: {
        filter: { _id: transaction._id, status: transaction.status },
        update: {
          $set: {
            status,
            ...(status === "success" && order.paidAt ? { paidAt: order.paidAt } : {}),
          },
        },
      },
    }];
  });
  if (operations.length) await TransactionModel.bulkWrite(operations, { ordered: false });
}


export async function listTransactions(query: Record<string, unknown>) {
  // Repair historical rows created before order and transaction status updates were ordered.
  await reconcileOrderTransactionStatuses();
  const page = pageValue(query.page, 1);
  const pageSize = Math.min(100, pageValue(query.pageSize, 10));
  const filter: QueryFilter<TransactionDocument> = {};
  if (query.status) filter.status = query.status as TransactionStatus;
  if (query.from || query.to) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (query.from) range.$gte = new Date(String(query.from));
    if (query.to) { const to = new Date(String(query.to)); to.setHours(23, 59, 59, 999); range.$lte = to; }
    filter.createdAt = range;
  }
  if (query.search) {
    const search = new RegExp(escapeRegExp(String(query.search)), "i");
    const users = await UserModel.find({ $or: [{ name: search }, { email: search }] }).select("_id").lean();
    filter.userId = { $in: users.map((user) => user._id) };
  }
  const [items, total] = await Promise.all([
    TransactionModel.find(filter).populate("userId", "name email avatarUrl").populate("planId", "name slug").sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    TransactionModel.countDocuments(filter),
  ]);
  return { items, page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
