import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

// Run inside the backend Compose service. Never reuse the application's database.
const sourceUrl = new URL(process.env.DATABASE_URL ?? "");
const database = `lumigap_lecturer_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
if (!/^lumigap_lecturer_[a-f0-9]{12}_test$/.test(database)) throw new Error("Invalid isolated database name");
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${database}`;
if (targetUrl.pathname === sourceUrl.pathname || !targetUrl.pathname.endsWith("_test")) throw new Error("An isolated test database is required");
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
redisUrl.pathname = "/15";
const testEnv = { ...process.env, DATABASE_URL: targetUrl.toString(), REDIS_URL: redisUrl.toString(), NODE_ENV: "test", EMAIL_DELIVERY_MODE: "disabled", STORAGE_PROVIDER: "local", LOG_LEVEL: "error", LECTURER_VERIFICATION_INTEGRATION: "1" };

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd: "/app", env: testEnv, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Verification check exited ${code}`)));
  });
}

const control = new pg.Client({ connectionString: sourceUrl.toString() });
let created = false;
try {
  await control.connect();
  await control.query(`CREATE DATABASE "${database}"`);
  created = true;
  console.log(`Checking Lecturer workflow in ${database}; email delivery is disabled.`);
  await run(["--filter", "backend", "exec", "prisma", "migrate", "deploy", "--config", "prisma7.config.ts"]);
  await run(["--filter", "backend", "test", "src/modules/academic-profiles/__tests__/adaptive-lecturer.persistence.test.ts"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Verification check failed");
  process.exitCode = 1;
} finally {
  // Only the unique database successfully created by this process may be removed.
  if (created) {
    try { await control.query(`DROP DATABASE "${database}" WITH (FORCE)`); }
    catch { console.error(`Could not remove isolated database ${database}`); process.exitCode = 1; }
  }
  await control.end();
}
