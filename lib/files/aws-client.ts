import {
  type StorageConfig,
  getStorageConfig,
  getTeamStorageConfigById,
} from "@/ee/features/storage/config";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";

export const getS3Client = (storageRegion?: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = getStorageConfig(storageRegion);

  return new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region,
    // ponytail: SDK default WHEN_SUPPORTED adds x-amz-checksum-crc32 to
    // presigned PUT URLs, which breaks R2's CORS preflight. WHEN_REQUIRED
    // restores pre-3.729 behavior. Flip back if you move off R2 to real S3.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const getS3ClientForTeam = async (teamId: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = await getTeamStorageConfigById(teamId);

  return new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region,
    // ponytail: SDK default WHEN_SUPPORTED adds x-amz-checksum-crc32 to
    // presigned PUT URLs, which breaks R2's CORS preflight. WHEN_REQUIRED
    // restores pre-3.729 behavior. Flip back if you move off R2 to real S3.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const getLambdaClient = (storageRegion?: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = getStorageConfig(storageRegion);

  return new LambdaClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const getLambdaClientForTeam = async (teamId: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = await getTeamStorageConfigById(teamId);

  return new LambdaClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

/**
 * Gets both S3 client and storage config for a team in a single call.
 * This is more efficient than calling getS3ClientForTeam and getTeamStorageConfigById separately.
 *
 * @param teamId - The team ID
 * @returns Promise<{ client: S3Client, config: StorageConfig }> - Both client and config
 */
export const getTeamS3ClientAndConfig = async (teamId: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = await getTeamStorageConfigById(teamId);

  const client = new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region,
    // ponytail: SDK default WHEN_SUPPORTED adds x-amz-checksum-crc32 to
    // presigned PUT URLs, which breaks R2's CORS preflight. WHEN_REQUIRED
    // restores pre-3.729 behavior. Flip back if you move off R2 to real S3.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return { client, config };
};
