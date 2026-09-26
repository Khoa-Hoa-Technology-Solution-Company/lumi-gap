import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(process.cwd(), ".keys");
mkdirSync(directory, { recursive: true });
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
writeFileSync(resolve(directory, "jwt-private.pem"), privateKey, { mode: 0o600 });
writeFileSync(resolve(directory, "jwt-public.pem"), publicKey, { mode: 0o644 });
process.stdout.write("Generated local RS256 key pair in apps/backend/.keys (gitignored).\n");
