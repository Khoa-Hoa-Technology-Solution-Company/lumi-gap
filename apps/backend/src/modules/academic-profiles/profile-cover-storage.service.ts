import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { cloudinaryPublicUrl, deleteCloudinaryAsset, uploadCloudinaryBuffer } from "../../infrastructure/cloudinary-storage.service.js";

const COVER_WIDTH = 1600;
const COVER_HEIGHT = 480;
const AVATAR_SIZE = 512;
const MAX_INPUT_PIXELS = 30_000_000;
const DATABASE_ID_SEGMENT = "(?:[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})";
const COVER_KEY_PATTERN = new RegExp(`^profile-covers/(${DATABASE_ID_SEGMENT})/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\\.webp$`, "i");
const AVATAR_KEY_PATTERN = new RegExp(`^profile-avatars/(${DATABASE_ID_SEGMENT})/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\\.webp$`, "i");
const LOCAL_UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

function cloudinaryImagePublicId(key: string): string {
  return key.replace(/\.webp$/i, "");
}

export function profileCoverKey(userId: string, id = randomUUID()): string {
  if (!new RegExp(`^${DATABASE_ID_SEGMENT}$`, "i").test(userId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
    throw AppError.badRequest("Invalid profile cover identifier");
  }
  return `profile-covers/${userId}/${id}.webp`;
}

export function profileAvatarKey(userId: string, id = randomUUID()): string {
  if (!new RegExp(`^${DATABASE_ID_SEGMENT}$`, "i").test(userId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
    throw AppError.badRequest("Invalid profile avatar identifier");
  }
  return `profile-avatars/${userId}/${id}.webp`;
}

export function safeProfileCoverPath(key: string, root = LOCAL_UPLOADS_ROOT): string | null {
  if (!COVER_KEY_PATTERN.test(key)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, key);
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

export function safeProfileAvatarPath(key: string, root = LOCAL_UPLOADS_ROOT): string | null {
  if (!AVATAR_KEY_PATTERN.test(key)) return null;
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

export async function normalizeProfileAvatar(input: Buffer): Promise<Buffer> {
  if (!input.length || input.length > 5 * 1024 * 1024) {
    throw AppError.badRequest("Profile photo must be 5MB or smaller");
  }
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)
      || !metadata.width || !metadata.height || metadata.width < 128 || metadata.height < 128) {
      throw AppError.badRequest("Use a JPEG, PNG, or WebP image of at least 128 × 128 pixels");
    }
    return await image.rotate().resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" }).webp({ quality: 84 }).toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest("The profile photo could not be processed");
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
    if (env.STORAGE_PROVIDER === "cloudinary") {
      await uploadCloudinaryBuffer(image, {
        resource_type: "image",
        type: "upload",
        public_id: cloudinaryImagePublicId(key),
        format: "webp",
        overwrite: true,
        invalidate: true,
      });
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
    if (env.STORAGE_PROVIDER === "cloudinary") {
      await deleteCloudinaryAsset(cloudinaryImagePublicId(key), { resource_type: "image", type: "upload" });
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
    if (env.STORAGE_PROVIDER === "cloudinary") {
      return { kind: "redirect", url: cloudinaryPublicUrl(cloudinaryImagePublicId(key), { resource_type: "image", format: "webp" }) };
    }
    const localPath = safeProfileCoverPath(key);
    if (!localPath) throw AppError.notFound("Cover image not found");
    return { kind: "local", path: localPath };
  },
};

export const profileAvatarStorage = {
  async save(userId: string, image: Buffer): Promise<string> {
    const key = profileAvatarKey(userId);
    if (env.STORAGE_PROVIDER === "r2") {
      await r2Client().send(new PutObjectCommand({
        Bucket: env.R2_BUCKET!, Key: key, Body: image, ContentType: "image/webp",
        CacheControl: "public, max-age=300",
      }));
      return key;
    }
    if (env.STORAGE_PROVIDER === "cloudinary") {
      await uploadCloudinaryBuffer(image, {
        resource_type: "image",
        type: "upload",
        public_id: cloudinaryImagePublicId(key),
        format: "webp",
        overwrite: true,
        invalidate: true,
      });
      return key;
    }
    const localPath = safeProfileAvatarPath(key);
    if (!localPath) throw AppError.internal();
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, image, { flag: "wx" });
    return key;
  },

  async remove(key: string): Promise<void> {
    if (!AVATAR_KEY_PATTERN.test(key)) return;
    if (env.STORAGE_PROVIDER === "r2") {
      await r2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
      return;
    }
    if (env.STORAGE_PROVIDER === "cloudinary") {
      await deleteCloudinaryAsset(cloudinaryImagePublicId(key), { resource_type: "image", type: "upload" });
      return;
    }
    const localPath = safeProfileAvatarPath(key);
    if (localPath) await fs.unlink(localPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },

  async publicLocation(key: string): Promise<{ kind: "local"; path: string } | { kind: "redirect"; url: string }> {
    if (!AVATAR_KEY_PATTERN.test(key)) throw AppError.notFound("Profile photo not found");
    if (env.STORAGE_PROVIDER === "r2") {
      const url = await getSignedUrl(
        r2Client(),
        new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }),
        { expiresIn: Math.min(env.R2_SIGNED_URL_TTL_SECONDS, 300) },
      );
      return { kind: "redirect", url };
    }
    if (env.STORAGE_PROVIDER === "cloudinary") {
      return { kind: "redirect", url: cloudinaryPublicUrl(cloudinaryImagePublicId(key), { resource_type: "image", format: "webp" }) };
    }
    const localPath = safeProfileAvatarPath(key);
    if (!localPath) throw AppError.notFound("Profile photo not found");
    return { kind: "local", path: localPath };
  },
};
