# Paper Intelligence (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fabricated paper/report data with real, computed, grounded data — deterministic intrinsic paper `aiScore`, OpenAlex `referenced_works` ingestion + in-corpus reference linking, and resolved grounding papers on the report API.

**Architecture:** All backend + data contracts. Scoring is a pure module computed at sync time and backfilled by a script. References are ingested in the normalizer, stored on the paper, and resolved against the corpus by a service method. The report API resolves `groundingPaperIds` to paper summaries in retrieval order. FE is out of scope (delegated to AG via `docs/AG-paper-intelligence-handoff.md`).

**Tech Stack:** Node 22, TypeScript ESM, Express 5, Mongoose 8, Zod, Vitest, `@trend/shared-types` (pnpm workspace).

## Global Constraints

- Relative imports use the `.js` extension (ESM). Verbatim.
- Response envelope: `{ "success": true, "data": <T>, "meta"?: {...} }`. Errors via `AppError.*`.
- `shared-types` is framework-agnostic: no Express/Mongoose/React imports.
- Pure modules MUST NOT call `new Date()` / `Date.now()` — callers pass `currentYear: number` and `computedAt: string`.
- Mongoose: heavy fields use `select: false`; never repluralize `PaperModel` (pinned to `research_papers`).
- Tests are Vitest, colocated under `__tests__/`, run with `pnpm --filter backend test`.
- Branch: `feat/paper-intelligence` (already created off latest `origin/main`).
- Spec: `docs/superpowers/specs/2026-06-22-paper-intelligence-design.md`.

---

### Task 1: Shared types — intrinsic `PaperAiScore`, `PaperRef`, report `groundingPapers`

**Files:**
- Modify: `packages/shared-types/src/paper.ts`
- Modify: `packages/shared-types/src/report.ts`

**Interfaces:**
- Produces: `PaperAiScore` (intrinsic), `PaperRef`, `AnalyticalReport.groundingPapers?: PaperRef[]`.

- [ ] **Step 1: Redefine `PaperAiScore` and add `PaperRef` in `paper.ts`**

Replace the existing `PaperAiScore` interface with:

```ts
/** Paper-INTRINSIC AI score — deterministic, query-independent. */
export interface PaperAiScore {
  recencyScore: number; // 0..1 — newer = higher
  citationImpactScore: number; // 0..1 — normalized log(citationCount)
  metadataQualityScore: number; // 0..1 — = dataQualityScore
  finalScore: number; // 0..1 — weighted blend
  modelVersion: string;
  computedAt: ISODateString;
}

/** Lightweight paper reference — used for references + report grounding lists. */
export interface PaperRef {
  id: string;
  title: string;
  publicationYear: number;
  authors: PaperAuthorRef[];
  doi?: string;
}
```

(`Paper.aiScore?: PaperAiScore` already exists — keep it. `ISODateString` and `PaperAuthorRef` are already imported/defined in this file.)

- [ ] **Step 2: Add `groundingPapers` to `AnalyticalReport` in `report.ts`**

In `report.ts`, add an import and a field:

```ts
import type { ISODateString } from "./common.js";
import type { PaperRef } from "./paper.js";
```

Inside `interface AnalyticalReport`, after `groundingPaperIds: string[];` add:

```ts
  /** Resolved grounding papers in RETRIEVAL ORDER: citation [n] → groundingPapers[n-1].
   *  Populated by GET /reports/:id. */
  groundingPapers?: PaperRef[];
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @trend/shared-types typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/paper.ts packages/shared-types/src/report.ts
git commit -m "feat(shared-types): intrinsic PaperAiScore + PaperRef + report groundingPapers"
```

---

### Task 2: Scoring module (pure) + unit tests

**Files:**
- Create: `apps/backend/src/modules/scoring/paper-score.ts`
- Test: `apps/backend/src/modules/scoring/__tests__/paper-score.test.ts`

**Interfaces:**
- Consumes: `PaperAiScore` from `@trend/shared-types`.
- Produces: `computePaperScore(input: ScoreInput, currentYear: number, computedAt: string): PaperAiScore`, `PAPER_SCORE_VERSION`, `ScoreInput`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/scoring/__tests__/paper-score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computePaperScore } from "../paper-score.js";

const AT = "2026-06-22T00:00:00.000Z";

