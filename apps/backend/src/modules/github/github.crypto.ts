import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";

function key() {
  return createHash("sha256").update("lumigap:github:v1:").update(env.GITHUB_CONNECTION_ENCRYPTION_KEY ?? env.INTERNAL_SERVICE_KEY).digest();
}
export function sealGithubToken(token: string, userId: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`github:${userId}`));
  const value = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), value.toString("base64url")].join(".");
}
export function openGithubToken(value: string, userId: string) {
  try {
    const [version, iv, tag, content, extra] = value.split(".");
    if (version !== "v1" || !iv || !tag || !content || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(`github:${userId}`)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(content, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw AppError.serviceUnavailable("Reconnect GitHub to renew the saved credentials"); }
}
