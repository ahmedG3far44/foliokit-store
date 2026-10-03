import type { Request, Response } from "express";

export async function paymobWebhookHandler(_req: Request, res: Response): Promise<void> {
  res.status(404).json({ code: "PROVIDER_DISABLED", detail: "Paymob payment integration is disabled" });
}
