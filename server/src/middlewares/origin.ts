import type { NextFunction, Request, Response } from "express";
import env from "../config/env.ts";
import { AppError } from "../utils/app-error.ts";

const trustedOrigins = new Set(env.CLIENT_URL.split(",").map((value) => value.trim().replace(/\/$/, "")));

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin || trustedOrigins.has(origin.replace(/\/$/, ""))) return next();
  next(new AppError(403, "UNTRUSTED_ORIGIN", "This request origin is not allowed"));
}
