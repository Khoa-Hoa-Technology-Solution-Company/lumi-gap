import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";

function key() {
  return createHash("sha256").update(env.AI_CONNECTION_ENCRYPTION_KEY ?? env.INTERNAL_SERVICE_KEY).digest();
}

export function encryptAiKey(secret: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAiKey(encrypted: string, userId: string): string {
  try {
    const [version, iv, tag, ciphertext] = encrypted.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid secret envelope");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw AppError.serviceUnavailable("Your saved AI key cannot be read. Edit the AI connection and enter the key again.");
  }
}
