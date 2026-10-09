import env from "./config/env.ts";
import UserModel from "./models/user.ts";
import CategoryModel from "./models/category.ts";
import ThemeModel from "./models/theme.ts";
import UploadAssetModel from "./models/upload-asset.ts";

import { seedImage, seedTemplateZip, seedTutorialMp4 } from "./utils/seed-assets.ts";
import { assertR2Configured, getR2Client } from "./config/r2.ts";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { connectDatabase, disconnectDatabase } from "./config/database.ts";
import bcrypt from "bcryptjs";
import type { Types } from "mongoose";

const seedThemes = [
  { name: "Aurora Studio", slug: "aurora-studio", color: "172033", accent: "F4B942", stack: ["React", "TypeScript", "Tailwind CSS"], priceMinor: 4900, shortDescription: "A luminous portfolio theme for independent design studios.", description: "A polished, responsive studio portfolio with project stories, services, testimonials, and a conversion-focused contact experience.", features: ["Responsive project grid", "Case study layouts", "Accessible navigation", "Dark mode"], featured: true },
  { name: "Northstar SaaS", slug: "northstar-saas", color: "102A43", accent: "5BC0EB", stack: ["React", "Vite", "TypeScript"], priceMinor: 5900, shortDescription: "A focused marketing site for ambitious software products.", description: "A modern SaaS launch theme with product storytelling, social proof, pricing sections, FAQs, and carefully designed conversion paths.", features: ["Pricing sections", "Feature comparisons", "Customer stories", "SEO-ready pages"], featured: true },
  { name: "Canvas Commerce", slug: "canvas-commerce", color: "2B1B17", accent: "F2D0A4", stack: ["Next.js", "TypeScript", "Tailwind CSS"], priceMinor: 6900, shortDescription: "An editorial storefront for considered products and brands.", description: "A refined commerce theme balancing product discovery, editorial collections, detailed product pages, and a calm shopping experience.", features: ["Editorial collections", "Product gallery", "Cart patterns", "Mobile storefront"], featured: false },
  { name: "Mono Journal", slug: "mono-journal", color: "111111", accent: "F5F5F5", stack: ["Astro", "MDX", "CSS"], priceMinor: 3900, shortDescription: "A typographic publication theme built for thoughtful writing.", description: "A fast, minimal journal with long-form typography, topic archives, author pages, reading progress, and newsletter placement.", features: ["MDX articles", "Topic archives", "Reading progress", "RSS support"], featured: false },
  { name: "Signal Agency", slug: "signal-agency", color: "3B0D54", accent: "FF6B6B", stack: ["React", "Framer Motion", "TypeScript"], priceMinor: 6400, shortDescription: "A bold agency theme with expressive motion and strong case studies.", description: "An energetic creative agency theme with art-directed case studies, team profiles, capabilities, and restrained motion throughout.", features: ["Motion system", "Case study builder", "Team profiles", "Service pages"], featured: true },
  { name: "Field Notes", slug: "field-notes", color: "263A29", accent: "D8C4B6", stack: ["Next.js", "MDX", "TypeScript"], priceMinor: 4500, shortDescription: "A warm personal site for makers, writers, and researchers.", description: "A flexible personal website that brings projects, essays, notes, and an about page together in a quiet and approachable system.", features: ["Project archive", "Notes feed", "Writing templates", "Theme toggle"], featured: false },
] as const;

async function seedAsset(adminId: unknown, key: string, body: Buffer, kind: "image" | "video" | "theme_zip", contentType: string) {
  await getR2Client().send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: kind === "theme_zip" ? "private, no-store" : "public, max-age=3600" }), { abortSignal: AbortSignal.timeout(60_000) });
  return UploadAssetModel.findOneAndUpdate(
    { key },
    { $set: { kind, status: "ready", bucket: env.R2_BUCKET, originalName: key.split("/").pop(), contentType, sizeBytes: body.length, variants: [], uploadedBy: adminId }, $unset: { externalUrl: 1, errorCode: 1 } },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
}

