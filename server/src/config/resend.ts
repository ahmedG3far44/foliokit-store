import { Resend } from "resend";
import env from "./env.ts";

let resendClient: Resend | undefined;

export function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured");
  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

