import type { CoverageCheckView } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { fetchOpenAlexWorksByDois } from "../api-sync/providers/openalex.client.js";
import { auditService } from "../audit/audit.service.js";
import { clopperPearsonUpper, normalizeDoi } from "./closure.rules.js";
import { projectIdsOfUser, requireProjectMember, resolveUserId } from "./closure.access.js";
import { toCoverageView } from "./dossier.js";
import type { CreateCoverageCheckDto, ListCoverageChecksQuery } from "./dto/closure.schema.js";

export const OPENALEX_DOI_BATCH = 50;
export const MAX_COVERAGE_DOIS = 200;
/** What fetchOpenAlexWorksByDois accepts; a DOI with `,` or `|` would break its filter expression. */
const OPENALEX_SAFE_DOI = /^10\.\d{4,9}\/[^\s|,]+$/;

const normalizeTopic = (value: string) => value.trim().toLowerCase();

export interface PreparedDois {
  dois: string[];
  invalid: string[];
}

/** Normalize, validate and dedupe (keeping the first position of each DOI). */
export function prepareDois(values: string[]): PreparedDois {
  const dois: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const doi = normalizeDoi(value);
    if (!doi || doi.length > 300 || !OPENALEX_SAFE_DOI.test(doi)) invalid.push(value);
    else if (!seen.has(doi)) {
      seen.add(doi);
      dois.push(doi);
    }
  }
  return { dois, invalid };
}

export interface CoverageLookup {
  local: Map<string, { paperId: string; openalexId: string | null; title: string }>;
  openalex: Map<string, { openalexId: string | null; title: string | null }>;
}

export interface CoverageItemDraft {
  doi: string;
  position: number;
  title: string | null;
  foundLocal: boolean;
  foundOpenAlex: boolean;
  paperId: string | null;
  openalexId: string | null;
}

/** Combine both lookups into one item per DOI; x counts the items found in neither source. */
export function buildCoverageItems(dois: string[], lookup: CoverageLookup): { items: CoverageItemDraft[]; m: number; x: number } {
  const items = dois.map((doi, position): CoverageItemDraft => {
    const local = lookup.local.get(doi);
    const remote = lookup.openalex.get(doi);
    return {
      doi,
      position,
      title: local?.title ?? remote?.title ?? null,
      foundLocal: Boolean(local),
      foundOpenAlex: Boolean(remote),
      paperId: local?.paperId ?? null,
      openalexId: remote?.openalexId ?? local?.openalexId ?? null,
    };
  });
  return { items, m: items.length, x: items.filter((item) => !item.foundLocal && !item.foundOpenAlex).length };
}

async function lookupLocal(dois: string[]): Promise<CoverageLookup["local"]> {
  const rows = await getPrisma().$queryRaw<Array<{ id: string; doi: string; openalex_id: string | null; title: string }>>(
    Prisma.sql`SELECT "id"::text AS id, lower("doi") AS doi, "openalex_id", "title" FROM "papers" WHERE "data_status" = 'active' AND lower("doi") = ANY(${dois}::text[])`,
  );
  const found: CoverageLookup["local"] = new Map();
  for (const row of rows) found.set(row.doi, { paperId: row.id, openalexId: row.openalex_id, title: row.title });
  return found;
}

/** Any OpenAlex failure aborts the whole check: a lookup that could not run must not look like "not found". */
async function lookupOpenAlex(dois: string[]): Promise<CoverageLookup["openalex"]> {
  const found: CoverageLookup["openalex"] = new Map();
  try {
    for (let start = 0; start < dois.length; start += OPENALEX_DOI_BATCH) {
      const works = await fetchOpenAlexWorksByDois(dois.slice(start, start + OPENALEX_DOI_BATCH));
      for (const work of works) {
        const doi = work.doi ? normalizeDoi(work.doi) : null;
        if (doi) found.set(doi, { openalexId: work.id?.replace(/^https?:\/\/openalex\.org\//, "") ?? null, title: work.title ?? work.display_name ?? null });
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "OpenAlex DOI lookup failed during a coverage check");
    throw AppError.serviceUnavailable("OpenAlex could not be reached, so the coverage check was not saved. Try again later.");
  }
  return found;
}

export const coverageService = {
  /** POST /coverage-checks */
  async create(sub: string, body: CreateCoverageCheckDto): Promise<CoverageCheckView> {
    const userId = await resolveUserId(sub);
    const project = body.projectId ? await requireProjectMember(body.projectId, userId) : null;
    const { dois, invalid } = prepareDois(body.dois);
    if (invalid.length) throw AppError.badRequest(`${invalid.length} value(s) are not valid DOIs`, { invalidDois: invalid.slice(0, 50) });
    if (dois.length < 1 || dois.length > MAX_COVERAGE_DOIS) throw AppError.badRequest(`Provide between 1 and ${MAX_COVERAGE_DOIS} distinct DOIs`);

    const [local, openalex] = await Promise.all([lookupLocal(dois), lookupOpenAlex(dois)]);
    const { items, m, x } = buildCoverageItems(dois, { local, openalex });
    const delta = env.GAP_CLOSURE_DELTA;
    const pHat = clopperPearsonUpper(x, m, delta);

    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.coverageCheck.create({
        data: { topic: body.topic, normalizedTopic: normalizeTopic(body.topic), projectId: project?.id, referenceSource: body.referenceSource, m, x, delta, pHat, createdById: userId },
      });
      await tx.coverageCheckItem.createMany({ data: items.map((item) => ({ ...item, coverageCheckId: row.id })) });
      return row;
    });
    await auditService.log("gap_closure.coverage.created", { userId: sub, targetTableName: "coverage_checks", targetRecordId: created.id, details: { topic: body.topic, m, x, pHat } });
    return toCoverageView(created, items);
  },

  /** GET /coverage-checks — the caller's own checks and those of projects they belong to. */
  async list(sub: string, query: ListCoverageChecksQuery): Promise<CoverageCheckView[]> {
    const userId = await resolveUserId(sub);
    const prisma = getPrisma();
    const project = query.projectId ? await requireProjectMember(query.projectId, userId) : null;
    const projectIds = project ? [project.id] : await projectIdsOfUser(userId);
    const where: Prisma.CoverageCheckWhereInput = {
      ...(project ? { projectId: project.id } : { OR: [{ createdById: userId }, ...(projectIds.length ? [{ projectId: { in: projectIds } }] : [])] }),
      ...(query.topic ? { normalizedTopic: { contains: normalizeTopic(query.topic), mode: "insensitive" as const } } : {}),
    };
    const rows = await prisma.coverageCheck.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
    const items = rows.length ? await prisma.coverageCheckItem.findMany({ where: { coverageCheckId: { in: rows.map((row) => row.id) } } }) : [];
    return rows.map((row) => toCoverageView(row, items.filter((item) => item.coverageCheckId === row.id)));
  },
};
