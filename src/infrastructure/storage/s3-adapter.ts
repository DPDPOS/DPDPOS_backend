import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { s3Config } from "../../config/s3.config.js";
import { logger } from "../logging/logger.js";

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.accessKey,
        secretAccessKey: s3Config.secretKey,
      },
    });
  }
  return s3Client;
}

export async function ensureEvidenceBucket(): Promise<void> {
  const client = getS3Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: s3Config.bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: s3Config.bucket }));
      logger.info({ bucket: s3Config.bucket }, "s3.bucket_created");
    } catch (err) {
      logger.warn({ err, bucket: s3Config.bucket }, "s3.bucket_ensure_failed");
    }
  }
}
