import env from "./config/env.ts";

import { randomUUID } from "node:crypto";
import { AbortMultipartUploadCommand, CreateMultipartUploadCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "./config/r2.ts";

async function setupR2() {
  const origins = env.CLIENT_URL.split(",").map((value) => value.trim()).filter(Boolean);
  const client = getR2Client();
  const key = `.storage-check/${randomUUID()}`;
  const probe = await client.send(new CreateMultipartUploadCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: "application/octet-stream" }));
  if (!probe.UploadId) throw new Error("R2 did not create an upload session during the storage check");
  await client.send(new AbortMultipartUploadCommand({ Bucket: env.R2_BUCKET, Key: key, UploadId: probe.UploadId }));
  console.log("Cloudflare R2 object upload access verified.");

  await client.send(new PutBucketCorsCommand({
    Bucket: env.R2_BUCKET,
    CORSConfiguration: {
      CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }],
    },
  }));
  console.log(`Cloudflare R2 CORS configured for ${origins.join(", ")}`);
}

setupR2().catch((error) => {
  const detail = error && typeof error === "object"
    ? {
      name: "name" in error ? String(error.name) : "UnknownError",
      message: "message" in error ? String(error.message) : "No error message returned",
      code: "$metadata" in error && error.$metadata && typeof error.$metadata === "object" && "httpStatusCode" in error.$metadata
        ? String(error.$metadata.httpStatusCode)
        : undefined,
    }
    : { name: "UnknownError", message: String(error) };
  if (detail.name === "AccessDenied" && detail.code === "403") {
    console.error("R2 setup failed: the R2 credentials cannot manage bucket CORS. Run this command once with an R2 API token that has Admin Read & Write permission, then use a bucket-scoped Object Read & Write token at runtime.");
  } else {
    console.error("R2 setup failed:", detail);
  }
  process.exitCode = 1;
});
