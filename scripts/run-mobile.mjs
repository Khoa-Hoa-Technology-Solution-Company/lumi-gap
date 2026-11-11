import { config } from "dotenv";
import { expand } from "dotenv-expand";
import spawn from "cross-spawn";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const values = {};
const result = config({ path: resolve(root, ".env"), processEnv: values });
if (result.error) throw new Error("Create root .env with pnpm setup before starting mobile.");
expand({ ...result, processEnv: values });

// Optional public origin of the web app, used by the mobile app to open links
// that have no mobile screen. Missing or blank: the app default applies.
// Present: must be http(s) with no query, fragment or credentials; trailing
// slashes are removed so the app can append a path.
function parseWebOrigin(raw) {
  const value = raw?.trim();
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  if (!url || !["http:", "https:"].includes(url.protocol) || /[?#]/.test(value) || url.username || url.password) {
    throw new Error(`WEB_ORIGIN must be an http(s) URL without query, fragment or credentials (for example http://10.0.2.2:3000), got: ${value}`);
  }
  return value.replace(/\/+$/, "");
}

const [target, ...args] = process.argv.slice(2);
let child;
let cleanup = () => {};
if (target === "flutter") {
  const apiBase = process.env.API_BASE_URL ?? values.API_BASE_URL;
  if (!apiBase || !/^https?:\/\//.test(apiBase)) throw new Error("Set API_BASE_URL in root .env to an HTTP(S) API URL.");
  // A temporary JSON holds only the public URLs. Avoid shell interpolation of
  // env values on Windows and never hand Flutter the backend's secret file.
  const directory = mkdtempSync(resolve(tmpdir(), "lumigap-flutter-"));
  const defineFile = resolve(directory, "public-config.json");
  const webOrigin = parseWebOrigin(process.env.WEB_ORIGIN ?? values.WEB_ORIGIN);
  writeFileSync(defineFile, JSON.stringify({ API_BASE_URL: apiBase, ...(webOrigin && { WEB_ORIGIN: webOrigin }) }));
  cleanup = () => { unlinkSync(defineFile); rmdirSync(directory); };
  child = spawn("flutter", ["run", `--dart-define-from-file=${defineFile}`, ...args], {
    cwd: resolve(root, "apps/flutter_mobile"), stdio: "inherit",
  });
} else {
  throw new Error("Usage: node scripts/run-mobile.mjs flutter [arguments]");
}
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
child.on("close", () => cleanup());
