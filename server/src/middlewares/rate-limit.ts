import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error.ts";

const buckets = new Map<string, { count: number; resetsAt: number }>();

export function rateLimit(name: string, limit: number, windowMs: number, useUser = false) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = useUser ? req.currentUser?.id : null;
    const key = `${name}:${userId ?? req.ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) bucket = { count: 0, resetsAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetsAt / 1000)));
    if (bucket.count > limit) return next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
    next();
  };
}
