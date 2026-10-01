import { z } from "zod";

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(10).max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
}).strict();

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const googleLoginSchema = z.object({ credential: z.string().min(20).max(10_000) }).strict();
