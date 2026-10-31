import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import process from "node:process";

// Never migrate the developer's application database or print credentials.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const backend = fileURLToPath(new URL("../", import.meta.url));
const isolatedEnv = { ...process.env };
expand({ ...config({ path: `${root}/.env`, processEnv: isolatedEnv }), processEnv: isolatedEnv });
const original = new URL(isolatedEnv.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("This runner requires local PostgreSQL");
const database = "lumigap_mentor_access_v1_test";
if (original.pathname === `/${database}`) throw new Error("Provide the local application URL; this runner derives its own test database");
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString() });
try {
  await admin.connect();
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) {
    await admin.query('CREATE DATABASE "lumigap_mentor_access_v1_test"');
  }
} finally { await admin.end(); }
const testUrl = new URL(original); testUrl.pathname = `/${database}`;
const regression = process.argv.includes("--regression");
const legacy = process.argv.includes("--legacy");
const invitations = process.argv.includes("--invitations");
const screening = process.argv.includes("--screening");
const projectInvitations = process.argv.includes("--project-invitations");
const mentorPlan = process.argv.includes("--mentor-plan");
const env = { ...isolatedEnv, DATABASE_URL: testUrl.toString(), NODE_ENV: "test", MENTOR_ACCESS_INTEGRATION: "1", ...(regression || invitations ? { MENTORSHIP_INTEGRATION: "1", STUDENT_AFFILIATION_INTEGRATION: "1" } : {}), ...(regression || screening ? { SCREENING_INTEGRATION: "1" } : {}), RATE_LIMIT_STORE: "memory", EMAIL_DELIVERY_MODE: "disabled" };
if (projectInvitations) env.PROJECT_INVITATIONS_INTEGRATION = "1";
if (mentorPlan) env.MENTOR_PLAN_INTEGRATION = "1";
async function run(args) {
  const process = spawn(globalThis.process.execPath, args, { cwd: backend, env, stdio: "inherit", shell: false });
  await new Promise((resolve, reject) => { process.on("error", reject); process.on("exit", code => code === 0 ? resolve() : reject(new Error(`Test command failed (${code})`))); });
}
await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
if (mentorPlan && !invitations && !regression) {
  await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/projects/__tests__/mentor-plan.persistence.test.ts", "--maxWorkers=1", "--minWorkers=1"]);
  process.exit(0);
}
if (projectInvitations) {
  await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/projects/__tests__/project-invitations.persistence.test.ts", "--maxWorkers=1", "--minWorkers=1"]);
  process.exit(0);
}
await run(["../../node_modules/vitest/vitest.mjs", "run", ...(screening ? [] : ["src/modules/projects/__tests__/mentor-access.persistence.test.ts"]), ...(mentorPlan ? ["src/modules/projects/__tests__/mentor-plan.persistence.test.ts"] : []), ...(regression || invitations ? ["src/modules/projects/__tests__/mentorship-workflow.persistence.test.ts", "src/modules/projects/__tests__/academic-relationships.persistence.test.ts"] : []), ...(regression || screening ? ["src/modules/projects/__tests__/screening.persistence.test.ts"] : []), ...(legacy ? ["src/modules/projects/__tests__/workspace-collaboration.persistence.test.ts", "src/modules/projects/__tests__/collaborative-research.persistence.test.ts", "src/modules/workspaces/__tests__/manuscripts.persistence.test.ts"] : []), "--maxWorkers=1", "--minWorkers=1"]);
