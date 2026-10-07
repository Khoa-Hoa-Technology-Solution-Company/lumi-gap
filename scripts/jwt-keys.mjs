import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function ensureJwtKeys(privatePath, publicPath) {
  const privateExists = existsSync(privatePath);
  const publicExists = existsSync(publicPath);
  if (privateExists !== publicExists) {
    throw new Error("Incomplete JWT key pair. Restore the missing key before continuing.");
  }
  if (privateExists) {
    const privateKey = createPrivateKey(readFileSync(privatePath));
    const expected = createPublicKey(privateKey).export({ type: "spki", format: "pem" });
    const actual = createPublicKey(readFileSync(publicPath)).export({ type: "spki", format: "pem" });
    if (expected !== actual || privateKey.asymmetricKeyType !== "rsa" || privateKey.asymmetricKeyDetails.modulusLength < 2048) {
      throw new Error("JWT keys must be a matching RSA pair of at least 2048 bits.");
    }
    return false;
  }
  for (const path of [privatePath, publicPath]) mkdirSync(dirname(path), { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(privatePath, privateKey, { mode: 0o600, flag: "wx" });
  writeFileSync(publicPath, publicKey, { mode: 0o644, flag: "wx" });
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.env.JWT_KEYS_DIR ?? "/run/secrets";
  const created = ensureJwtKeys(resolve(directory, "jwt-private.pem"), resolve(directory, "jwt-public.pem"));
  console.log(created ? "Created RS256 key pair." : "Existing RS256 key pair verified.");
}
