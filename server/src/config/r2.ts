import env from "./env.ts";
import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

function hasRealValue(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && !/^(?:replace[_-]?me|change[_-]?me|your[_-].*|example)$/i.test(normalized);
}

export function isR2Configured(): boolean {
  return [env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET].every(hasRealValue);
}

export function assertR2Configured(): void {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 is not configured. Set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET");
  }
}

export function getR2Client(): S3Client {
  assertR2Configured();
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}