describe("computePaperScore", () => {
  it("recency: current year = 1, -10y = 0, -5y = 0.5, unknown(0) = 0", () => {
    expect(computePaperScore({ publicationYear: 2026, citationCount: 0, dataQualityScore: 0 }, 2026, AT).recencyScore).toBe(1);
    expect(computePaperScore({ publicationYear: 2016, citationCount: 0, dataQualityScore: 0 }, 2026, AT).recencyScore).toBe(0);
    expect(computePaperScore({ publicationYear: 2021, citationCount: 0, dataQualityScore: 0 }, 2026, AT).recencyScore).toBe(0.5);
    expect(computePaperScore({ publicationYear: 0, citationCount: 0, dataQualityScore: 0 }, 2026, AT).recencyScore).toBe(0);
  });

  it("citation impact: 0 = 0, >=1000 = 1, 9 ≈ 0.33", () => {
    expect(computePaperScore({ publicationYear: 2026, citationCount: 0, dataQualityScore: 0 }, 2026, AT).citationImpactScore).toBe(0);
    expect(computePaperScore({ publicationYear: 2026, citationCount: 5000, dataQualityScore: 0 }, 2026, AT).citationImpactScore).toBe(1);
    expect(computePaperScore({ publicationYear: 2026, citationCount: 9, dataQualityScore: 0 }, 2026, AT).citationImpactScore).toBe(0.33);
  });

  it("metadata passthrough + weighted finalScore + version/computedAt", () => {
    const s = computePaperScore({ publicationYear: 2026, citationCount: 5000, dataQualityScore: 0.8 }, 2026, AT);
    expect(s.metadataQualityScore).toBe(0.8);
    // 0.40*1 + 0.35*1 + 0.25*0.8 = 0.95
    expect(s.finalScore).toBe(0.95);
    expect(s.modelVersion).toBe("paper-score-v1");
    expect(s.computedAt).toBe(AT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/scoring`
Expected: FAIL ("Cannot find module ../paper-score.js").

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/modules/scoring/paper-score.ts`:

```ts
import type { PaperAiScore } from "@trend/shared-types";

/** Bump when the formula/weights change (mirrors prompt_version convention). */
export const PAPER_SCORE_VERSION = "paper-score-v1";

const RECENCY_WINDOW = 10; // years; older than this → 0
const CITATION_CAP = 1000; // citations at/above this → impact 1
const W_IMPACT = 0.4;
const W_RECENCY = 0.35;
const W_METADATA = 0.25;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ScoreInput {
  publicationYear: number;
  citationCount: number;
  dataQualityScore: number;
}

/**
 * Deterministic, paper-intrinsic score. Pure: caller supplies `currentYear`
 * and `computedAt` (no Date inside). Query-relevance is NOT here — it is the
 * cosine score in search.
 */
export function computePaperScore(
  input: ScoreInput,
  currentYear: number,
  computedAt: string,
): PaperAiScore {
  const year = input.publicationYear || 0;
  const recencyScore = year > 0 ? clamp01(1 - (currentYear - year) / RECENCY_WINDOW) : 0;
  const citationImpactScore = clamp01(
    Math.log10((input.citationCount ?? 0) + 1) / Math.log10(CITATION_CAP + 1),
  );
  const metadataQualityScore = clamp01(input.dataQualityScore ?? 0);
  const finalScore = round2(
    W_IMPACT * citationImpactScore + W_RECENCY * recencyScore + W_METADATA * metadataQualityScore,
  );
  return {
    recencyScore: round2(recencyScore),
    citationImpactScore: round2(citationImpactScore),
    metadataQualityScore: round2(metadataQualityScore),
    finalScore,
    modelVersion: PAPER_SCORE_VERSION,
    computedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/scoring`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/scoring/paper-score.ts apps/backend/src/modules/scoring/__tests__/paper-score.test.ts
git commit -m "feat(scoring): deterministic intrinsic paper score module"
```

---

### Task 3: Persist `aiScore` — model field, sync wiring, recompute script

**Files:**
- Modify: `apps/backend/src/modules/papers/models/paper.model.ts`
- Modify: `apps/backend/src/modules/api-sync/sync.service.ts`
- Create: `apps/backend/scripts/recompute-scores.ts`
- Modify: `apps/backend/package.json` (scripts)

**Interfaces:**
- Consumes: `computePaperScore`, `ScoreInput` (Task 2); `computeQuality` (already exported from `sync.service.ts`).
- Produces: `paper.aiScore` populated on sync; `pnpm --filter backend score:recompute`.

- [ ] **Step 1: Add the `aiScore` sub-document to the schema**

In `paper.model.ts`, inside `paperSchema` (after the `embedding` field), add:

```ts
    aiScore: {
      type: new Schema(
        {
          recencyScore: Number,
          citationImpactScore: Number,
          metadataQualityScore: Number,
          finalScore: Number,
          modelVersion: String,
          computedAt: Date,
        },
        { _id: false },
      ),
      default: undefined,
    },
```

Add an index for sorting/filtering by overall score:

```ts
paperSchema.index({ "aiScore.finalScore": -1 });
```

- [ ] **Step 2: Wire scoring into `ingestPage`**

In `sync.service.ts`, add the import at the top:

```ts
import { computePaperScore } from "../scoring/paper-score.js";
```

In `ingestPage`, replace the quality/paper loop body (the `for (const { paper } of ingested)` block that builds `paperOps`) so the paper `$set` also writes `aiScore`. The new loop:

```ts
  const currentYear = new Date().getFullYear();
  const computedAt = new Date().toISOString();
  for (const { paper } of ingested) {
    const { checks, qualityScore, checkStatus } = computeQuality(paper);
    const aiScore = computePaperScore(
      {
        publicationYear: paper.publicationYear,
        citationCount: paper.citationCount,
        dataQualityScore: qualityScore,
      },
      currentYear,
      computedAt,
    );
    qualityOps.push({
      updateOne: {
        filter: { paperId: paper._id },
        update: {
          $set: { ...checks, paperId: paper._id, qualityScore, checkStatus, checkedAt: new Date() },
        },
        upsert: true,
      },
    });
    paperOps.push({
      updateOne: {
        filter: { _id: paper._id },
        update: {
          $set: {
            dataQualityScore: qualityScore,
            isAiAnalyzable: qualityScore >= 0.7 && checks.hasAbstract,
            dataStatus: checkStatus === "fail" ? "low-quality" : "active",
            aiScore,
          },
        },
      },
    });
  }
```

(Note: `isAiAnalyzable: qualityScore >= 0.7 && checks.hasAbstract` is the gate from `fix/abstract-quality-gate` — keep it if that branch is already merged; otherwise this restores it. If a merge conflict arises, prefer the `&& checks.hasAbstract` form.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter backend typecheck`
Expected: PASS.

- [ ] **Step 4: Write the recompute backfill script**

Create `apps/backend/scripts/recompute-scores.ts`:

```ts
/**
 * Backfill paper.aiScore for every existing paper (computePaperScore only runs
 * at sync time). Deterministic + idempotent — safe to re-run.
 * Run: pnpm --filter backend exec tsx scripts/recompute-scores.ts
 */
import "dotenv/config";
import type { AnyBulkWriteOperation } from "mongoose";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";
import { computePaperScore } from "../src/modules/scoring/paper-score.js";

async function main(): Promise<void> {
  await connectMongo();
  const currentYear = new Date().getFullYear();
  const computedAt = new Date().toISOString();
  const cursor = PaperModel.find({}, "publicationYear citationCount dataQualityScore").lean().cursor();

  let scanned = 0;
  let ops: AnyBulkWriteOperation[] = [];
  const flush = async (): Promise<void> => {
    if (ops.length === 0) return;
    await PaperModel.bulkWrite(ops as AnyBulkWriteOperation<never>[], { ordered: false });
    ops = [];
  };

  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    scanned += 1;
    const aiScore = computePaperScore(
      {
        publicationYear: doc.publicationYear ?? 0,
        citationCount: doc.citationCount ?? 0,
        dataQualityScore: doc.dataQualityScore ?? 0,
      },
      currentYear,
      computedAt,
    );
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { aiScore } } } });
    if (ops.length >= 500) await flush();
  }
  await flush();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ scanned }, null, 2));
  await disconnectMongo();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 5: Register the npm script**

In `apps/backend/package.json` `scripts`, after `"db:purge-sources": ...`, add:

```json
    "score:recompute": "tsx scripts/recompute-scores.ts",
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter backend typecheck`
Expected: PASS.

```bash
git add apps/backend/src/modules/papers/models/paper.model.ts apps/backend/src/modules/api-sync/sync.service.ts apps/backend/scripts/recompute-scores.ts apps/backend/package.json
git commit -m "feat(scoring): persist aiScore at sync + score:recompute backfill"
```

---

### Task 4: References — OpenAlex type + normalizer (pure) + tests

**Files:**
- Modify: `apps/backend/src/modules/api-sync/providers/openalex.types.ts`
- Modify: `apps/backend/src/modules/api-sync/providers/openalex.normalizer.ts`
- Modify: `apps/backend/src/modules/api-sync/providers/__tests__/openalex.normalizer.test.ts`

**Interfaces:**
- Produces: `NormalizedPaper.referencedWorks: string[]`; `OpenAlexWork.referenced_works`.

- [ ] **Step 1: Add the failing test**

In `openalex.normalizer.test.ts`, add inside `describe("normalizeOpenAlexWork")`:

```ts
  it("maps referenced_works, stripping the OpenAlex URL prefix", () => {
    const n = normalizeOpenAlexWork({
      ...base,
      referenced_works: ["https://openalex.org/W111", "https://openalex.org/W222"],
    });
    expect(n.referencedWorks).toEqual(["W111", "W222"]);
  });

  it("defaults referenced_works to [] when missing", () => {
    expect(normalizeOpenAlexWork({ ...base, referenced_works: null }).referencedWorks).toEqual([]);
    expect(normalizeOpenAlexWork({ id: "https://openalex.org/W999" }).referencedWorks).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/api-sync/providers`
Expected: FAIL (`referencedWorks` is undefined / not on type).

- [ ] **Step 3: Add the field to the OpenAlex type**

In `openalex.types.ts`, inside `interface OpenAlexWork`, after `abstract_inverted_index`:

```ts
  referenced_works?: string[] | null; // ["https://openalex.org/W123", ...]
```

- [ ] **Step 4: Map it in the normalizer**

In `openalex.normalizer.ts`: add `referencedWorks: string[];` to the `NormalizedPaper` interface (after `topics`), and in `normalizeOpenAlexWork`'s returned object (after `topics: ...`):

```ts
    referencedWorks: (w.referenced_works ?? []).map((r) => stripPrefix(r, "https://openalex.org/")!),
```

(`stripPrefix` already exists in this file and returns the id unchanged when the prefix is absent; the inputs here always have the prefix, so the `!` is safe.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/api-sync/providers`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/api-sync/providers/openalex.types.ts apps/backend/src/modules/api-sync/providers/openalex.normalizer.ts apps/backend/src/modules/api-sync/providers/__tests__/openalex.normalizer.test.ts
git commit -m "feat(sync): capture OpenAlex referenced_works in the normalizer"
```

---

### Task 5: References — paper model field + sync storage

**Files:**
- Modify: `apps/backend/src/modules/papers/models/paper.model.ts`
- Modify: `apps/backend/src/modules/api-sync/sync.service.ts`

**Interfaces:**
- Consumes: `NormalizedPaper.referencedWorks` (Task 4).
- Produces: `paper.referencedWorks: string[]` (persisted; `select:false`).

- [ ] **Step 1: Add the model field**

In `paper.model.ts`, inside `paperSchema` (after `embedding`), add:

```ts
    /** OpenAlex IDs this paper cites (referenced_works). select:false — heavy. */
    referencedWorks: { type: [String], default: [], select: false },
```

- [ ] **Step 2: Store on insert + merge in `upsertPaper`**

In `sync.service.ts` `upsertPaper`: when inserting a new paper, include `referencedWorks: n.referencedWorks` in the created document. In the merge branch (the `existing.*` updates near the `abstractText` merge), add:

```ts
  if ((n.referencedWorks?.length ?? 0) > 0 && (existing.referencedWorks?.length ?? 0) === 0) {
    existing.referencedWorks = n.referencedWorks;
  }
```

(If `upsertPaper` builds the insert via spreading `NormalizedPaper`, `referencedWorks` is already included — verify the insert path carries it.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter backend typecheck`
Expected: PASS.

```bash
git add apps/backend/src/modules/papers/models/paper.model.ts apps/backend/src/modules/api-sync/sync.service.ts
git commit -m "feat(papers): persist referencedWorks on sync"
```

---

### Task 6: References — OpenAlex client `fetchWorksByIds` + backfill script

**Files:**
- Modify: `apps/backend/src/modules/api-sync/providers/openalex.client.ts`
- Create: `apps/backend/scripts/backfill-references.ts`
- Modify: `apps/backend/package.json` (scripts)

**Interfaces:**
- Produces: `fetchWorksByIds(ids: string[]): Promise<Array<{ id: string; referenced_works: string[] }>>`; `pnpm --filter backend references:backfill`.

- [ ] **Step 1: Add `fetchWorksByIds` to the client**

In `openalex.client.ts`, add (reusing `fetchWithRetry`, the rate limit, and mailto):

```ts
/**
 * Fetch `referenced_works` for up to 50 works by OpenAlex ID in ONE request
 * (filter=openalex_id:W1|W2..., select trims the payload). Returns the stripped
 * id + its referenced_works (also stripped of the URL prefix).
 */
export async function fetchWorksByIds(
  ids: string[],
): Promise<Array<{ id: string; referenced_works: string[] }>> {
  if (ids.length === 0) return [];
  const url = new URL(BASE_URL);
  url.searchParams.set("filter", `openalex_id:${ids.join("|")}`);
  url.searchParams.set("select", "id,referenced_works");
  url.searchParams.set("per-page", String(ids.length));
  if (env.OPENALEX_MAILTO) url.searchParams.set("mailto", env.OPENALEX_MAILTO);

  const json = await fetchWithRetry(url.toString());
  return (json.results ?? []).map((w) => ({
    id: (w.id ?? "").replace("https://openalex.org/", ""),
    referenced_works: (w.referenced_works ?? []).map((r) => r.replace("https://openalex.org/", "")),
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter backend typecheck`
Expected: PASS.

- [ ] **Step 3: Write the backfill script**

Create `apps/backend/scripts/backfill-references.ts`:

```ts
/**
 * Backfill referenced_works for existing papers that have an openalexId but no
 * referencedWorks yet. Batches 50 ids/request (~300 requests for 15k papers),
 * resumable (skips filled papers). Run: pnpm --filter backend exec tsx scripts/backfill-references.ts
 */
import "dotenv/config";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";
import { fetchWorksByIds } from "../src/modules/api-sync/providers/openalex.client.js";

const BATCH = 50;

async function main(): Promise<void> {
  await connectMongo();
  const docs = await PaperModel.find(
    { "externalIds.openalexId": { $exists: true, $ne: null }, referencedWorks: { $size: 0 } },
    "externalIds.openalexId",
  )
    .lean()
    .exec();

  let updated = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    const byOpenalex = new Map(
      slice
        .map((d) => [(d.externalIds as { openalexId?: string })?.openalexId, d._id] as const)
        .filter((e): e is [string, typeof slice[number]["_id"]] => !!e[0]),
    );
    const ids = [...byOpenalex.keys()];
    const works = await fetchWorksByIds(ids);
    const ops = works
      .map((w) => {
        const _id = byOpenalex.get(w.id);
        if (!_id || w.referenced_works.length === 0) return null;
        return { updateOne: { filter: { _id }, update: { $set: { referencedWorks: w.referenced_works } } } };
      })
      .filter(Boolean);
    if (ops.length) {
      await PaperModel.bulkWrite(ops as never[], { ordered: false });
      updated += ops.length;
    }
    // eslint-disable-next-line no-console
    console.log(`batch ${i / BATCH + 1}: +${ops.length} (total ${updated})`);
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ candidates: docs.length, updated }, null, 2));
  await disconnectMongo();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 4: Register the npm script**

In `apps/backend/package.json` `scripts`, after `"score:recompute": ...`, add:

```json
    "references:backfill": "tsx scripts/backfill-references.ts",
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter backend typecheck`
Expected: PASS.

```bash
git add apps/backend/src/modules/api-sync/providers/openalex.client.ts apps/backend/scripts/backfill-references.ts apps/backend/package.json
git commit -m "feat(sync): OpenAlex fetchWorksByIds + references:backfill script"
```

---

### Task 7: References — paper.service.getReferences + route

**Files:**
- Modify: `apps/backend/src/modules/papers/paper.service.ts`
- Modify: `apps/backend/src/modules/papers/paper.routes.ts`
- Test: `apps/backend/src/modules/papers/__tests__/paper-refs.test.ts`

**Interfaces:**
- Consumes: `PaperRef` from `@trend/shared-types`; `paper.referencedWorks`.
- Produces: `paperService.getReferences(id): Promise<{ references: PaperRef[]; totalReferenced: number; inCorpus: number }>`; pure helper `toPaperRef(doc)`; route `GET /papers/:id/references`.

- [ ] **Step 1: Write the failing test (pure mapper)**

Create `apps/backend/src/modules/papers/__tests__/paper-refs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPaperRef } from "../paper.service.js";

describe("toPaperRef", () => {
  it("maps a lean paper doc to a PaperRef", () => {
    const ref = toPaperRef({
      _id: "abc",
      title: "T",
      publicationYear: 2024,
      authors: [{ displayName: "A", position: 0 }],
      externalIds: { doi: "10.x/y" },
    });
    expect(ref).toEqual({
      id: "abc",
      title: "T",
      publicationYear: 2024,
      authors: [{ displayName: "A", position: 0 }],
      doi: "10.x/y",
    });
  });

  it("defaults authors to [] and omits doi when absent", () => {
    const ref = toPaperRef({ _id: "x", title: "T", publicationYear: 2020 });
    expect(ref.authors).toEqual([]);
    expect(ref.doi).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/papers`
Expected: FAIL (`toPaperRef` is not exported).

- [ ] **Step 3: Implement `toPaperRef` + `getReferences`**

In `paper.service.ts`, add the import:

```ts
import type { Paper, PaperRef } from "@trend/shared-types";
```

Add the exported pure mapper (near `toPaperDto`):

```ts
/** Map a lean paper doc (any projection incl. _id/title/year/authors/doi) to a PaperRef. */
export function toPaperRef(doc: Record<string, unknown>): PaperRef {
  const ext = doc.externalIds as { doi?: string } | undefined;
  return {
    id: String(doc._id),
    title: String(doc.title ?? ""),
    publicationYear: Number(doc.publicationYear ?? 0),
    authors: (doc.authors as PaperRef["authors"]) ?? [],
    ...(ext?.doi ? { doi: ext.doi } : {}),
  };
}
```

Add to the `paperService` object:

```ts
  /** Resolve a paper's referenced OpenAlex IDs to the papers we hold in corpus. */
  async getReferences(
    id: string,
  ): Promise<{ references: PaperRef[]; totalReferenced: number; inCorpus: number }> {
    const paper = await PaperModel.findById(id).select("referencedWorks").lean();
    if (!paper) throw AppError.notFound("Paper not found");
    const refs = (paper as { referencedWorks?: string[] }).referencedWorks ?? [];
    if (refs.length === 0) return { references: [], totalReferenced: 0, inCorpus: 0 };
    const docs = await PaperModel.find({ "externalIds.openalexId": { $in: refs } })
      .select("title publicationYear authors externalIds")
      .lean();
    const references = docs.map(toPaperRef);
    return { references, totalReferenced: refs.length, inCorpus: references.length };
  },
```

Add the `AppError` import if not present:

```ts
import { AppError } from "../../common/exceptions/app-error.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/papers`
Expected: PASS.

- [ ] **Step 5: Add the route**

In `paper.routes.ts`, add BEFORE the `GET /:id` route (so `/:id/references` is matched specifically — Express 5 matches in order, and `/:id` would not capture `/:id/references`, but keep references first for clarity):

```ts
/** GET /papers/:id/references — references resolved to in-corpus papers. */
paperRouter.get("/:id/references", async (req, res) => {
  const data = await paperService.getReferences(req.params.id);
  res.json({ success: true, data });
});
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter backend typecheck`
Expected: PASS.

```bash
git add apps/backend/src/modules/papers/paper.service.ts apps/backend/src/modules/papers/paper.routes.ts apps/backend/src/modules/papers/__tests__/paper-refs.test.ts
git commit -m "feat(papers): GET /papers/:id/references resolved to in-corpus papers"
```

---

### Task 8: Reports — resolve `groundingPapers` (order-preserving) on GET /reports/:id

**Files:**
- Modify: `apps/backend/src/modules/papers/paper.service.ts`
- Modify: `apps/backend/src/modules/reports/report.service.ts`
- Test: `apps/backend/src/modules/papers/__tests__/order-by-ids.test.ts`

**Interfaces:**
- Consumes: `toPaperRef` (Task 7); `PaperRef`.
- Produces: `paperService.getSummariesByIds(ids: string[]): Promise<PaperRef[]>` (input order preserved); pure helper `orderByIds(refs, ids)`.

- [ ] **Step 1: Write the failing test (pure order helper)**

Create `apps/backend/src/modules/papers/__tests__/order-by-ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { orderByIds } from "../paper.service.js";

describe("orderByIds", () => {
  it("returns refs in the requested id order, dropping misses", () => {
    const refs = [
      { id: "b", title: "B", publicationYear: 2021, authors: [] },
      { id: "a", title: "A", publicationYear: 2020, authors: [] },
    ];
    expect(orderByIds(refs, ["a", "missing", "b"]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/papers`
Expected: FAIL (`orderByIds` not exported).

- [ ] **Step 3: Implement `orderByIds` + `getSummariesByIds`**

In `paper.service.ts`, add the pure helper:

```ts
/** Reorder resolved refs to match the requested id order; drop ids not found. */
export function orderByIds(refs: PaperRef[], ids: string[]): PaperRef[] {
  const byId = new Map(refs.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is PaperRef => !!r);
}
```

Add to the `paperService` object:

```ts
  /** Resolve paper ids to PaperRefs in the SAME order as `ids` (RETRIEVAL ORDER). */
  async getSummariesByIds(ids: string[]): Promise<PaperRef[]> {
    if (ids.length === 0) return [];
    const docs = await PaperModel.find({ _id: { $in: ids } })
      .select("title publicationYear authors externalIds")
      .lean();
    return orderByIds(docs.map(toPaperRef), ids);
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/papers`
Expected: PASS.

- [ ] **Step 5: Wire into report.service.getById**

In `report.service.ts`, add the import:

```ts
import { paperService } from "../papers/paper.service.js";
```

Replace `getById` so it attaches resolved grounding papers:

```ts
  /** Full report — owner only. 404 (not 403) so we don't leak existence. */
  async getById(userId: string, id: string): Promise<AnalyticalReport> {
    const doc = await ReportModel.findOne({ _id: id, userId }).lean().catch(() => null);
    if (!doc) throw AppError.notFound("Report not found");
    const report = toReportDto(doc);
    report.groundingPapers = await paperService.getSummariesByIds(report.groundingPaperIds ?? []);
    return report;
  },
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter backend typecheck`
Expected: PASS.

```bash
git add apps/backend/src/modules/papers/paper.service.ts apps/backend/src/modules/reports/report.service.ts apps/backend/src/modules/papers/__tests__/order-by-ids.test.ts
git commit -m "feat(reports): resolve groundingPapers (retrieval order) on GET /reports/:id"
```

---

### Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: 4/4 packages PASS.

- [ ] **Step 2: Run the backend test suite**

Run: `pnpm --filter backend test`
Expected: PASS (incl. new scoring, normalizer-refs, paper-refs, order-by-ids tests).

- [ ] **Step 3: (Data — when ready) run the backfills**

```bash
pnpm --filter backend exec tsx scripts/recompute-scores.ts        # aiScore for all papers
pnpm --filter backend exec tsx scripts/backfill-references.ts      # referenced_works (OpenAlex)
```
Expected: each prints a JSON summary; safe + idempotent.

- [ ] **Step 4: (Quota-gated) verify RAG e2e**

When the Gemini embed quota is available, run:
```bash
pnpm --filter backend exec tsx scripts/run-report-once.ts "trends in large language models for education"
```
Expected: `status=ready`; the stored report has `groundingPaperIds`; GET /reports/:id returns `groundingPapers` of the same length, in order.

---

## Self-Review (done at authoring)

- **Spec coverage:** Feature 1 → Tasks 1–3; Feature 2 → Tasks 4–7; Feature 3 → Tasks 1(step 2)+8; verification → Task 9. FE explicitly out of scope (AG handoff). ✅
- **Placeholders:** none — every code step has complete code. ✅
- **Type consistency:** `PaperAiScore`/`PaperRef` defined in Task 1 and consumed verbatim in Tasks 2/7/8; `computePaperScore(input, currentYear, computedAt)` signature consistent across Tasks 2/3; `toPaperRef`/`orderByIds`/`getSummariesByIds`/`getReferences` names consistent across Tasks 7/8. ✅
- **Note:** Task 3 references the `isAiAnalyzable && checks.hasAbstract` gate from `fix/abstract-quality-gate`; if that PR is merged into the branch base, keep its form on conflict.
