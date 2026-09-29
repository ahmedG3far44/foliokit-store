import sharp from "sharp";
import env from "../config/env.ts";
import UploadAssetModel from "../models/upload-asset.ts";

import { AppError } from "../utils/app-error.ts";
import { dirname, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, isR2Configured } from "../config/r2.ts";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, UploadPartCommand } from "@aws-sdk/client-s3";


const LOCAL_BUCKET = "local-development";
const localRoot = resolve(env.LOCAL_UPLOAD_DIR);

const types = {
  image: new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]),
  video: new Set(["video/mp4", "video/webm"]),
  theme_zip: new Set(["application/zip", "application/x-zip", "application/x-zip-compressed", "application/octet-stream"]),
};

type AssetKind = keyof typeof types;
type StoredAsset = {
  _id: unknown;
  kind: string;
  status: string;
  bucket?: string;
  key?: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  externalUrl?: string;
  variants?: Array<{ format: string; key?: string; width?: number; height?: number; sizeBytes: number }>;
};

function maximumBytes(kind: AssetKind): number {
  return (kind === "image" ? env.MAX_IMAGE_SIZE_MB : kind === "video" ? env.MAX_VIDEO_SIZE_MB : env.MAX_THEME_ZIP_SIZE_MB) * 1024 * 1024;
}

function folderForKind(kind: AssetKind): string {
  return kind === "image" ? "uploads/images" : kind === "video" ? "uploads/videos" : "uploads/themes";
}

