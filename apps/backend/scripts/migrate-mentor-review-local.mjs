// Apply only this checked-in migration to a local development database whose
// history also contains other branches. Prisma still records the real migration.
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const backend = fileURLToPath(new URL("../", import.meta.url));
const values = { ...process.env };
expand({ ...config({ path: resolve(backend, "../../.env"), processEnv: values, quiet: true }), processEnv: values });
if (!["localhost", "127.0.0.1"].includes(new URL(values.DATABASE_URL).hostname)) throw Error("This repair runner is for local PostgreSQL only");
const name = "20261116090000_scoped_mentor_review_access";
const folder = resolve(backend, `scripts/.mentor-review-migration-${randomUUID()}`);
const migration = resolve(folder, "migrations", name);
await mkdir(migration, { recursive: true });
const configPath = resolve(folder, "prisma.config.ts");
try {
  await copyFile(resolve(backend, `prisma/migrations/${name}/migration.sql`), resolve(migration, "migration.sql"));
  await writeFile(resolve(folder, "migrations/migration_lock.toml"), 'provider = "postgresql"\n');
  await writeFile(configPath, `import base from "../../prisma7.config.ts";\nexport default { ...base, schema: ${JSON.stringify(resolve(backend, "prisma"))}, migrations: { path: ${JSON.stringify(resolve(folder, "migrations"))} } };\n`);
  const child = spawn(process.execPath, ["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", configPath], { cwd: backend, env: values, shell: false, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error(`Migration failed (${code})`))); });
} finally {
  // Exact generated files only. No recursive deletion or application data cleanup.
  await unlink(configPath).catch(() => undefined);
  await unlink(resolve(migration, "migration.sql")).catch(() => undefined);
  await unlink(resolve(folder, "migrations/migration_lock.toml")).catch(() => undefined);
  await rmdir(migration); await rmdir(resolve(folder, "migrations")); await rmdir(folder);
}
