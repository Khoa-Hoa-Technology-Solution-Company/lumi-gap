// Verify resets against an isolated copy; never mutate the source account data.
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

const rootEnv = config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
if (rootEnv.error && rootEnv.error.code !== "ENOENT") throw rootEnv.error;
expand(rootEnv);

const container = "lumi-gap-postgres-1";
const scratch = "codex_repeat_user_reset_check_20261006";
const options = { maxBuffer: 128 * 1024 * 1024, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] };
const run = (args) => execFileSync("docker", ["exec", container, ...args], options);
const email = "thanhndse182854@fpt.edu.vn";
let created = false;
let client;
try {
  run(["createdb", "-U", "postgres", scratch]); created = true;
  const dump = run(["pg_dump", "-U", "postgres", "-d", "lumigap_db", "-Fc", "--no-owner", "--no-privileges"]);
  execFileSync("docker", ["exec", "-i", container, "pg_restore", "-U", "postgres", "-d", scratch, "--no-owner", "--no-privileges", "--exit-on-error"], { ...options, input: dump });
  const url = new URL(process.env.DATABASE_URL); url.pathname = "/" + scratch;
  client = new pg.Client({ connectionString: url.href }); await client.connect();
  await client.query(readFileSync(new URL("../../../artifacts/database/reset-test-account.sql", import.meta.url), "utf8"));
  // A recreated source account, if any, is reset only inside the copied database.
  await client.query("SELECT public.lumigap_reset_test_account($1)", [email]);
  const countsSql = "SELECT (SELECT count(*)::int FROM public.users) AS users, (SELECT count(*)::int FROM public.papers) AS papers";
  const baseline = (await client.query(countsSql)).rows[0];
  const other = (await client.query("SELECT id FROM public.users LIMIT 1")).rows[0].id;
  const category = (await client.query("SELECT id FROM public.communities LIMIT 1")).rows[0].id;
  const paper = (await client.query("SELECT id FROM public.papers LIMIT 1")).rows[0].id;
  const otherPost = (await client.query("SELECT id FROM public.forum_posts WHERE status='active' AND visibility_status='ACTIVE' LIMIT 1")).rows[0].id;
  for (let cycle = 1; cycle <= 2; cycle++) {
    const userId = randomUUID(), projectId = randomUUID(), postId = randomUUID(), commentId = randomUUID();
    await client.query("INSERT INTO public.users(id,email,full_name,updated_at) VALUES($1,$2,$3,now())", [userId, email, "Reset test fixture"]);
    await client.query("INSERT INTO public.academic_profiles(id,user_id,updated_at) VALUES($1,$2,now())", [randomUUID(), userId]);
    await client.query("INSERT INTO public.user_emails(id,user_id,normalized_email,updated_at) VALUES($1,$2,$3,now())", [randomUUID(), userId, email]);
    await client.query("INSERT INTO public.projects(id,title,owner_id,updated_at) VALUES($1,$2,$3,now())", [projectId, "Reset fixture project", userId]);
    await client.query("INSERT INTO public.project_members(id,project_id,user_id,updated_at) VALUES($1,$2,$3,now())", [randomUUID(), projectId, userId]);
    await client.query("INSERT INTO public.community_memberships(id,community_id,user_id,updated_at) VALUES($1,$2,$3,now())", [randomUUID(), category, userId]);
    await client.query("INSERT INTO public.forum_posts(id,author_id,community_id,title,body,updated_at) VALUES($1,$2,$3,$4,$5,now())", [postId, userId, category, "Reset fixture discussion", "Fixture content"]);
    await client.query("INSERT INTO public.forum_post_papers(post_id,paper_id,position) VALUES($1,$2,0)", [postId, paper]);
    await client.query("INSERT INTO public.forum_comments(id,post_id,post_number,author_id,body,updated_at) VALUES($1,$2,9999,$3,$4,now())", [commentId, otherPost, userId, "Reset fixture reply"]);
    await client.query("INSERT INTO public.forum_reactions(id,target_type,target_id,user_id,reaction) VALUES($1,$2,$3,$4,$5),($6,$2,$7,$8,$5)", [randomUUID(), "THREAD", otherPost, userId, "LIKE", randomUUID(), postId, other]);
    await client.query("INSERT INTO public.forum_post_views(id,post_id,viewer_key) VALUES($1,$2,$3)", [randomUUID(), otherPost, "user:" + userId]);
    await client.query("INSERT INTO public.forum_votes(id,post_id,user_id,value,updated_at) VALUES($1,$2,$3,1,now())", [randomUUID(), otherPost, userId]);
    await client.query("INSERT INTO public.audit_logs(id,user_id,action_name,details,updated_at) VALUES($1,$2,$3,$4,now())", [randomUUID(), userId, "test.reset", JSON.stringify({ email, userId })]);
    await client.query("INSERT INTO public.forum_restrictions(id,user_id,scope,restriction_type,reason,created_by,updated_at) VALUES($1,$2,'FORUM','POSTING','Fixture',$3,now())", [randomUUID(), userId, other]);
    await client.query("INSERT INTO public.notifications(id,user_id,title,message,type,target_kind,target_uuid,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())", [randomUUID(), other, "Fixture", "Fixture", "FORUM_REPLY", "forum_post", postId]);
    const result = (await client.query("SELECT public.lumigap_reset_test_account($1) AS result", [email])).rows[0].result;
    if (result.accountsDeleted !== 1 || !result.userIds.includes(userId) || result.deletedByTable.forum_posts !== 1 || result.deletedByTable.projects !== 1 || result.deletedByTable.forum_reactions !== 2 || result.deletedByTable.forum_comments !== 1 || result.deletedByTable.forum_post_papers !== 1 || result.deletedByTable.forum_restrictions !== 1) throw new Error("Fixture deletion incomplete: " + JSON.stringify(result));
    const second = (await client.query("SELECT public.lumigap_reset_test_account($1) AS result", [email])).rows[0].result;
    if (second.rowsDeleted !== 0 || second.accountsDeleted !== 0) throw new Error("Second reset was not a no-op");
    const after = (await client.query(countsSql)).rows[0];
    if (after.users !== baseline.users || after.papers !== baseline.papers) throw new Error("Unrelated users or shared Papers changed");
    console.log(JSON.stringify({ cycle, reset: result, idempotent: true, sharedPapersUnchanged: true, otherUsersUnchanged: true }));
  }
  const rollbackId = randomUUID();
  await client.query("INSERT INTO public.users(id,email,full_name,updated_at) VALUES($1,$2,$3,now())", [rollbackId, email, "Rollback fixture"]);
  await client.query("BEGIN"); await client.query("SELECT public.lumigap_reset_test_account($1)", [email]); await client.query("ROLLBACK");
  if ((await client.query("SELECT count(*)::int AS count FROM public.users WHERE id=$1", [rollbackId])).rows[0].count !== 1) throw new Error("Rollback did not restore account");
  let rejected = false;
  try { await client.query("SELECT public.lumigap_reset_test_account('someone-else@example.com')"); } catch { rejected = true; }
  if (!rejected) throw new Error("Email scope guard failed");
  console.log("Rollback and unrelated-email rejection passed.");
} catch (error) {
  console.error(error.message, error.where ?? ""); process.exitCode = 1;
} finally {
  if (client) await client.end();
  if (created) { run(["dropdb", "-U", "postgres", scratch]); console.log("Isolated copy removed."); }
}