function generateFileName(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${datetime}.${ext}`;
}

function localStorageEnabled(): boolean {
  return env.NODE_ENV !== "production" && !isR2Configured();
}

function localPath(key: string): string {
  const path = resolve(localRoot, key);
  if (path !== localRoot && !path.startsWith(`${localRoot}${sep}`)) throw new AppError(400, "INVALID_STORAGE_KEY", "The storage key is invalid");
  return path;
}

function localPartDirectory(assetId: string): string {
  return localPath(`.parts/${assetId}`);
}

function localMediaUrl(assetId: string, variantIndex?: number): string {
  const url = `${env.LOCAL_MEDIA_BASE_URL}/api/v1/media/${assetId}`;
  return variantIndex === undefined ? url : `${url}?variant=${variantIndex}`;
}

async function r2MediaUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(getR2Client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: env.R2_MEDIA_URL_TTL_SECONDS });
}

export async function serializeAsset(asset: StoredAsset) {
  const assetId = String(asset._id);
  const isLocal = asset.bucket === LOCAL_BUCKET;
  const canSignStoredMedia = isLocal || isR2Configured();
  const variants = await Promise.all((asset.variants ?? []).map(async (variant, index) => ({
    format: variant.format,
    url: variant.key && asset.bucket && canSignStoredMedia
      ? isLocal ? localMediaUrl(assetId, index) : await r2MediaUrl(asset.bucket, variant.key)
      : undefined,
    width: variant.width,
    height: variant.height,
    sizeBytes: variant.sizeBytes,
  })));
  const originalUrl = !asset.externalUrl && asset.kind !== "theme_zip" && asset.bucket && asset.key && canSignStoredMedia
    ? isLocal ? localMediaUrl(assetId) : await r2MediaUrl(asset.bucket, asset.key)
    : undefined;
  return {
    id: assetId,
    kind: asset.kind,
    status: asset.status,
    originalName: asset.originalName,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    variants,
    url: asset.kind !== "theme_zip" ? asset.externalUrl ?? variants[0]?.url ?? originalUrl : undefined,
  };
}

export async function initiateUpload(userId: unknown, input: { kind: AssetKind; originalName: string; contentType: string; sizeBytes: number; checksum?: string }) {
  if (!types[input.kind].has(input.contentType)) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "This file type is not allowed");
  if (input.kind === "theme_zip" && !input.originalName.toLowerCase().endsWith(".zip")) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Theme source must be a ZIP file");
  if (input.sizeBytes > maximumBytes(input.kind)) throw new AppError(413, "FILE_TOO_LARGE", `The file exceeds the ${Math.round(maximumBytes(input.kind) / 1024 / 1024)} MB limit`);

  const key = `${folderForKind(input.kind)}/${generateFileName(input.originalName)}`;
  if (localStorageEnabled()) {
    const uploadId = `local-${randomUUID()}`;
    const asset = await UploadAssetModel.create({ ...input, bucket: LOCAL_BUCKET, key, uploadId, uploadedBy: userId, status: "uploading" });
    await mkdir(localPartDirectory(String(asset._id)), { recursive: true });
    return { asset: await serializeAsset(asset), uploadId, partSizeBytes: 8 * 1024 * 1024 };
  }

  if (!isR2Configured()) throw new AppError(503, "STORAGE_UNAVAILABLE", "File storage is not configured. Add valid Cloudflare R2 credentials and restart the API");
  const result = await getR2Client().send(new CreateMultipartUploadCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: input.contentType, Metadata: input.checksum ? { checksum: input.checksum } : undefined }));
  if (!result.UploadId) throw new AppError(502, "UPLOAD_INIT_FAILED", "Storage did not create an upload session");
  const asset = await UploadAssetModel.create({ ...input, bucket: env.R2_BUCKET, key, uploadId: result.UploadId, uploadedBy: userId, status: "uploading" });
  return { asset: await serializeAsset(asset), uploadId: result.UploadId, partSizeBytes: 8 * 1024 * 1024 };
}

export async function uploadPart(assetId: string, userId: unknown, partNumber: number, body: Buffer): Promise<string> {
  const asset = await UploadAssetModel.findOne({ _id: assetId, uploadedBy: userId }).select("+bucket +key +uploadId");
  if (!asset || !asset.uploadId) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload session not found");
  if (!body.length) throw new AppError(400, "EMPTY_UPLOAD_PART", "The uploaded file part is empty");
  if (body.length > 8 * 1024 * 1024) throw new AppError(413, "UPLOAD_PART_TOO_LARGE", "The uploaded file part exceeds the 8 MB limit");

  if (asset.bucket === LOCAL_BUCKET) {
    const partPath = resolve(localPartDirectory(assetId), String(partNumber));
    await writeFile(partPath, body, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      await writeFile(partPath, body);
    });
    return `"local-${createHash("sha256").update(body).digest("hex")}"`;
  }

  const result = await getR2Client().send(new UploadPartCommand({ Bucket: asset.bucket, Key: asset.key, UploadId: asset.uploadId, PartNumber: partNumber, Body: body, ContentLength: body.length }));
  if (!result.ETag) throw new AppError(502, "UPLOAD_PART_FAILED", "Storage did not confirm the uploaded file part");
  return result.ETag;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  const candidate = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (!candidate?.transformToByteArray) throw new Error("Storage returned an unreadable object");
  return Buffer.from(await candidate.transformToByteArray());
}

async function processImage(assetId: string): Promise<void> {
  const asset = await UploadAssetModel.findById(assetId).select("+bucket +key");
  if (!asset) return;
  try {
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "processing" });
    const buffer = asset.bucket === LOCAL_BUCKET
      ? await readFile(localPath(asset.key))
      : await getR2Client().send(new GetObjectCommand({ Bucket: asset.bucket, Key: asset.key })).then((response) => streamToBuffer(response.Body));

    if (asset.contentType === "image/gif") {
      const metadata = await sharp(buffer, { animated: true, failOn: "error" }).metadata();
      if (metadata.format !== "gif") throw new Error("The uploaded file is not a GIF");
      await UploadAssetModel.updateOne({ _id: asset._id }, { status: "ready", variants: [], $unset: { errorCode: 1, uploadId: 1 } });
      return;
    }

    const image = sharp(buffer, { failOn: "error" }).rotate();
    const variants: Array<{ format: string; key: string; width?: number; height?: number; sizeBytes: number }> = [];
    for (const width of [640, 1280]) {
      const output = await image.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
      const variantKey = `uploads/images/${String(asset._id)}/${width}.webp`;
      if (asset.bucket === LOCAL_BUCKET) {
        const variantPath = localPath(variantKey);
        await mkdir(dirname(variantPath), { recursive: true });
        await writeFile(variantPath, output.data);
      } else {
        await getR2Client().send(new PutObjectCommand({ Bucket: asset.bucket, Key: variantKey, Body: output.data, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
      }
      variants.push({ format: "webp", key: variantKey, width: output.info.width, height: output.info.height, sizeBytes: output.info.size });
    }
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "ready", variants, $unset: { errorCode: 1, uploadId: 1 } });
  } catch (error) {
    console.error("Image processing failed", error);
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "failed", errorCode: "IMAGE_PROCESSING_FAILED" });
  }
}

async function completeLocalUpload(assetId: string, key: string, parts: Array<{ PartNumber: number }>): Promise<number> {
  const destination = localPath(key);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.alloc(0));
  for (const { PartNumber } of [...parts].sort((a, b) => a.PartNumber - b.PartNumber)) {
    const part = await readFile(resolve(localPartDirectory(assetId), String(PartNumber))).catch(() => {
      throw new AppError(422, "UPLOAD_PART_MISSING", `Upload part ${PartNumber} is missing`);
    });
    await appendFile(destination, part);
  }
  const info = await stat(destination);
  await rm(localPartDirectory(assetId), { recursive: true, force: true });
  return info.size;
}

export async function completeUpload(assetId: string, userId: unknown, parts: Array<{ ETag: string; PartNumber: number }>) {
  const asset = await UploadAssetModel.findOne({ _id: assetId, uploadedBy: userId }).select("+bucket +key +uploadId");
  if (!asset || !asset.uploadId) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload session not found");

  let uploadedSize: number | undefined;
  if (asset.bucket === LOCAL_BUCKET) {
    uploadedSize = await completeLocalUpload(assetId, asset.key, parts);
  } else {
    await getR2Client().send(new CompleteMultipartUploadCommand({ Bucket: asset.bucket, Key: asset.key, UploadId: asset.uploadId, MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) } }));
    const head = await getR2Client().send(new HeadObjectCommand({ Bucket: asset.bucket, Key: asset.key }));
    uploadedSize = head.ContentLength;
  }

  if (uploadedSize !== asset.sizeBytes) {
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "failed", errorCode: "SIZE_MISMATCH" });
    throw new AppError(422, "UPLOAD_SIZE_MISMATCH", "Uploaded file size does not match the declared size");
  }
  if (asset.kind === "image") await processImage(String(asset._id));
  else await UploadAssetModel.updateOne({ _id: asset._id }, { status: "ready", $unset: { uploadId: 1 } });
  const ready = await UploadAssetModel.findById(asset._id).select("+bucket +key +variants.key");
  if (!ready) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload not found");
  if (ready.status !== "ready") throw new AppError(422, "UPLOAD_PROCESSING_FAILED", "The image could not be processed. Choose a valid image and retry");
  return serializeAsset(ready);
}

export async function localMediaFile(assetId: string, variantIndex?: number): Promise<{ path: string; contentType: string }> {
  const asset = await UploadAssetModel.findOne({ _id: assetId, bucket: LOCAL_BUCKET, status: "ready", kind: { $ne: "theme_zip" } }).select("+bucket +key +variants.key");
  if (!asset) throw new AppError(404, "MEDIA_NOT_FOUND", "Media not found");
  const variant = variantIndex === undefined ? undefined : asset.variants[variantIndex];
  const key = variant?.key ?? asset.key;
  const path = localPath(key);
  await stat(path).catch(() => { throw new AppError(404, "MEDIA_NOT_FOUND", "Media file not found"); });
  return { path, contentType: variant ? "image/webp" : asset.contentType };
}

export async function cancelUpload(assetId: string, userId: unknown): Promise<void> {
  const asset = await UploadAssetModel.findOne({ _id: assetId, uploadedBy: userId }).select("+bucket +key +uploadId +variants.key");
  if (!asset) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload session not found");
  if (asset.bucket === LOCAL_BUCKET) {
    await Promise.all([
      rm(localPartDirectory(assetId), { recursive: true, force: true }),
      rm(localPath(asset.key), { force: true }),
      rm(localPath(`uploads/images/${assetId}`), { recursive: true, force: true }),
    ]);
  } else {
    if (asset.uploadId) await getR2Client().send(new AbortMultipartUploadCommand({ Bucket: asset.bucket, Key: asset.key, UploadId: asset.uploadId }));
    else await Promise.all([
      getR2Client().send(new DeleteObjectCommand({ Bucket: asset.bucket, Key: asset.key })),
      ...asset.variants.map((variant: { key?: string }) => variant.key
        ? getR2Client().send(new DeleteObjectCommand({ Bucket: asset.bucket, Key: variant.key }))
        : Promise.resolve()),
    ]);
  }
  await asset.deleteOne();
}
