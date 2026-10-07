import type { Request } from "express";
import { Router } from "express";
import { getOptionalAuthenticatedUser } from "../middlewares/auth.ts";
import { catalogQuerySchema, parseOrThrow, slugSchema } from "../schemas/marketplace.ts";
import { getPublishedTheme, listPublishedThemes } from "../services/theme.service.ts";

const router = Router();
// Catalog responses contain expiring R2 signatures and user-specific ownership.
router.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
async function optionalUserId(req: Request): Promise<string | undefined> { const user = await getOptionalAuthenticatedUser(req); return user ? String(user._id) : undefined; }
router.get("/", async (req, res, next) => { try { res.json({ success: true, data: await listPublishedThemes(parseOrThrow(catalogQuerySchema, req.query), await optionalUserId(req)) }); } catch (error) { next(error); } });
router.get("/:slug", async (req, res, next) => { try { const { slug } = parseOrThrow(slugSchema, req.params); res.json({ success: true, data: await getPublishedTheme(slug, await optionalUserId(req)) }); } catch (error) { next(error); } });
export default router;
