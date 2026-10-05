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
const [target, ...args] = process.argv.slice(2);
let child;
let cleanup = () => {};
if (target === "expo") {
  const publicEnv = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith("EXPO_PUBLIC_")));
  child = spawn(process.execPath, [resolve(root, "node_modules/expo/bin/cli"), "start", ...args], {
    cwd: resolve(root, "apps/mobile"), stdio: "inherit",
    env: { ...publicEnv, ...process.env, EXPO_NO_DOTENV: "1" },
  });
} else if (target === "flutter") {
  const apiBase = process.env.API_BASE_URL ?? values.API_BASE_URL;
  if (!apiBase || !/^https?:\/\//.test(apiBase)) throw new Error("Set API_BASE_URL in root .env to an HTTP(S) API URL.");
  // A temporary JSON holds only the public URL. Avoid shell interpolation of
  // env values on Windows and never hand Flutter the backend's secret file.
  const directory = mkdtempSync(resolve(tmpdir(), "lumigap-flutter-"));
  const defineFile = resolve(directory, "public-config.json");
  writeFileSync(defineFile, JSON.stringify({ API_BASE_URL: apiBase }));
  cleanup = () => { unlinkSync(defineFile); rmdirSync(directory); };
  child = spawn("flutter", ["run", `--dart-define-from-file=${defineFile}`, ...args], {
    cwd: resolve(root, "apps/flutter_mobile"), stdio: "inherit",
  });
} else {
  throw new Error("Usage: node scripts/run-mobile.mjs expo|flutter [arguments]");
}
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
child.on("close", () => cleanup());
