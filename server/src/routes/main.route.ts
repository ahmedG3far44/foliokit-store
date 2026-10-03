import { Router } from "express";

import userRoutes from "./user.route.ts"
import authRoutes from "./auth.route.ts";
import adminRoutes from "./admin.route.ts";
import themeRoutes from "./theme.route.ts";
import cartRoutes from "./cart.route.ts";
import orderRoutes from "./order.route.ts";
import contentRoutes from "./content.route.ts";
import adminMarketplaceRoutes from "./admin-marketplace.route.ts";
import emailRoutes from "./email.route.ts";
import unsubscribeRoutes from "./unsubscribe.route.ts";
const router = Router();

router.use("/users", userRoutes);
router.use("/auth", authRoutes);
router.use("/admin/emails", emailRoutes);
router.use("/emails", unsubscribeRoutes);
router.use("/admin", adminMarketplaceRoutes);
router.use("/admin", adminRoutes);
router.use("/themes", themeRoutes);
router.use("/cart", cartRoutes);
router.use("/", contentRoutes);
router.use("/", orderRoutes);

export default router;