async function seed() {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || !/[a-z]/.test(env.ADMIN_PASSWORD) || !/[A-Z]/.test(env.ADMIN_PASSWORD) || !/\d/.test(env.ADMIN_PASSWORD)) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters and include uppercase, lowercase, and a number");
  }
  assertR2Configured();
  const tutorialBody = await seedTutorialMp4();
  await connectDatabase();
  const name = env.ADMIN_NAME || "System Admin";
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const admin = await UserModel.findOneAndUpdate({ email }, { $set: { email, name, role: "admin", status: "active", joinedAt: new Date(), provider: "email", emailVerified: true, passwordHash }, $setOnInsert: { welcomeEmailState: "sent" }, $unset: { blockedAt: 1, blockedBy: 1, deletedAt: 1 } }, { returnDocument: "after", upsert: true, runValidators: true });
  console.log(`Admin login ready for ${admin.email}.`);
  const categorySeeds = [
    { name: "Creatives", slug: "creatives", description: "Expressive portfolios for designers, artists, and independent creators.", imageUrl: "https://placehold.co/800x600/172033/F4B942?text=Creatives" },
    { name: "Agencies", slug: "agencies", description: "Professional websites for studios, agencies, and service teams.", imageUrl: "https://placehold.co/800x600/3B0D54/FF6B6B?text=Agencies" },
    { name: "Developer's", slug: "developers", description: "Personal portfolios and software websites built for developers.", imageUrl: "https://placehold.co/800x600/102A43/5BC0EB?text=Developers" },
    { name: "E-commerce", slug: "e-commerce", description: "Considered storefronts for products, collections, and brands.", imageUrl: "https://placehold.co/800x600/2B1B17/F2D0A4?text=E-commerce" },
  ];
  const categoryIds = new Map<string, unknown>();
  for (const [sortOrder, category] of categorySeeds.entries()) {
    const image = await seedAsset(admin._id, `seed/categories/${category.slug}.png`, await seedImage({ ...category, color: "172033", accent: "F4B942", shortDescription: category.description }, "preview"), "image", "image/png");
    const saved = await CategoryModel.findOneAndUpdate({ slug: category.slug }, { $setOnInsert: { name: category.name, slug: category.slug, description: category.description, imageAssetId: image._id, sortOrder } }, { upsert: true, returnDocument: "after", runValidators: true });
    // Migrate the old remote placeholders without replacing admin images.
    await CategoryModel.updateOne({ _id: saved._id, imageUrl: category.imageUrl, imageAssetId: { $exists: false } }, { $set: { imageAssetId: image._id }, $unset: { imageUrl: 1 } });
    categoryIds.set(category.slug, saved._id);
  }
  const themeCategories: Record<string, string> = { "aurora-studio": "creatives", "northstar-saas": "developers", "canvas-commerce": "e-commerce", "mono-journal": "creatives", "signal-agency": "agencies", "field-notes": "developers" };
  console.log(`${categorySeeds.length} categories ready.`);
  for (const theme of seedThemes) {
    const [home, projects, preview, tutorial, source] = await Promise.all([
      seedImage(theme, "home").then((body) => seedAsset(admin._id, `seed/theme-media/${theme.slug}/home.png`, body, "image", "image/png")),
      seedImage(theme, "projects").then((body) => seedAsset(admin._id, `seed/theme-media/${theme.slug}/projects.png`, body, "image", "image/png")),
      seedImage(theme, "preview").then((body) => seedAsset(admin._id, `seed/theme-media/${theme.slug}/preview.png`, body, "image", "image/png")),
      seedAsset(admin._id, `seed/theme-media/${theme.slug}/tutorial.mp4`, tutorialBody, "video", "video/mp4"),
      seedAsset(admin._id, `seed/theme-sources/${theme.slug}.zip`, seedTemplateZip(theme), "theme_zip", "application/zip"),
    ]);
    await ThemeModel.findOneAndUpdate(
      { slug: theme.slug },
      { $setOnInsert: { ...theme, categoryId: categoryIds.get(themeCategories[theme.slug]), currency: "USD", version: "1.0.0", previewUrl: `https://example.com/themes/${theme.slug}`, previewAssetId: preview._id, imageAssetIds: [home._id, projects._id], videoAssetIds: [tutorial._id], sourceAssetId: source._id, status: "draft", salesCount: 0, createdBy: admin._id, setupInstructions: "Extract the ZIP, open index.html in a browser, and edit index.html and styles.css. This is a static HTML/CSS demo starter; replace it with the complete production package before selling.", deployInstructions: "Upload index.html and styles.css together to your static web host.", seoTitle: `${theme.name} website theme`, seoDescription: theme.shortDescription } },
      { upsert: true, runValidators: true },
    );
    const existing = await ThemeModel.findOne({ slug: theme.slug }).lean();
    if (!existing) throw new Error(`Theme missing after seed: ${theme.slug}`);
    const existingImages = await UploadAssetModel.find({ _id: { $in: existing.imageAssetIds } }).select("+key").lean();
    const customImages = existing.imageAssetIds.filter((id: Types.ObjectId) => existingImages.some((asset) => String(asset._id) === String(id) && !asset.key.startsWith("seed/")));
    const images = [...customImages];
    for (const asset of [home, projects]) if (images.length < 2) images.push(asset._id);
    await ThemeModel.updateOne({ _id: existing._id }, { $set: {
      imageAssetIds: customImages.length >= 2 ? existing.imageAssetIds : images,
      ...(!existing.categoryId ? { categoryId: categoryIds.get(themeCategories[theme.slug]) } : {}),
      ...(!existing.previewAssetId ? { previewAssetId: preview._id } : {}),
      ...(!existing.videoAssetIds.length ? { videoAssetIds: [tutorial._id] } : {}),
      ...(!existing.sourceAssetId ? { sourceAssetId: source._id } : {}),
    } });
  }
  console.log(`${seedThemes.length} demo themes ready: 2 gallery PNGs, a preview PNG, a tutorial MP4, and a working HTML/CSS template ZIP per theme. Existing publishing status and custom assets are preserved.`);
}

seed().catch((error) => { console.error("Seed failed:", error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);
