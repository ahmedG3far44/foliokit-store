import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import env from "../config/env.ts";
import RefreshSessionModel from "../models/refresh-session.ts";
import { AppError } from "../utils/app-error.ts";

const ISSUER = "foliokit-api";
const AUDIENCE = "foliokit-client";
const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

interface TokenClaims extends JwtPayload {
  sub: string;
  type: "access" | "refresh";
  jti?: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieBase() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

function verifyToken(token: string, secret: string, expectedType: TokenClaims["type"]): TokenClaims {
  try {
    const payload = jwt.verify(token, secret, { issuer: ISSUER, audience: AUDIENCE }) as TokenClaims;
    if (!payload.sub || payload.type !== expectedType) throw new Error("Invalid token claims");
    return payload;
  } catch {
    throw new AppError(401, "AUTH_SESSION_REQUIRED", "Your session is missing or expired. Sign in and try again");
  }
}

function requestMetadata(req: Request) {
  return {
    userAgent: req.get("user-agent")?.slice(0, 300),
    ip: req.ip?.slice(0, 100),
  };
}

export function verifyAccessToken(token: string): TokenClaims {
  return verifyToken(token, env.JWT_ACCESS_SECRET, "access");
}

export async function issueSession(userId: string, req: Request, res: Response): Promise<void> {
  const jti = randomUUID();
  const accessToken = jwt.sign({ type: "access" }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    jwtid: randomUUID(),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
  const refreshToken = jwt.sign({ type: "refresh" }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    jwtid: jti,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await RefreshSessionModel.create({ userId, jti, tokenHash: hashToken(refreshToken), expiresAt, ...requestMetadata(req) });
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase(), path: "/", maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60_000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieBase(), path: "/api/v1/auth", maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: "/api/v1/auth" });
}

export async function rotateSession(req: Request, res: Response): Promise<string> {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw new AppError(401, "REFRESH_TOKEN_REQUIRED", "Your session has expired. Sign in again");
  const claims = verifyToken(token, env.JWT_REFRESH_SECRET, "refresh");
  const session = await RefreshSessionModel.findOne({ jti: claims.jti, tokenHash: hashToken(token) });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    clearSessionCookies(res);
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Your session has expired. Sign in again");
  }
  if (session.revokedAt) {
    await revokeAllUserSessions(String(session.userId));
    clearSessionCookies(res);
    throw new AppError(401, "REFRESH_TOKEN_REUSED", "This session is no longer valid. Sign in again");
  }
  session.revokedAt = new Date();
  const replacementJti = randomUUID();
  session.replacedByJti = replacementJti;
  await session.save();

  const userId = claims.sub;
  const accessToken = jwt.sign({ type: "access" }, env.JWT_ACCESS_SECRET, {
    subject: userId, jwtid: randomUUID(), issuer: ISSUER, audience: AUDIENCE, expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
  const refreshToken = jwt.sign({ type: "refresh" }, env.JWT_REFRESH_SECRET, {
    subject: userId, jwtid: replacementJti, issuer: ISSUER, audience: AUDIENCE, expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
  await RefreshSessionModel.create({ userId, jti: replacementJti, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000), ...requestMetadata(req) });
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase(), path: "/", maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60_000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieBase(), path: "/api/v1/auth", maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
  return userId;
}

export async function revokeCurrentSession(req: Request): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) return;
  await RefreshSessionModel.updateOne({ tokenHash: hashToken(token), revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await RefreshSessionModel.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}
