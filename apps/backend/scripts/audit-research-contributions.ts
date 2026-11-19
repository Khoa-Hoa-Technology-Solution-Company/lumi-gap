/** Read-only local audit. No backfill, migration repair, source edits or history deletion. */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { meaningfulActivity } from "../src/modules/projects/research-contribution.rules.js";

const db=getPrisma();
try {
  const summary=await db.$queryRaw<{activities:bigint;meaningful:bigint;withoutIdempotencyKey:bigint;declarations:bigint;submittedMentorReviews:bigint;legacyReviewSummaries:bigint;allocationRevisions:bigint}[]>`
    SELECT (SELECT count(*) FROM project_activities) AS activities,
      (SELECT count(*) FROM project_activities WHERE type=ANY(${Object.values(meaningfulActivity).flat()}::text[])) AS meaningful,
      (SELECT count(*) FROM project_activities WHERE type=ANY(${Object.values(meaningfulActivity).flat()}::text[]) AND idempotency_key IS NULL) AS "withoutIdempotencyKey",
      (SELECT count(*) FROM project_contribution_proposals) AS declarations,
      (SELECT count(*) FROM human_reviews r JOIN reviewer_assignments a ON a.id=r.assignment_id JOIN review_requests q ON q.id=a.review_request_id WHERE r.status='SUBMITTED' AND q.origin='MENTOR_GUIDANCE') AS "submittedMentorReviews",
      (SELECT count(*) FROM research_contributions WHERE contribution_type='REVIEW') AS "legacyReviewSummaries",
      (SELECT count(*) FROM allocation_revisions) AS "allocationRevisions"`;
  const duplicateKeys=await db.$queryRaw<{count:bigint}[]>`SELECT count(*) AS count FROM (SELECT project_id,idempotency_key FROM project_activities WHERE idempotency_key IS NOT NULL GROUP BY project_id,idempotency_key HAVING count(*)>1) duplicates`;
  const migrations=await db.$queryRaw<{name:string;checksum:string;finishedAt:Date|null;rolledBackAt:Date|null}[]>`SELECT migration_name AS name,checksum,finished_at AS "finishedAt",rolled_back_at AS "rolledBackAt" FROM _prisma_migrations ORDER BY started_at`;
  const directory=new URL("../prisma/migrations/",import.meta.url);const folders=(await readdir(directory,{withFileTypes:true})).filter(f=>f.isDirectory()).map(f=>f.name);
  const applied=migrations.filter(m=>m.finishedAt&&!m.rolledBackAt);const checksumMismatches:string[]=[],lineEndingDifferences:string[]=[];
  for(const migration of applied.filter(m=>folders.includes(m.name))){const content=await readFile(new URL(`${migration.name}/migration.sql`,directory));if(createHash("sha256").update(content).digest("hex")!==migration.checksum){const text=content.toString("utf8");const variants=[text.replaceAll("\r\n","\n"),text.replace(/\r?\n/g,"\r\n")];if(variants.some(v=>createHash("sha256").update(v).digest("hex")===migration.checksum))lineEndingDifferences.push(migration.name);else checksumMismatches.push(migration.name);}}
  const result={...summary[0],duplicateIdempotencyKeys:duplicateKeys[0]?.count??0n,migrations:{applied:applied.length,localFolders:folders.length,pending:folders.filter(f=>!applied.some(m=>m.name===f)),missingFromCheckout:applied.filter(m=>!folders.includes(m.name)).map(m=>m.name),checksumMismatches,lineEndingDifferences,unfinished:migrations.filter(m=>!m.finishedAt&&!m.rolledBackAt).map(m=>m.name)},migrationDirectory:fileURLToPath(directory)};
  console.log(JSON.stringify(result,(_key,value)=>typeof value==="bigint"?Number(value):value,2));
} finally {await disconnectPostgres();}
