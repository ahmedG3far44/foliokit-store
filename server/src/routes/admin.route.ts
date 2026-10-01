
import SubscriptionModel from "../models/subscription.ts";
import TransactionModel from "../models/transaction.ts";
import UserModel from "../models/user.ts";
import CartModel from "../models/cart.ts";
import EntitlementModel from "../models/entitlement.ts";

import { Router } from "express";
import { requireAdmin, requireDatabaseUser } from "../middlewares/auth.ts";
import { audit } from "../services/audit.service.ts";
import { AppError } from "../utils/app-error.ts";
import { revokeAllUserSessions } from "../services/token.service.ts";

import {
  getInsights,
  listTransactions,
  listUsers,
  setUserRole,
  setUserStatus,
  type InsightPeriod,
} from "../services/admin.service.ts";

const router = Router();

router.use(requireDatabaseUser, requireAdmin);

router.get("/insights", async (req, res, next) => {
  try {
    const allowed: InsightPeriod[] = ["day", "week", "month", "six_months", "year"];
    const period = allowed.includes(req.query.period as InsightPeriod) ? req.query.period as InsightPeriod : "month";
    res.json({ success: true, data: await getInsights(period) });
  } catch (error) { next(error); }
});

router.get("/users", async (req, res, next) => {
  try { res.json({ success: true, data: await listUsers(req.query) }); } catch (error) { next(error); }
});

router.patch("/users/:id/status", async (req, res, next) => {
  try {
    if (!(["active", "blocked"] as const).includes(req.body.status)) throw new AppError(422, "VALIDATION_ERROR", "Invalid account status");
    if (String(req.currentUser?._id) === req.params.id && req.body.status === "blocked") throw new AppError(409, "SELF_ADMIN_CHANGE", "You cannot block your own account");
    const before = await UserModel.findById(req.params.id).lean();
    if (before?.role === "admin" && before.status === "active" && req.body.status === "blocked" && await UserModel.countDocuments({ role: "admin", status: "active" }) <= 1) throw new AppError(409, "LAST_ADMIN", "The final active administrator cannot be blocked");
    const user = await setUserStatus(req.params.id, req.body.status);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
    if (req.body.status === "blocked") await revokeAllUserSessions(String(user._id));
    await audit(req, `user.${req.body.status}`, "user", req.params.id, before, user.toObject());
    res.json({ success: true, data: user, message: `Account ${req.body.status}` });
  } catch (error) { next(error); }
});

router.patch("/users/:id/role", async (req, res, next) => {
  try {
    if (!(["admin", "customer"] as const).includes(req.body.role)) throw new AppError(422, "VALIDATION_ERROR", "Invalid role");
    if (String(req.currentUser?._id) === req.params.id && req.body.role !== "admin") throw new AppError(409, "SELF_ADMIN_CHANGE", "You cannot remove your own administrator role");
    const before = await UserModel.findById(req.params.id).lean();
    if (before?.role === "admin" && before.status === "active" && req.body.role === "customer" && await UserModel.countDocuments({ role: "admin", status: "active" }) <= 1) throw new AppError(409, "LAST_ADMIN", "The final active administrator cannot be demoted");
    const user = await setUserRole(req.params.id, req.body.role);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
    await audit(req, "user.role", "user", req.params.id, before, user.toObject());
    res.json({ success: true, data: user, message: "User role updated" });
  } catch (error) { next(error); }
});


router.delete("/users/:id", async (req, res, next) => {
  try {
    if (String(req.currentUser?._id) === req.params.id) throw new AppError(409, "SELF_ADMIN_CHANGE", "You cannot delete your own account");
    const user = await UserModel.findById(req.params.id).select("+passwordHash +googleId");
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
    if (user.role === "admin" && user.status === "active" && await UserModel.countDocuments({ role: "admin", status: "active" }) <= 1) throw new AppError(409, "LAST_ADMIN", "The final active administrator cannot be deleted");
    const before = user.toObject();
    await Promise.all([
      SubscriptionModel.deleteMany({ userId: user._id }),
      TransactionModel.deleteMany({ userId: user._id }),
      CartModel.deleteOne({ userId: user._id }),
      EntitlementModel.updateMany({ userId: user._id }, { status: "revoked" }),
      revokeAllUserSessions(String(user._id)),
    ]);
    user.name = "Deleted user"; user.email = `deleted-${String(user._id)}@local.invalid`; user.role = "customer"; user.status = "blocked"; user.deletedAt = new Date(); user.avatarUrl = undefined; user.username = undefined; user.passwordHash = undefined; user.googleId = undefined; await user.save();
    await audit(req, "user.delete", "user", req.params.id, before, { deletedAt: user.deletedAt });
    res.json({ success: true, data: null, message: "User access removed; financial records were retained" });
  } catch (error) { next(error); }
});

router.get("/transactions", async (req, res, next) => {
  try { res.json({ success: true, data: await listTransactions(req.query) }); } catch (error) { next(error); }
});

export default router;
