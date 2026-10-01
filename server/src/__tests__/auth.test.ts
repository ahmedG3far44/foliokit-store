import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import env from "../config/env.ts";
import { loginSchema, registerSchema } from "../schemas/auth.ts";
import { verifyAccessToken } from "../services/token.service.ts";

test("registration accepts a strong password and normalizes email", () => {
  const result = registerSchema.parse({ name: "Test User", email: "  USER@Example.COM ", password: "StrongPass123" });
  assert.equal(result.email, "user@example.com");
});

test("registration rejects weak passwords and role assignment", () => {
  assert.equal(registerSchema.safeParse({ name: "Test User", email: "user@example.com", password: "weakpass" }).success, false);
  assert.equal(registerSchema.safeParse({ name: "Test User", email: "user@example.com", password: "StrongPass123", role: "admin" }).success, false);
});

test("login errors cannot be used to send oversized password payloads", () => {
  assert.equal(loginSchema.safeParse({ email: "user@example.com", password: "x".repeat(129) }).success, false);
});

test("access verification rejects refresh tokens", () => {
  const access = jwt.sign({ type: "access" }, env.JWT_ACCESS_SECRET, { subject: "64b64c16e3a54f0012345671", issuer: "foliokit-api", audience: "foliokit-client", expiresIn: "5m" });
  const refresh = jwt.sign({ type: "refresh" }, env.JWT_ACCESS_SECRET, { subject: "64b64c16e3a54f0012345671", issuer: "foliokit-api", audience: "foliokit-client", expiresIn: "5m" });
  assert.equal(verifyAccessToken(access).sub, "64b64c16e3a54f0012345671");
  assert.throws(() => verifyAccessToken(refresh), /session is missing or expired/i);
});
