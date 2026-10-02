import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import env from "./config/env.ts";
import { connectDatabase, disconnectDatabase } from "./config/database.ts";
import { getR2Client } from "./config/r2.ts";
import { getResendClient } from "./config/resend.ts";
import { emailConfigurationIssues } from "./services/email.service.ts";
import { verifyPaypalCredentials } from "./services/paypal.service.ts";
import { verifyStripeCredentials } from "./services/stripe.service.ts";

async function verifyDatabase(): Promise<void> {
  await connectDatabase();
  if (!mongoose.connection.db) throw new Error("MongoDB connected without an active database");
  await mongoose.connection.db.admin().ping();
  console.log("MongoDB Atlas connection verified.");
}

async function verifyR2Upload(): Promise<void> {
  const client = getR2Client();
  const key = `.deployment-check/${randomUUID()}`;
  let uploadId: string | undefined;
  try {
    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: "application/octet-stream",
    }));
    if (!created.UploadId) throw new Error("R2 did not return a multipart upload ID");
    uploadId = created.UploadId;

    const body = Buffer.from("foliokit-production-storage-check");
    const uploaded = await client.send(new UploadPartCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: 1,
      Body: body,
      ContentLength: body.length,
    }));
    if (!uploaded.ETag) throw new Error("R2 did not return an ETag for the test upload");

    await client.send(new CompleteMultipartUploadCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [{ ETag: uploaded.ETag, PartNumber: 1 }] },
    }));
    uploadId = undefined;

    const downloaded = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    const bytes = await downloaded.Body?.transformToByteArray();
    if (!bytes || Buffer.compare(Buffer.from(bytes), body) !== 0) throw new Error("R2 returned different data from the test upload");
    console.log("Cloudflare R2 multipart upload and download verified.");
  } finally {
    if (uploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket: env.R2_BUCKET, Key: key, UploadId: uploadId })).catch(() => undefined);
    }
    await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key })).catch(() => undefined);
  }
}

async function verifyEmailDelivery(): Promise<void> {
  const result = await getResendClient().emails.send({
    from: env.EMAIL_FROM_ACCOUNT,
    to: ["delivered@resend.dev"],
    replyTo: env.EMAIL_REPLY_TO,
    subject: "Foliokit production deployment check",
    text: "This automated message verifies the production Resend API key and sender domain.",
  }, { idempotencyKey: `deployment-preflight/${process.env.DEPLOYMENT_ID ?? "manual"}` });
  if (result.error) throw new Error(result.error.message || "Resend test delivery failed");
  if (!result.data?.id) throw new Error("Resend returned no delivery identifier");
  console.log("Resend API key and sender domain verified with a test delivery.");
}

async function main(): Promise<void> {
  const emailIssues = emailConfigurationIssues();
  if (emailIssues.length) throw new Error(`Email configuration is invalid: ${emailIssues.join("; ")}`);
  await verifyEmailDelivery();

  await verifyDatabase();
  await verifyR2Upload();
  await verifyStripeCredentials();
  console.log("Stripe live credentials and webhook verified.");
  await verifyPaypalCredentials();
  console.log("PayPal live credentials and webhook verified.");
}

main()
  .then(async () => {
    await disconnectDatabase();
    console.log("Production integration preflight passed.");
  })
  .catch(async (error) => {
    console.error("Production integration preflight failed:", error instanceof Error ? error.message : String(error));
    await disconnectDatabase().catch(() => undefined);
    process.exitCode = 1;
  });
