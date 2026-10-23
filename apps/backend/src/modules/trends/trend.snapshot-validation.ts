import { getPrisma } from "../../infrastructure/database/prisma.js";
import { COUNT_LEVELS } from "./trend.snapshot-collector.js";

/**
 * Mandatory checks before a snapshot can be activated (P2.1, from the P2.0
 * gate). Every check is recorded with its details, passed or not, so a failed
 * snapshot keeps its diagnostic evidence. Reads stored rows only, no network.
 */
export interface ValidationCheck {
  name: string;
  ok: boolean;
  details?: unknown;
}

export interface SnapshotValidation {
  ok: boolean;
  checkedAt: string;
  checks: ValidationCheck[];
}

const MAX_LISTED = 20;

export async function validateSnapshot(snapshotId: string): Promise<SnapshotValidation> {
  const db = getPrisma();
  const snapshot = await db.trendSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  const units = await db.trendSnapshotUnit.findMany({ where: { snapshotId } });
  const pages = await db.trendSnapshotPage.findMany({ where: { snapshotId }, orderBy: [{ unitId: "asc" }, { pageIndex: "asc" }] });
  const counts = await db.trendSnapshotCount.findMany({ where: { snapshotId } });
  const topics = await db.trendSnapshotTopic.findMany({ where: { snapshotId } });
  const checks: ValidationCheck[] = [];
  const add = (name: string, problems: unknown[], extra?: Record<string, unknown>) => checks.push({ name, ok: problems.length === 0, details: { problems: problems.slice(0, MAX_LISTED), problemCount: problems.length, ...extra } });

  // 1. Every publication year of the window has its 4 level units, and the catalogue exists.
  const years: number[] = [];
  for (let y = snapshot.yearFrom; y <= snapshot.lastCompleteYear; y++) years.push(y);
  const unitOf = (level: string, year: number) => units.find((u) => u.level === level && u.year === year);
  const missingUnits: string[] = [];
  if (!unitOf("catalogue", 0)) missingUnits.push("catalogue");
  for (const year of years) for (const level of COUNT_LEVELS) if (!unitOf(level, year)) missingUnits.push(`${level}:${year}`);
  add("all_years_and_levels_present", missingUnits, { years });

  // 2. Every unit complete: last page has no next cursor, pages are 0..n-1 without gaps, cursors chain.
  const pageProblems: unknown[] = [];
  for (const unit of units) {
    const own = pages.filter((p) => p.unitId === unit.id);
    if (unit.status !== "complete") pageProblems.push({ unit: `${unit.level}:${unit.year}`, problem: "not complete" });
    own.forEach((p, i) => { if (p.pageIndex !== i) pageProblems.push({ unit: `${unit.level}:${unit.year}`, problem: "page index gap", expected: i, got: p.pageIndex }); });
    for (let i = 1; i < own.length; i++) if (own[i]!.cursorIn !== own[i - 1]!.cursorOut) pageProblems.push({ unit: `${unit.level}:${unit.year}`, problem: "cursor chain broken", pageIndex: i });
    if (own.length && own.at(-1)!.cursorOut !== null) pageProblems.push({ unit: `${unit.level}:${unit.year}`, problem: "last page still has a next cursor" });
    if (own.length !== unit.pagesFetched) pageProblems.push({ unit: `${unit.level}:${unit.year}`, problem: "page log does not match the unit", logged: own.length, unit_pages: unit.pagesFetched });
    // Identical non-empty pages inside a unit (a duplicated cursor page that happened to add no new key).
    const seen = new Map<string, number>();
    for (const p of own) {
      if (p.groupCount === 0) continue;
      if (seen.has(p.responseHash)) pageProblems.push({ unit: `${unit.level}:${unit.year}`, problem: "duplicated page", pages: [seen.get(p.responseHash), p.pageIndex] });
      seen.set(p.responseHash, p.pageIndex);
    }
  }
  add("cursor_pages_complete", pageProblems);

  // 3. Per unit: Σ all groups (incl. unknown) = meta.count. Detects a missing page.
  const sum = (rows: typeof counts) => rows.reduce((s, r) => s + r.count, 0);
  const metaProblems: unknown[] = [];
  for (const year of years) for (const level of COUNT_LEVELS) {
    const unit = unitOf(level, year);
    if (!unit) continue;
    const total = sum(counts.filter((c) => c.level === level && c.year === year));
    if (unit.metaCount === null || total !== unit.metaCount) metaProblems.push({ unit: `${level}:${year}`, sumOfGroups: total, metaCount: unit.metaCount });
  }
  const catalogue = unitOf("catalogue", 0);
  if (catalogue && (catalogue.metaCount === null || topics.length !== catalogue.metaCount)) metaProblems.push({ unit: "catalogue", topics: topics.length, metaCount: catalogue.metaCount });
  add("groups_reconcile_with_meta_count", metaProblems);

  // 4. Classified / unclassified: per year, Σ classified and the unknown group equal at every level.
  const splitProblems: unknown[] = [];
  const split: Record<number, { classified: number; unknown: number }> = {};
  for (const year of years) {
    const perLevel = COUNT_LEVELS.map((level) => {
      const rows = counts.filter((c) => c.level === level && c.year === year);
      return { level, classified: sum(rows.filter((r) => r.unitKey !== "unknown")), unknown: sum(rows.filter((r) => r.unitKey === "unknown")) };
    });
    split[year] = { classified: perLevel[0]!.classified, unknown: perLevel[0]!.unknown };
    for (const p of perLevel.slice(1)) {
      if (p.classified !== perLevel[0]!.classified || p.unknown !== perLevel[0]!.unknown) splitProblems.push({ year, level: p.level, classified: p.classified, unknown: p.unknown, topicClassified: perLevel[0]!.classified, topicUnknown: perLevel[0]!.unknown });
    }
  }
  add("classified_unclassified_reconcile", splitProblems, { split });

  // 5. Taxonomy: every counted topic is in the catalogue, and topic counts rolled up through the
  //    catalogue equal the domain/field/subfield counts, unit by unit, in both directions.
  const catalogueById = new Map(topics.map((t) => [t.topicId, t]));
  const notInCatalogue = [...new Set(counts.filter((c) => c.level === "topic" && c.unitKey !== "unknown" && !catalogueById.has(c.unitKey)).map((c) => c.unitKey))];
  add("topics_in_catalogue", notInCatalogue);
  const taxonomyProblems: unknown[] = [];
  for (const level of ["domain", "field", "subfield"] as const) {
    const idOf = { domain: "domainId", field: "fieldId", subfield: "subfieldId" }[level] as "domainId" | "fieldId" | "subfieldId";
    for (const year of years) {
      const rolled = new Map<string, number>();
      for (const c of counts) {
        if (c.level !== "topic" || c.year !== year || c.unitKey === "unknown") continue;
        const t = catalogueById.get(c.unitKey);
        if (t) rolled.set(t[idOf], (rolled.get(t[idOf]) ?? 0) + c.count);
      }
      const reported = new Map(counts.filter((c) => c.level === level && c.year === year && c.unitKey !== "unknown").map((c) => [c.unitKey, c.count]));
      for (const id of new Set([...rolled.keys(), ...reported.keys()])) {
        if ((rolled.get(id) ?? 0) !== (reported.get(id) ?? 0)) taxonomyProblems.push({ level, year, unit: id, fromTopics: rolled.get(id) ?? 0, reported: reported.get(id) ?? 0 });
      }
    }
  }
  add("taxonomy_levels_reconcile", taxonomyProblems);

  // 6. No duplicate topic/year rows (the primary key forbids them; checked to record it).
  const keys = new Set(counts.map((c) => `${c.level}|${c.unitKey}|${c.year}`));
  add("no_duplicate_unit_year_rows", keys.size === counts.length ? [] : [{ rows: counts.length, distinct: keys.size }]);

  // 7. Baseline data: a non-zero global population every year.
  add("baseline_data_present", years.filter((y) => !((split[y]?.classified ?? 0) > 0)).map((year) => ({ year, problem: "no classified works" })));

  const ok = checks.every((c) => c.ok);
  return { ok, checkedAt: new Date().toISOString(), checks };
}
