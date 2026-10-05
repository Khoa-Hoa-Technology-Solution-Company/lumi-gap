import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureJwtKeys } from "./jwt-keys.mjs";

// No dependencies: this also works before pnpm install.
export function setup(root = fileURLToPath(new URL("../", import.meta.url))) {
  const path = resolve(root, ".env");
  if (!existsSync(path)) {
    let template = readFileSync(resolve(root, ".env.example"), "utf8");
    for (const key of ["POSTGRES_PASSWORD", "REDIS_PASSWORD", "INTERNAL_SERVICE_KEY", "ACADEMIC_EMAIL_OTP_SECRET"]) {
      template = template.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${randomBytes(24).toString("hex")}`);
    }
    writeFileSync(path, template, { mode: 0o600, flag: "wx" });
    console.log("Created root .env with random local credentials. Set GEMINI_API_KEY in .env.");
  } else {
    console.log("Root .env already exists; preserved without changes.");
  }
  const created = ensureJwtKeys(resolve(root, "apps/backend/.keys/jwt-private.pem"), resolve(root, "apps/backend/.keys/jwt-public.pem"));
  console.log(created ? "Created local RS256 keys." : "Existing local RS256 keys verified.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) setup();
