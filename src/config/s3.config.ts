import { env } from "./env.js";

export const s3Config = {
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
  bucket: env.S3_BUCKET,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
} as const;
