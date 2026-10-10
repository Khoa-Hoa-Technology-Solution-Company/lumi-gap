import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, basename, sep } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url), { parse } = require("dotenv"), { expand } = require("dotenv-expand"), { Client } = require("pg");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const local = expand({ parsed: parse(readFileSync(join(root, ".env"))), processEnv: {} }).parsed;
const url = new URL(local.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/lumigap_db") throw new Error("Integration tests require the known local database configuration");
const scratch = `codex_mentorship_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
url.pathname = `/${scratch}`;
const backend = join(root, "apps", "backend"), migration = "20261007000600_complete_academic_mentorship";
const temp = mkdtempSync(join(tmpdir(), "lumigap-mentorship-"));
const configName = `.mentorship-${randomUUID()}.config.ts`, configPath = join(backend, configName), migrationPath = join(temp, "migrations");
const options = { maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] };
const redisName = `codex-mentorship-${randomUUID().slice(0, 8)}`;
const lecturerOnly = process.argv.includes("--lecturer-verification");
let redisCreated = false, databaseCreated = false;
const childEnv = { ...process.env, ...local, DATABASE_URL: url.href, NODE_ENV: "test", EMAIL_DELIVERY_MODE: "disabled", STORAGE_PROVIDER: "local", LOG_LEVEL: "error", MENTORSHIP_INTEGRATION: "1", STUDENT_AFFILIATION_INTEGRATION: "1" };
if (lecturerOnly) childEnv.LECTURER_VERIFICATION_INTEGRATION = "1";
function run(args) {
  const result = spawnSync("pnpm", ["--filter", "backend", ...args], { cwd: root, env: childEnv, shell: process.platform === "win32", windowsHide: true, stdio: args.includes("migrate") ? "pipe" : "inherit" });
  if (result.status !== 0 && args.includes("migrate")) console.error(result.stdout?.toString(), result.stderr?.toString()); if (result.error || result.status !== 0) throw new Error(`Mentorship test step failed (${result.status ?? "process error"})`);
}
try {
  execFileSync("docker", ["exec", "lumi-gap-postgres-1", "createdb", "-U", "postgres", scratch], options); databaseCreated = true;
  execFileSync("docker", ["run", "--rm", "-d", "--name", redisName, "-p", "127.0.0.1::6379", "redis:7-alpine"], options); redisCreated = true;
  const port = execFileSync("docker", ["port", redisName, "6379/tcp"], options).toString().trim().split(":").at(-1);
  if (!/^\d+$/.test(port)) throw new Error("Invalid isolated Redis port");
  childEnv.REDIS_URL = `redis://127.0.0.1:${port}`;
  const originalMigrations = join(backend, "prisma", "migrations");
  for (const entry of readdirSync(originalMigrations)) if (entry < migration || entry === "migration_lock.toml") cpSync(join(originalMigrations, entry), join(migrationPath, entry), { recursive: true });
  writeFileSync(configPath, `import { defineConfig } from "prisma/config"; export default defineConfig({ schema: ${JSON.stringify(join(backend, "prisma"))}, migrations: { path: ${JSON.stringify(migrationPath)} }, datasource: { url: process.env.DATABASE_URL } });`);
  run(["exec", "prisma", "migrate", "deploy", "--config", configName]);
  const client = new Client({ connectionString: url.href }); await client.connect();
  const [owner, mentor, other, activeProject, pendingProject, active, extraActive, ended, pending] = Array.from({ length: 9 }, randomUUID);
  const legacyEvidence = randomUUID();
  try {
    for (const id of [owner, mentor, other]) await client.query("INSERT INTO users(id,email,full_name,updated_at) VALUES($1,$2,'Legacy migration fixture',NOW())", [id, `${id}@migration.invalid`]);
    if (lecturerOnly) {
      await client.query("INSERT INTO verification_evidence(id,user_id,verification_type,source_type,status,updated_at) VALUES($1,$2,'POSITION','DOCUMENT','PENDING',NOW())", [legacyEvidence, owner]);
      await client.query("INSERT INTO verification_evidence_sources(id,request_id,slot,type,storage_key,file_name,status) VALUES(gen_random_uuid(),$1,1,'STAFF_ID',$2,'staff.pdf','INCONCLUSIVE')", [legacyEvidence, `verification-evidence/${owner}/${randomUUID()}.pdf`]);
    }
    for (const id of [activeProject, pendingProject]) await client.query("INSERT INTO projects(id,owner_id,title,updated_at) VALUES($1,$2,'Legacy migration project',NOW())", [id, owner]);
    for (const [id, projectId, mentorId, status] of [[active, activeProject, mentor, "ACCEPTED"], [extraActive, activeProject, other, "ACCEPTED"], [ended, activeProject, mentor, "ENDED"], [pending, pendingProject, mentor, "PENDING"]]) {
      await client.query("INSERT INTO mentor_relationships(id,project_id,mentor_user_id,requested_by,status,message,accepted_at,ended_at,response_note) VALUES($1,$2,$3,$4,$5::varchar,'Original request message',CASE WHEN $5::varchar<>'PENDING' THEN NOW()-INTERVAL '1 day' END,CASE WHEN $5::varchar='ENDED' THEN NOW() END,CASE WHEN $5::varchar='ENDED' THEN 'Legacy reason' END)", [id, projectId, mentorId, owner, status]);
    }
    const activity = (await client.query("INSERT INTO project_activities(id,project_id,actor_id,type,metadata) VALUES(gen_random_uuid(),$1,$2,'MENTOR_GUIDANCE','{\"note\":\"Legacy guidance\"}') RETURNING id", [activeProject, mentor])).rows[0];
    await client.query("INSERT INTO audit_logs(id,user_id,action_name,target_table_name,target_record_id,details,updated_at) VALUES(gen_random_uuid(),$1,'MENTOR_GUIDANCE','project_activities',$2,jsonb_build_object('projectId',$3::text,'note','Legacy guidance','attribution','MENTOR'),NOW())", [mentor, activity.id, activeProject]);
    run(["exec", "prisma", "migrate", "deploy", "--config", "prisma7.config.ts"]);
    if (lecturerOnly) {
      const legacy = (await client.query("SELECT source_kind,mime_type,file_name,status FROM verification_evidence_sources WHERE request_id=$1", [legacyEvidence])).rows[0];
      assert.deepEqual(legacy, { source_kind: "DOCUMENT", mime_type: "application/pdf", file_name: "staff.pdf", status: "INCONCLUSIVE" });
      console.log("Legacy evidence migration passed: document content and review status preserved.");
    }
    const requests = (await client.query("SELECT id,status,message,expires_at FROM mentorship_requests WHERE project_id=ANY($1::uuid[])", [[activeProject, pendingProject]])).rows;
    const relationships = (await client.query("SELECT id,source_request_id,status,end_reason FROM mentor_relationships WHERE project_id=$1", [activeProject])).rows;
    assert.equal(requests.length, 4); assert.equal(relationships.length, 3);
    assert.equal(relationships.filter(r => r.status === "ACTIVE").length, 2); // Grandfather legitimate legacy multi-mentor history.
    assert.equal(requests.find(r => r.id === ended).status, "ACCEPTED"); assert.equal(relationships.find(r => r.id === ended).end_reason, "Legacy reason");
    assert.ok(requests.find(r => r.id === pending).expires_at); assert.ok(requests.every(r => r.message === "Original request message"));
    assert.ok(relationships.every(r => requests.some(req => req.id === r.source_request_id)));
    assert.equal((await client.query("SELECT metadata->>'attribution' AS role FROM project_activities WHERE project_id=$1", [activeProject])).rows[0].role, "MENTOR");
    const audit = (await client.query("SELECT details FROM audit_logs WHERE target_record_id=$1", [activity.id])).rows[0];
    assert.deepEqual(audit.details, { projectId: activeProject, attribution: "MENTOR" });
    assert.equal((await client.query("SELECT metadata->>'note' AS note FROM project_activities WHERE id=$1", [activity.id])).rows[0].note, "Legacy guidance");
    console.log("Legacy migration assertions passed: request IDs/messages, active/ended history, multi-mentor preservation, expiry, guidance attribution and audit privacy.");
  } finally { await client.end(); }
  const suites = lecturerOnly ? ["src/modules/academic-profiles/__tests__/adaptive-lecturer.persistence.test.ts"] : ["src/modules/projects/__tests__/mentorship-workflow.persistence.test.ts", "src/modules/projects/__tests__/academic-relationships.persistence.test.ts", "src/modules/projects/__tests__/project-workspace.persistence.test.ts", "src/modules/reviews/__tests__/peer-review.persistence.test.ts", "src/modules/home/__tests__/home-research.test.ts"];
  run(["test", ...suites, "--maxWorkers=1", "--minWorkers=1", "--testTimeout=15000"]);
} finally { cleanupFixtures(); }

function cleanupFixtures() {
  if (redisCreated) execFileSync("docker", ["rm", "-f", redisName], options);
  if (databaseCreated && /^codex_mentorship_[a-f0-9]{12}_test$/.test(scratch)) execFileSync("docker", ["exec", "lumi-gap-postgres-1", "dropdb", "-U", "postgres", "--force", scratch], options);
  // Verify the exact generated temporary root before recursively cleaning it.
  if (!resolve(temp).startsWith(resolve(tmpdir()) + sep) || !/^lumigap-mentorship-[A-Za-z0-9]+$/.test(basename(temp))) throw new Error("Unsafe temporary cleanup path");
  rmSync(temp, { recursive: true, force: true });
  try { unlinkSync(configPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
