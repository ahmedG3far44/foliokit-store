import { Router } from "express";

const router = Router();
router.get("/:id", (_req, res) => {
  res.status(404).json({ code: "LOCAL_MEDIA_DISABLED", detail: "Local media storage is disabled" });
});

export default router;
