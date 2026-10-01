import { Router } from "express";
import UserModel from "../models/user.ts";
import { requireDatabaseUser } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rate-limit.ts";
import { googleLoginSchema, loginSchema, registerSchema } from "../schemas/auth.ts";
import { loginWithGoogle, loginWithPassword, registerWithPassword } from "../services/auth.service.ts";
import { clearSessionCookies, issueSession, revokeAllUserSessions, revokeCurrentSession, rotateSession } from "../services/token.service.ts";
import { AppError } from "../utils/app-error.ts";

const router = Router();

router.post("/register", rateLimit("auth-register", 5, 15 * 60_000), async (req, res, next) => {
  try {
    const user = await registerWithPassword(registerSchema.parse(req.body));
    await issueSession(String(user._id), req, res);
    res.status(201).json({ success: true, data: user });
  } catch (error) { next(error); }
});

router.post("/login", rateLimit("auth-login", 10, 15 * 60_000), async (req, res, next) => {
  try {
    const user = await loginWithPassword(loginSchema.parse(req.body));
    await issueSession(String(user._id), req, res);
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
});

router.post("/google", rateLimit("auth-google", 10, 15 * 60_000), async (req, res, next) => {
  try {
    const { credential } = googleLoginSchema.parse(req.body);
    const user = await loginWithGoogle(credential);
    await issueSession(String(user._id), req, res);
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
});

router.post("/refresh", rateLimit("auth-refresh", 30, 60_000), async (req, res, next) => {
  try {
    const userId = await rotateSession(req, res);
    const user = await UserModel.findById(userId);
    if (!user || user.deletedAt) {
      await revokeAllUserSessions(userId);
      clearSessionCookies(res);
      throw new AppError(401, "AUTH_SESSION_REQUIRED", "Your account is no longer available");
    }
    if (user.status === "blocked") {
      await revokeAllUserSessions(userId);
      clearSessionCookies(res);
      throw new AppError(403, "ACCOUNT_BLOCKED", "Your account has been blocked. Contact support.");
    }
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
});

router.post("/logout", async (req, res, next) => {
  try {
    await revokeCurrentSession(req);
    clearSessionCookies(res);
    res.json({ success: true, data: null });
  } catch (error) { next(error); }
});

router.get("/me", requireDatabaseUser, (req, res) => {
  res.json({ success: true, data: req.currentUser });
});

export default router;
