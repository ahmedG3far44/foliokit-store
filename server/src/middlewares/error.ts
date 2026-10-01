import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AppError } from "../utils/app-error.ts";
import { ZodError } from "zod";

declare global {
  namespace Express { interface Request { requestId?: string } }
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.requestId = String(req.headers["x-request-id"] ?? randomUUID());
  res.setHeader("X-Request-Id", req.requestId);
  next();
}


export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, type: "about:blank", title: "Route not found", status: 404, code: "NOT_FOUND", detail: `Route not found: ${req.method} ${req.path}`, requestId: req.requestId, errors: [] });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const mongoError = error as { code?: number; keyPattern?: Record<string, unknown> };
  const appError = error instanceof AppError
    ? error
    : mongoError?.code === 11000
      ? new AppError(409, "DUPLICATE_RESOURCE", `A record with that ${Object.keys(mongoError.keyPattern ?? {})[0] ?? "value"} already exists`)
    : error instanceof ZodError
      ? new AppError(422, "VALIDATION_ERROR", "The request contains invalid data", error.issues)
      : new AppError(500, "INTERNAL_ERROR", "Unexpected server error");
  if (appError.status >= 500) console.error(JSON.stringify({ level: "error", requestId: _req.requestId, code: appError.code, message: error instanceof Error ? error.message : "Unknown error" }));
  res.status(appError.status).json({
    success: false,
    type: `https://api.local/problems/${appError.code.toLowerCase().replaceAll("_", "-")}`,
    title: appError.code.replaceAll("_", " ").toLowerCase(),
    status: appError.status,
    code: appError.code,
    detail: appError.message,
    requestId: _req.requestId,
    errors: appError.errors,
    ...appError.extras,
  });
}
