import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";

const COVER_WIDTH = 1600;
const COVER_HEIGHT = 480;
const MAX_INPUT_PIXELS = 30_000_000;
const DATABASE_ID_SEGMENT = "(?:[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})";
const COVER_KEY_PATTERN = new RegExp(`^profile-covers/(${DATABASE_ID_SEGMENT})/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\\.webp$`, "i");
const LOCAL_UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

export function profileCoverKey(userId: string, id = randomUUID()): string {
  if (!new RegExp(`^${DATABASE_ID_SEGMENT}$`, "i").test(userId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
    throw AppError.badRequest("Invalid profile cover identifier");
  }
  return `profile-covers/${userId}/${id}.webp`;
}

export function safeProfileCoverPath(key: string, root = LOCAL_UPLOADS_ROOT): string | null {
  if (!COVER_KEY_PATTERN.test(key)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, key);
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

export async function normalizeProfileCover(input: Buffer): Promise<Buffer> {
  if (!input.length || input.length > 5 * 1024 * 1024) {
    throw AppError.badRequest("Cover image must be 5MB or smaller");
  }
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)
      || !metadata.width || !metadata.height || metadata.width < 600 || metadata.height < 200) {
      throw AppError.badRequest("Use a landscape JPEG, PNG, or WebP image of at least 600 × 200 pixels");
    }
    return await image.rotate().resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest("The cover image could not be processed");
  }
}

function r2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT!,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
}

export const profileCoverStorage = {
  async save(userId: string, image: Buffer): Promise<string> {
    const key = profileCoverKey(userId);
    if (env.STORAGE_PROVIDER === "r2") {
      await r2Client().send(new PutObjectCommand({
        Bucket: env.R2_BUCKET!, Key: key, Body: image, ContentType: "image/webp",
        CacheControl: "public, max-age=300",
      }));
      return key;
    }
    const localPath = safeProfileCoverPath(key);
    if (!localPath) throw AppError.internal();
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, image, { flag: "wx" });
    return key;
  },

  async remove(key: string): Promise<void> {
    if (!COVER_KEY_PATTERN.test(key)) return;
    if (env.STORAGE_PROVIDER === "r2") {
      await r2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
      return;
    }
    const localPath = safeProfileCoverPath(key);
    if (localPath) await fs.unlink(localPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },

  async publicLocation(key: string): Promise<{ kind: "local"; path: string } | { kind: "redirect"; url: string }> {
    if (!COVER_KEY_PATTERN.test(key)) throw AppError.notFound("Cover image not found");
    if (env.STORAGE_PROVIDER === "r2") {
      const url = await getSignedUrl(
        r2Client(),
        new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }),
        { expiresIn: Math.min(env.R2_SIGNED_URL_TTL_SECONDS, 300) },
      );
      return { kind: "redirect", url };
    }
    const localPath = safeProfileCoverPath(key);
    if (!localPath) throw AppError.notFound("Cover image not found");
    return { kind: "local", path: localPath };
  },
};
