import { Router } from "express";
import { idSchema, parseOrThrow } from "../schemas/marketplace.ts";
import { localMediaFile } from "../services/upload.service.ts";

const router = Router();

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idSchema, req.params);
    const requestedVariant = typeof req.query.variant === "string" ? Number(req.query.variant) : undefined;
    const variant = requestedVariant !== undefined && Number.isInteger(requestedVariant) && requestedVariant >= 0 && requestedVariant <= 1
      ? requestedVariant
      : undefined;
    const media = await localMediaFile(id, variant);
    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.sendFile(media.path);
  } catch (error) {
    next(error);
  }
});

export default router;
