import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { URL } from "node:url";
import process from "node:process";

const backend = fileURLToPath(new URL("../", import.meta.url));
const values = { ...process.env };
expand({ ...config({ path: resolve(backend, "../../.env"), processEnv: values, quiet: true }), processEnv: values });
const original = new URL(values.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(original.hostname)) throw new Error("Local PostgreSQL only");
const name = `codex_mentor_workspace_${randomBytes(6).toString("hex")}_test`;
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const testUrl = new URL(original); testUrl.pathname = `/${name}`;
const env = { ...values, DATABASE_URL: testUrl.href, NODE_ENV: "test", MENTOR_WORKSPACE_INTEGRATION: "1", MENTOR_REVIEW_WORKFLOW_INTEGRATION: "1", MENTOR_REVIEW_INTEGRATION: "1", MENTOR_ACCESS_INTEGRATION: "1", EMAIL_DELIVERY_MODE: "disabled", LOG_LEVEL: "error", RATE_LIMIT_STORE: "memory" };
if (process.argv.includes("--capture-ui")) env.MENTOR_REVIEW_QA_OUTPUT = resolve(backend, "../web/.cache/mentor-review-qa.json");
if (process.argv.includes("--interactive-ui")) env.MENTOR_REVIEW_INTERACTIVE_UI = "1";
async function adminQuery(sql) {
  const client = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
  try { await client.connect(); await client.query(sql); } finally { await client.end(); }
}
async function run(args) {
  const child = spawn(process.execPath, args, { cwd: backend, env, shell: false, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Check failed (${code})`))); });
}
let created = false;
try {
  // Identifier is generated here, never accepted from a user or environment variable.
  await adminQuery(`CREATE DATABASE "${name}"`); created = true;
  await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
  await run(["../../node_modules/vitest/vitest.mjs", "run", ...(process.argv.includes("--review-only") ? [] : ["src/modules/projects/__tests__/mentor-workspace.persistence.test.ts"]), "src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts", ...(process.argv.includes("--regression") ? ["src/modules/reviews/__tests__/mentor-guidance.persistence.test.ts", "src/modules/reviews/__tests__/peer-review.persistence.test.ts"] : []), ...(process.argv.includes("--workspace-only") || process.argv.includes("--review-only") ? [] : ["src/modules/projects/__tests__/mentor-access.persistence.test.ts"]), "--maxWorkers=1", "--minWorkers=1", "--testTimeout=60000", "--hookTimeout=60000"]);
} finally {
  if (created && /^codex_mentor_workspace_[a-f0-9]{12}_test$/.test(name) && original.pathname !== `/${name}`) {
    await adminQuery(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
}
