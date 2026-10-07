import { backendRoot } from "../src/config/load-env.js";
import { resolve } from "node:path";
import { ensureJwtKeys } from "../../../scripts/jwt-keys.mjs";

const created = ensureJwtKeys(
  resolve(backendRoot, process.env.JWT_PRIVATE_KEY_PATH ?? ".keys/jwt-private.pem"),
  resolve(backendRoot, process.env.JWT_PUBLIC_KEY_PATH ?? ".keys/jwt-public.pem"),
);
console.log(created ? "Generated local RS256 key pair (gitignored)." : "Existing RS256 key pair verified.");
