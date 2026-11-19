import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { URL } from "node:url";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
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
if (process.argv.includes("--manuscript-send")) { env.MENTOR_MANUSCRIPT_INTEGRATION = "1"; env.MANUSCRIPT_COMPILER_URL = "http://127.0.0.1:8020"; env.MANUSCRIPT_COMPILER_2025_URL = "http://127.0.0.1:8025"; }
if (process.argv.includes("--supervisor-browser")) env.SUPERVISOR_BROWSER = "1";
if (process.argv.includes("--supervisor-regression")) { env.MENTORSHIP_INTEGRATION = "1"; env.MENTOR_PLAN_INTEGRATION = "1"; }
if (process.argv.includes("--chat-browser")) env.RESEARCH_CHAT_BROWSER = "1";
if (process.argv.includes("--capture-ui")) env.MENTOR_REVIEW_QA_OUTPUT = resolve(backend, "../web/.cache/mentor-review-qa.json");
if (process.argv.includes("--interactive-ui")) env.MENTOR_REVIEW_INTERACTIVE_UI = "1";
if (process.argv.includes("--contribution-ui")) env.RESEARCH_CONTRIBUTION_UI = "1";
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
  if (process.argv.includes("--verify-focused-migration")) {
    const baseline = resolve(backend, ".cache", `${name}-baseline`), migrations = resolve(baseline, "migrations");
    await mkdir(migrations, { recursive: true });
    for (const item of await readdir(resolve(backend, "prisma/migrations"), { withFileTypes: true })) {
      if (item.name !== "20261117170000_simple_mentor_invitations") await cp(resolve(backend, "prisma/migrations", item.name), resolve(migrations, item.name), { recursive: item.isDirectory() });
    }
    const baselineConfig = resolve(baseline, "prisma.config.ts");
    await writeFile(baselineConfig, `import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:${JSON.stringify(resolve(backend, "prisma"))},migrations:{path:${JSON.stringify(migrations)}},datasource:{url:process.env.DATABASE_URL ?? ""}});\n`);
    await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", baselineConfig]);
    await run(["../../node_modules/tsx/dist/cli.mjs", "scripts/seed-simple-mentor-legacy.ts"]);
    await run(["scripts/apply-simple-mentor-migration.mjs", "--apply"]);
  } else await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
  const suites = process.argv.includes("--manuscript-send") ? ["src/modules/submissions/__tests__/mentor-manuscript.persistence.test.ts", "src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts"] : process.argv.includes("--supervisor-regression") ? ["src/modules/projects/__tests__/mentor-plan.persistence.test.ts", "src/modules/projects/__tests__/mentorship-workflow.persistence.test.ts", "src/modules/projects/__tests__/mentorship-dossier.persistence.test.ts", "src/modules/projects/__tests__/mentorship-http.persistence.test.ts"] : process.argv.includes("--supervisor-only") ? ["src/modules/projects/__tests__/screening-mentor-roles.test.ts", "src/modules/projects/__tests__/research-introduction.test.ts", "src/modules/projects/__tests__/supervisor-discovery.persistence.test.ts", "src/modules/projects/__tests__/project-mentorship.rules.test.ts", "src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts"] : process.argv.includes("--chat-only") ? ["src/modules/projects/__tests__/research-chat.persistence.test.ts", "src/modules/projects/__tests__/project-team-chat.events.test.ts"] : process.argv.includes("--contributions-only")
    ? ["src/modules/projects/__tests__/research-contributions.persistence.test.ts", "src/modules/projects/__tests__/research-contribution.rules.test.ts", "src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts"]
    : [...(process.argv.includes("--review-only") ? [] : ["src/modules/projects/__tests__/mentor-workspace.persistence.test.ts"]), "src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts", ...(process.argv.includes("--regression") ? ["src/modules/reviews/__tests__/mentor-guidance.persistence.test.ts", "src/modules/reviews/__tests__/peer-review.persistence.test.ts"] : []), ...(process.argv.includes("--workspace-only") || process.argv.includes("--review-only") ? [] : ["src/modules/projects/__tests__/mentor-access.persistence.test.ts"])];
  await run(["../../node_modules/vitest/vitest.mjs", "run", ...suites, "--maxWorkers=1", "--minWorkers=1", "--testTimeout=60000", "--hookTimeout=60000"]);
} finally {
  if (created && /^codex_mentor_workspace_[a-f0-9]{12}_test$/.test(name) && original.pathname !== `/${name}`) {
    await adminQuery(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
}
