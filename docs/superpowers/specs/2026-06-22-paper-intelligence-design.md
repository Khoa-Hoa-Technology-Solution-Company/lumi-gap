# Paper Intelligence — Design Spec

> Date: 2026-06-22 · Status: approved (brainstorming), pending implementation plan
> Scope: 3 cohesive features that make paper data richer AND honest.
> Boundary: this spec covers BACKEND + data contracts (built by Claude). All
> UI/UX is delegated to Antigravity — see `docs/AG-paper-intelligence-handoff.md`.

---

## 0. Why

Two credibility problems + one missing capability surfaced while reviewing the app:

1. The paper detail "AI Analysis Summary" showed **fabricated** scores (hardcoded
   `0.95` / `0.88` / "Confidence: High") because `aiScore` is never computed.
   (Already mitigated by hiding the panel — PR #30.)
2. Papers carry **no references** — OpenAlex `referenced_works` is discarded.
3. The RAG report viewer is **mostly mock** (hardcoded growth chart, fake
   metadata "Gemini 2.5 Pro / 12,405 papers / 45s / ~$0.42", fake "Verification
   Steps", no real sources, citations `[n]` not clickable).

This spec replaces fabrication with real, computed, grounded data.

---

## 1. Feature — Real paper AI score (deterministic, intrinsic)

**Decision:** the per-paper `aiScore` is **paper-intrinsic** and computed by
**deterministic formula** (no LLM, no Gemini quota — scales to all 15k papers).
Query-dependent relevance stays where it belongs: the cosine `score` in search.

### Data model
Redefine `PaperAiScore` in `packages/shared-types/src/paper.ts` to the intrinsic
shape (it is currently unused except the removed FE fallback):

```ts
export interface PaperAiScore {
  recencyScore: number;        // 0..1 — newer = higher
  citationImpactScore: number; // 0..1 — normalized log(citationCount)
  metadataQualityScore: number;// 0..1 — = dataQualityScore
  finalScore: number;          // 0..1 — weighted blend
  modelVersion: string;        // e.g. "paper-score-v1"
  computedAt: ISODateString;
}
```
Mongoose `paper.model.ts`: add an embedded `aiScore` sub-document (same fields).

### Scoring (`apps/backend/src/modules/scoring/paper-score.ts`, pure functions)
- `recencyScore` = clamp01(1 − (CURRENT_YEAR − publicationYear) / RECENCY_WINDOW),
  `RECENCY_WINDOW = 10`. (Papers older than 10y → 0; current year → 1.)
- `citationImpactScore` = clamp01(log10(citationCount + 1) / log10(CITATION_CAP + 1)),
  `CITATION_CAP = 1000`. (0 cites → 0; ≥1000 → 1; log so it isn't dominated by megahits.)
- `metadataQualityScore` = `dataQualityScore` (already on the paper).
- `finalScore` = `0.40*citationImpact + 0.35*recency + 0.25*metadataQuality`
  (weights are constants — tunable; documented in code).
- `CURRENT_YEAR` is passed in (pure function; caller supplies it — no `new Date()`
  inside the pure module).

### Where computed
- **Forward:** in `sync.service.ts` `ingestPage`, alongside `computeQuality`,
  denormalize `aiScore` onto the paper (same bulk write).
- **Backfill existing 15k:** `pnpm --filter backend score:recompute`
  (`scripts/recompute-scores.ts`) — iterate all papers, compute, bulk-update.
  Idempotent; safe to re-run.

### FE → AG
Re-enable the paper-detail AI panel with intrinsic labels **Impact / Recency /
Metadata Quality** (+ `finalScore` headline), reading the real `paper.aiScore`.
No fabricated fallback. See handoff §1.

---

## 2. Feature — References (OpenAlex `referenced_works`)

**Decision:** store the referenced OpenAlex IDs; on the detail page, resolve and
link the references that exist **in our corpus**. Out-of-corpus refs are counted
only (no extra per-ref API calls).

### Ingestion
- `openalex.types.ts`: add `referenced_works?: string[] | null` to `OpenAlexWork`.
- `openalex.normalizer.ts`: map `referencedWorks: (w.referenced_works ?? []).map(strip "https://openalex.org/")`.
- `paper.model.ts`: add `referencedWorks: { type: [String], default: [], select: false }`
  (heavy-ish: ~30–100 IDs/paper ≈ 22MB across 15k — acceptable on M0; `select:false`
  so list/search queries don't carry it).
- `sync.service.ts`: persist `referencedWorks` on insert/merge (merge: set if the
  incoming list is non-empty and existing is empty).

### Backfill existing papers
`pnpm --filter backend references:backfill` (`scripts/backfill-references.ts`):
- Find papers with `externalIds.openalexId` set and no `referencedWorks` yet.
- Batch by 50, fetch from OpenAlex with `filter=openalex_id:W..|W..` (1 request/50
  papers ≈ 300 requests for 15k), respect the existing client's rate limit, store.
- Resumable (skips already-filled papers); logs progress + a no-silent-cap summary.

### API
`GET /api/v1/papers/:id/references` →
```
{ success, data: { references: PaperRef[], totalReferenced: number, inCorpus: number } }
```
where `PaperRef = { id, title, publicationYear, authors[] }` for refs found in the
corpus (match `externalIds.openalexId ∈ paper.referencedWorks`). `totalReferenced`
= length of `referencedWorks`; `inCorpus` = resolved count. New `paper.service`
method + thin controller; reuse existing route file.

### FE → AG
Paper-detail "References (N)" section: list in-corpus refs (clickable →
`/papers/:id`), show "N referenced works · M in library". See handoff §2.

---

## 3. Feature — RAG e2e: real sources + clickable citations (de-mock report)

The RAG pipeline already works (embed query → `$vectorSearch` → Gemini generate
with `[n]` grounding → store `markdown` + `groundingPaperIds` + `researchGaps`).
"Đầy đủ" = make the **report viewer honest and grounded**.

### Backend
`GET /api/v1/reports/:id` (single report) additionally returns the **resolved
grounding papers**, in retrieval order (so `[n]` → `groundingPapers[n-1]`):
```
data.groundingPapers: { id, title, publicationYear, authors[], doi? }[]
```
Resolve `groundingPaperIds` via `paper.service` (preserve order; do NOT sort —
citation indices depend on it). `groundingPaperIds` itself stays in the payload.

### FE → AG (de-mock + wire real data) — the bulk of the work
Remove ALL fabricated content from `report-viewer.tsx`:
- hardcoded `growthData` bar chart + "Publication Volume Growth >400%" + `[2]`
- executive-summary fallback paragraph
- "Reports › Education ›" breadcrumb literal
- Report Metadata: "Gemini 2.5 Pro / 12,405 papers / 45s / ~$0.42" → real
  (`modelVersion`, `groundingPapers.length`, timing if available)
- "Verification Steps" (Scopus / Hallucination 99% / etc.) → remove (we do none
  of that), or replace with the honest "Grounded on N papers".

Then render the real report:
- markdown body as-is
- a **"Sources"** section listing `groundingPapers` (clickable → `/papers/:id`)
- make `[n]` in the markdown clickable → `groundingPapers[n-1]` (`/papers/:id`).

See handoff §3 (this is FE-heavy; Claude provides the API; AG builds the UI).

### Verification
Run `pnpm --filter backend exec tsx scripts/run-report-once.ts "<q>"` once embed
quota is available (flash-lite generate + generateJSON already verified). Confirm
`status=ready`, `groundingPaperIds` populated, `[n]` ≤ groundingPapers length.

---

## 4. Out of scope (YAGNI / later)
- `trendAlignmentScore` and "Cited by" reverse index (need trends/extra index).
- LLM-based paper scoring (quota; deterministic is enough + free).
- Full-text RAG / fetching titles for every out-of-corpus reference.

## 5. Testing
- `paper-score.ts`: unit tests (recency/citation/metadata/blend edge cases:
  year 0, citations 0, huge citations, current year).
- `normalizer`: referenced_works mapping (missing → []).
- `references` + `reports/:id` services: resolve-order + in-corpus filtering.

## 6. Build order (for the plan)
1. shared-types (`PaperAiScore`, `PaperRef`, report `groundingPapers`).
2. scoring module + tests + sync wiring + `score:recompute`.
3. references: type + normalizer + model + sync + `references:backfill` + API.
4. reports `:id` resolve grounding papers.
5. AG handoff doc (FE) — already drafted alongside this spec.
