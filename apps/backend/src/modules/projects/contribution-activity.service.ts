import type { ActivityResult } from "@trend/shared-types";
import type { z } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { activitySchema } from "./dto/project-contributions.schema.js";
import { meaningfulActivity } from "./research-contribution.rules.js";
import { presentResearchRecord, researchContributionSql, researchRecordSelect, withResearchContributions, type ResearchProjectionRow } from "./research-contribution-projection.js";

export { meaningfulActivity } from "./research-contribution.rules.js";
export function activityDay(timestamp: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp);
}
export const contributionActivityService = {
  async list(projectId: string, actorId: string, query: z.infer<typeof activitySchema>): Promise<ActivityResult> {
    return withResearchContributions(projectId, actorId, async c => {
      const base = researchContributionSql(c);
      if (query.scopeKey && !(await c.tx.$queryRaw<{key:string}[]>`${base} SELECT key FROM scopes WHERE key=${query.scopeKey}`).length) throw AppError.notFound("Manuscript contribution scope unavailable");
      const conditions = [Prisma.sql`source_type IS DISTINCT FROM 'CONTRIBUTION'`, Prisma.sql`created_at>=${new Date(query.from)} AND created_at<=${new Date(query.to)}`];
      if (query.memberId) conditions.push(Prisma.sql`actor_id=${query.memberId}::uuid`);
      if (query.category) conditions.push(Prisma.sql`type=ANY(${meaningfulActivity[query.category]}::text[])`);
      if (query.scopeKey) conditions.push(Prisma.sql`${query.scopeKey}=ANY(scope_keys)`);
      const where = Prisma.join(conditions," AND ");
      const eventDay = query.eventDay ? Prisma.sql`AND to_char(created_at AT TIME ZONE ${query.timeZone},'YYYY-MM-DD')=${query.eventDay}` : Prisma.empty;
      const [rows, counts, actors] = await Promise.all([
        c.tx.$queryRaw<ResearchProjectionRow[]>`${base} SELECT ${researchRecordSelect} FROM records WHERE ${where} ${eventDay} ORDER BY created_at DESC,id DESC LIMIT ${query.pageSize} OFFSET ${(query.page-1)*query.pageSize}`,
        c.tx.$queryRaw<{ day: string; count: bigint }[]>`${base} SELECT to_char(created_at AT TIME ZONE ${query.timeZone},'YYYY-MM-DD') AS day,count(*) AS count FROM records WHERE ${where} GROUP BY day ORDER BY day`,
        c.tx.$queryRaw<{ id: string; name: string }[]>`${base} SELECT DISTINCT actor_id AS id,name FROM records WHERE source_type IS DISTINCT FROM 'CONTRIBUTION' ORDER BY name,id`,
      ]);
      const total = counts.filter(row => !query.eventDay || row.day===query.eventDay).reduce((sum,row) => sum+Number(row.count),0);
      return { items: rows.map(row => { const item = presentResearchRecord(row,c.project.id); return { id: item.id, type: item.type, category: item.category, actor: item.actor, createdAt: item.createdAt, artifactVersion: item.artifactVersion, link: item.link }; }),
        total, hasNext: query.page*query.pageSize<total, days: counts.map(row => ({ day:row.day,count:Number(row.count) })), members:actors,timeZone:query.timeZone };
    });
  },
};
