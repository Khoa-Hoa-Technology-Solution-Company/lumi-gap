import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";

const USER_ID = "(?:[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})";
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const KEY_PATTERN = new RegExp(`^verification-evidence/(${USER_ID})/(${UUID})\\.pdf$`, "i");
const ROOT = path.resolve(process.cwd(), "uploads");

function client() {
  return new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT!, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! } });
}

export function safeVerificationEvidencePath(key: string, root = ROOT, ownerId?: string): string | null {
  const match = KEY_PATTERN.exec(key);
  if (!match || ownerId && match[1]?.toLocaleLowerCase() !== ownerId.toLocaleLowerCase()) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, key);
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

export const verificationEvidenceStorage = {
  async save(userId: string, bytes: Buffer): Promise<string> {
    if (!new RegExp(`^${USER_ID}$`, "i").test(userId)) throw AppError.badRequest("Invalid user identifier");
    const key = `verification-evidence/${userId}/${randomUUID()}.pdf`;
    if (env.STORAGE_PROVIDER === "r2") {
      await client().send(new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, Body: bytes, ContentType: "application/pdf", ContentDisposition: "attachment", CacheControl: "private, no-store" }));
      return key;
    }
    const destination = safeVerificationEvidencePath(key, ROOT, userId);
    if (!destination) throw AppError.internal();
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
    return key;
  },

  async remove(key: string, ownerId?: string): Promise<void> {
    if (!KEY_PATTERN.test(key) || ownerId && KEY_PATTERN.exec(key)?.[1]?.toLocaleLowerCase() !== ownerId.toLocaleLowerCase()) return;
    if (env.STORAGE_PROVIDER === "r2") {
      await client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
      return;
    }
    const filePath = safeVerificationEvidencePath(key, ROOT, ownerId);
    if (filePath) await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  },

  async adminLocation(key: string, ownerId: string): Promise<{ kind: "local"; path: string } | { kind: "redirect"; url: string }> {
    if (!safeVerificationEvidencePath(key, ROOT, ownerId)) throw AppError.notFound("Verification evidence not found");
    if (env.STORAGE_PROVIDER === "r2") {
      const url = await getSignedUrl(client(), new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, ResponseContentDisposition: "attachment; filename=position-evidence.pdf", ResponseCacheControl: "private, no-store" }), { expiresIn: 60 });
      return { kind: "redirect", url };
    }
    const filePath = safeVerificationEvidencePath(key, ROOT, ownerId);
    if (!filePath) throw AppError.notFound("Verification evidence not found");
    return { kind: "local", path: filePath };
  },
};
