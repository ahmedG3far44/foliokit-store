import env from "./config/env.ts";
import UserModel from "./models/user.ts";
import ThemeModel from "./models/theme.ts";
import UploadAssetModel from "./models/upload-asset.ts";

import { getR2Client } from "./config/r2.ts";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { connectDatabase, disconnectDatabase } from "./config/database.ts";
import bcrypt from "bcryptjs";

const seedThemes = [
  { name: "Aurora Studio", slug: "aurora-studio", color: "172033", accent: "F4B942", stack: ["React", "TypeScript", "Tailwind CSS"], priceMinor: 4900, shortDescription: "A luminous portfolio theme for independent design studios.", description: "A polished, responsive studio portfolio with project stories, services, testimonials, and a conversion-focused contact experience.", features: ["Responsive project grid", "Case study layouts", "Accessible navigation", "Dark mode"], featured: true },
  { name: "Northstar SaaS", slug: "northstar-saas", color: "102A43", accent: "5BC0EB", stack: ["React", "Vite", "TypeScript"], priceMinor: 5900, shortDescription: "A focused marketing site for ambitious software products.", description: "A modern SaaS launch theme with product storytelling, social proof, pricing sections, FAQs, and carefully designed conversion paths.", features: ["Pricing sections", "Feature comparisons", "Customer stories", "SEO-ready pages"], featured: true },
  { name: "Canvas Commerce", slug: "canvas-commerce", color: "2B1B17", accent: "F2D0A4", stack: ["Next.js", "TypeScript", "Tailwind CSS"], priceMinor: 6900, shortDescription: "An editorial storefront for considered products and brands.", description: "A refined commerce theme balancing product discovery, editorial collections, detailed product pages, and a calm shopping experience.", features: ["Editorial collections", "Product gallery", "Cart patterns", "Mobile storefront"], featured: false },
  { name: "Mono Journal", slug: "mono-journal", color: "111111", accent: "F5F5F5", stack: ["Astro", "MDX", "CSS"], priceMinor: 3900, shortDescription: "A typographic publication theme built for thoughtful writing.", description: "A fast, minimal journal with long-form typography, topic archives, author pages, reading progress, and newsletter placement.", features: ["MDX articles", "Topic archives", "Reading progress", "RSS support"], featured: false },
  { name: "Signal Agency", slug: "signal-agency", color: "3B0D54", accent: "FF6B6B", stack: ["React", "Framer Motion", "TypeScript"], priceMinor: 6400, shortDescription: "A bold agency theme with expressive motion and strong case studies.", description: "An energetic creative agency theme with art-directed case studies, team profiles, capabilities, and restrained motion throughout.", features: ["Motion system", "Case study builder", "Team profiles", "Service pages"], featured: true },
  { name: "Field Notes", slug: "field-notes", color: "263A29", accent: "D8C4B6", stack: ["Next.js", "MDX", "TypeScript"], priceMinor: 4500, shortDescription: "A warm personal site for makers, writers, and researchers.", description: "A flexible personal website that brings projects, essays, notes, and an about page together in a quiet and approachable system.", features: ["Project archive", "Notes feed", "Writing templates", "Theme toggle"], featured: false },
] as const;

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createDemoZip(themeName: string): Buffer {
  const filename = Buffer.from("README.md");
  const data = Buffer.from(`# ${themeName}\n\nThis is seeded demonstration content. Replace this archive with the complete production theme package before accepting real purchases.\n`);
  const checksum = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28);
  const centralOffset = local.length + filename.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, data, central, filename, end]);
}

async function seedSourceAsset(adminId: unknown, theme: (typeof seedThemes)[number]) {
  if (!env.R2_BUCKET) return undefined;
  const key = `seed/theme-sources/${theme.slug}.zip`;
  const body = createDemoZip(theme.name);
  try {
    await getR2Client().send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: "application/zip", CacheControl: "private, no-store" }));
    return UploadAssetModel.findOneAndUpdate(
      { key },
      { $set: { kind: "theme_zip", status: "ready", bucket: env.R2_BUCKET, originalName: `${theme.slug}-demo.zip`, contentType: "application/zip", sizeBytes: body.length, variants: [], uploadedBy: adminId }, $unset: { externalUrl: 1, errorCode: 1 } },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
  } catch (error) {
    console.warn(`Could not upload the demo source ZIP for ${theme.name}:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function seed() {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || !/[a-z]/.test(env.ADMIN_PASSWORD) || !/[A-Z]/.test(env.ADMIN_PASSWORD) || !/\d/.test(env.ADMIN_PASSWORD)) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters and include uppercase, lowercase, and a number");
  }
  await connectDatabase();
  const name = env.ADMIN_NAME || "System Admin";
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const admin = await UserModel.findOneAndUpdate({ email }, { $set: { email, name, role: "admin", status: "active", joinedAt: new Date(), provider: "email", emailVerified: true, passwordHash }, $setOnInsert: { welcomeEmailState: "sent" }, $unset: { blockedAt: 1, blockedBy: 1, deletedAt: 1 } }, { returnDocument: "after", upsert: true, runValidators: true });
  console.log(`Admin login ready for ${admin.email}.`);
  for (const theme of seedThemes) {
    const imageUrl = `https://placehold.co/1200x800/${theme.color}/${theme.accent}?text=${encodeURIComponent(theme.name)}`;
    const asset = await UploadAssetModel.findOneAndUpdate(
      { key: `seed/placeholders/${theme.slug}.jpg` },
      { $set: { kind: "image", status: "ready", bucket: "external-placeholder", originalName: `${theme.slug}.jpg`, contentType: "image/jpeg", sizeBytes: 1, variants: [], externalUrl: imageUrl, uploadedBy: admin._id } },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    const source = await seedSourceAsset(admin._id, theme);
    await ThemeModel.findOneAndUpdate(
      { slug: theme.slug },
      { $setOnInsert: { ...theme, currency: "USD", version: "1.0.0", previewUrl: `https://example.com/themes/${theme.slug}`, imageAssetIds: [asset._id], videoAssetIds: [], ...(source ? { sourceAssetId: source._id } : {}), status: "draft", salesCount: 0, createdBy: admin._id, setupInstructions: "Seeded demonstration theme. Replace the demo source ZIP with the complete production package before accepting real purchases.", seoTitle: `${theme.name} website theme`, seoDescription: theme.shortDescription } },
      { upsert: true, runValidators: true },
    );
    await ThemeModel.updateOne({ slug: theme.slug, imageAssetIds: { $size: 0 } }, { $set: { imageAssetIds: [asset._id] } });
    if (source) await ThemeModel.updateOne({ slug: theme.slug, sourceAssetId: { $exists: false } }, { $set: { sourceAssetId: source._id } });
  }
  console.log(`${seedThemes.length} draft themes ready with placeholder images${env.R2_BUCKET ? " and demo source ZIPs in R2" : ""}.`);
  if (!env.R2_BUCKET) console.warn("R2_BUCKET is not configured. Source ZIPs remain optional and can be uploaded later.");
}

seed().catch((error) => { console.error("Seed failed:", error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);
