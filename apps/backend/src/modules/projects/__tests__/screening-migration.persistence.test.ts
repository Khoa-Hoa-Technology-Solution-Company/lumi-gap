import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");

describe.skipIf(!enabled)("two-slot legacy migration", () => {
  it("retires only untouched automatic full-text followups and preserves ballots and protocol snapshots", async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    const schema = `acceptance_migration_${randomUUID().replaceAll("-", "")}`;
    const project = randomUUID(), actor = randomUUID();
    await db.connect();
    try {
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(`SET search_path TO "${schema}", public`);
      for (const table of ["screening_rounds", "screening_audit", "screening_assignments", "screening_reviews", "screening_final_decisions", "screening_adjudication_cases", "project_papers"]) await db.query(`CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING DEFAULTS)`);
      await db.query("CREATE TABLE projects (id uuid, status text)");
      await db.query("INSERT INTO projects VALUES ($1,'ACTIVE')", [project]);
      const scenarios = ["untouched", "assigned", "provisional", "manual", "excluded", "legacy"];
      const ids: Array<{ previous: string; next: string; paper: string }> = [];
      const snapshot = { workflowVersion: 9, requiredReviewers: 2, reviewMode: "INDEPENDENT", stages: ["TITLE_ABSTRACT", "FULL_TEXT"] };
      for (const scenario of scenarios) {
        const previous = randomUUID(), next = randomUUID(), paper = randomUUID();
        ids.push({ previous, next, paper });
        const settings = { ...snapshot, workflowVersion: scenario === "legacy" ? 3 : 9 };
        await db.query("INSERT INTO screening_rounds (id,project_id,paper_id,number,phase,active,settings,status,created_by_id) VALUES ($1,$2,$3,1,'TITLE_ABSTRACT',false,$4,$5,$6), ($7,$2,$3,2,'FULL_TEXT',true,$4,'NOT_REVIEWED',$6)", [previous, project, paper, settings, scenario === "excluded" ? "EXCLUDED" : "INCLUDED", actor, next]);
        await db.query("INSERT INTO screening_final_decisions (id,project_id,round_id,round_version,decision,source,reason,review_ids) VALUES ($1,$2,$3,1,$4,'CONSENSUS','Recorded group rationale','{}')", [randomUUID(), project, previous, scenario === "excluded" ? "EXCLUDED" : "INCLUDED"]);
        await db.query("INSERT INTO project_papers (id,project_id,paper_id,screening_status) VALUES ($1,$2,$3,'UNDECIDED')", [randomUUID(), project, paper]);
        await db.query("INSERT INTO screening_audit (id,project_id,round_id,actor_id,type,details) VALUES ($1,$2,$3,$4,'STAGE_ADVANCED',$5)", [randomUUID(), project, next, actor, { previousRoundId: previous, automated: scenario !== "manual", provisional: scenario === "provisional" }]);
        // Existing original ballots must remain intact in every scenario.
        const assignment = randomUUID();
        await db.query("INSERT INTO screening_assignments (id,project_id,round_id,reviewer_id,submitted_at) VALUES ($1,$2,$3,$4,now())", [assignment, project, previous, actor]);
        await db.query("INSERT INTO screening_reviews (id,project_id,assignment_id,revision,decision,comment) VALUES ($1,$2,$3,1,'INCLUDE','Original private rationale')", [randomUUID(), project, assignment]);
        if (scenario === "assigned") await db.query("INSERT INTO screening_assignments (id,project_id,round_id,reviewer_id) VALUES ($1,$2,$3,$4)", [randomUUID(), project, next, actor]);
      }
      const before = (await db.query("SELECT * FROM screening_reviews ORDER BY id")).rows;
      const migration = readFileSync(new URL("../../../../prisma/migrations/20261103120000_screening_single_round_acceptance/migration.sql", import.meta.url), "utf8");
      await db.query(migration);
      for (const [index, item] of ids.entries()) {
        expect((await db.query("SELECT active FROM screening_rounds WHERE id=$1", [item.previous])).rows[0].active).toBe(index === 0);
        expect((await db.query("SELECT active FROM screening_rounds WHERE id=$1", [item.next])).rows[0].active).toBe(index !== 0);
      }
      expect((await db.query("SELECT screening_status FROM project_papers WHERE paper_id=$1", [ids[0]!.paper])).rows[0].screening_status).toBe("INCLUDED");
      expect((await db.query("SELECT settings FROM screening_rounds WHERE id=$1", [ids[0]!.previous])).rows[0].settings).toEqual(snapshot);
      expect((await db.query("SELECT * FROM screening_reviews ORDER BY id")).rows).toEqual(before);
      expect((await db.query("SELECT count(*)::int AS count FROM screening_audit WHERE type='SINGLE_ROUND_ACCEPTANCE'")).rows[0].count).toBe(1);
      await db.query(migration); // Replaying the data correction cannot reopen or duplicate anything.
      expect((await db.query("SELECT count(*)::int AS count FROM screening_audit WHERE type='SINGLE_ROUND_ACCEPTANCE'")).rows[0].count).toBe(1);
    } finally {
      await db.query("ROLLBACK");
      await db.query("SET search_path TO public");
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.end();
    }
  });
  it("preserves 0/3, 2/3 and historical 1/1 without selecting, deleting or inventing reviewers", async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    // Generated identifier, never request input. Copy only schema/defaults, no application rows.
    const schema = `screening_migration_${randomUUID().replaceAll("-", "")}`;
    const project = randomUUID(), actor = randomUUID(), rounds = [randomUUID(), randomUUID(), randomUUID()];
    await db.connect();
    try {
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(`SET search_path TO "${schema}", public`);
      for (const table of ["projects", "screening_settings", "screening_rounds", "screening_assignments", "screening_audit", "screening_reviews", "screening_final_decisions"]) {
        await db.query(`CREATE TABLE "${schema}".${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
      }
      await db.query("ALTER TABLE screening_rounds DROP COLUMN legacy_needs_audit");
      // Only columns used by the migration are constrained in this isolated legacy projection.
      for (const table of ["projects", "screening_settings", "screening_rounds", "screening_assignments", "screening_audit"]) {
        const { rows } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND is_nullable='NO'", [schema, table]);
        for (const { column_name } of rows) await db.query(`ALTER TABLE ${table} ALTER COLUMN "${column_name}" DROP NOT NULL`);
      }
      await db.query("ALTER TABLE screening_rounds ADD PRIMARY KEY(id)");
      await db.query("INSERT INTO projects(id,owner_id) VALUES($1,$2)", [project, actor]);
      await db.query("INSERT INTO screening_settings(project_id,review_mode,required_reviewers,version) VALUES($1,'SIMPLE',1,1)", [project]);
      for (let i = 0; i < 3; i++) {
        const simple = i === 2;
        await db.query("INSERT INTO screening_rounds(id,project_id,created_by_id,settings,status,active) VALUES($1,$2,$3,$4,$5,true)",
          [rounds[i], project, actor, { workflowVersion: 3, reviewMode: simple ? "SIMPLE" : "INDEPENDENT", requiredReviewers: simple ? 1 : 2 }, simple ? "INCLUDED" : "IN_REVIEW"]);
        for (let j = 0; j < (simple ? 1 : 3); j++) await db.query("INSERT INTO screening_assignments(id,project_id,round_id,reviewer_id,active,submitted_at) VALUES($1,$2,$3,$4,true,$5)",
          [randomUUID(), project, rounds[i], randomUUID(), i === 1 && j < 2 || simple ? new Date() : null]);
      }
      const before = (await db.query("SELECT * FROM screening_assignments ORDER BY id")).rows;
      await db.query(readFileSync(new URL("../../../../prisma/migrations/20261101160000_screening_two_slot_integrity/migration.sql", import.meta.url), "utf8"));
      expect((await db.query("SELECT * FROM screening_assignments ORDER BY id")).rows).toEqual(before);
      expect((await db.query("SELECT id,legacy_needs_audit FROM screening_rounds ORDER BY id")).rows).toEqual(
        rounds.map((id, i) => ({ id, legacy_needs_audit: i < 2 })).sort((a, b) => a.id.localeCompare(b.id)));
      expect((await db.query("SELECT status,settings FROM screening_rounds WHERE id=$1", [rounds[2]])).rows[0]).toMatchObject({ status: "INCLUDED", settings: { requiredReviewers: 1, workflowVersion: 3 } });
      expect((await db.query("SELECT required_reviewers,review_mode FROM screening_settings")).rows[0]).toEqual({ required_reviewers: 2, review_mode: "INDEPENDENT" });
      expect((await db.query("SELECT count(*)::int AS count FROM screening_audit WHERE type='LEGACY_REVIEW_REQUIRED'")).rows[0].count).toBe(2);
    } finally {
      await db.query("ROLLBACK");
      await db.query("SET search_path TO public");
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.end();
    }
  });
});
