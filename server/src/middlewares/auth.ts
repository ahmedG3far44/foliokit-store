import type { NextFunction, Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import UserModel, { type UserDocument } from "../models/user.ts";
import { verifyAccessToken } from "../services/token.service.ts";
import { AppError, errors } from "../utils/app-error.ts";

declare global {
  namespace Express {
    interface Request { currentUser?: HydratedDocument<UserDocument> }
  }
}

function authenticationError(): AppError {
  return new AppError(401, "AUTH_SESSION_REQUIRED", "Your session is missing or expired. Sign in and try again");
}

export async function getOptionalAuthenticatedUser(req: Request): Promise<HydratedDocument<UserDocument> | null> {
  if (req.currentUser) return req.currentUser;
  const token = req.cookies?.access_token as string | undefined;
  if (!token) return null;
  try {
    const claims = verifyAccessToken(token);
    const user = await UserModel.findById(claims.sub);
    if (!user || user.status === "blocked" || user.deletedAt) return null;
    if (user.role === "user") {
      user.role = "customer";
      await user.save();
    }
    req.currentUser = user;
    return user;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!await getOptionalAuthenticatedUser(req)) return next(authenticationError());
    next();
  } catch (error) { next(error); }
}

export const requireDatabaseUser = requireAuth;

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.currentUser?.role !== "admin") return next(errors.forbidden());
  next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (req.currentUser?.role === "admin") {
    return next(new AppError(403, "ADMIN_PURCHASE_FORBIDDEN", "Administrator accounts cannot purchase themes"));
  }
  next();
}
