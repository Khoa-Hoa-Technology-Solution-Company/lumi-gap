# Golden dataset G0 (trend methodology, phase P0)

Created 2026-10-21 for `docs/research-trends/05_IMPLEMENTATION_PLAN.md` P0.0, before any
algorithm change. Tests must read these files and never call the network.

| File | Content | Source |
|---|---|---|
| `g0-hand-examples.json` | A 7-year share series and the expected Mann–Kendall S, Var(S), Z, normal p, τ; Sen's slope and its 95% rank CI; relative change; a Benjamini–Hochberg example; a 2×2 log odds ratio example; a tied Mann–Kendall example | Computed with an independent Python implementation (stdlib only, `math.erfc` for the normal tail), not with the TypeScript code under test. Script: `hand_examples.py` (kept in the P0 working notes, reproduced in the phase report) |
| `g0-mann-kendall-exact-null.json` | Exact null distribution of S without ties: for n = 3…10, the number of orderings giving each S | Full enumeration of all n! orderings (n = 10: 3 628 800) in Python. This is the definition of the exact distribution, so it needs no printed table. Spot check: n = 5, S = 10 → two-sided p = 2/120 = 0.0167 |
| `openalex-recorded-2026-10-21.json` | Real OpenAlex responses: rate-limit headers of a keyless `group_by`, the 401 body of a keyless cursor page 2, yearly counts of topic T10028, yearly totals split by `primary_topic.id:null` / `!null`, and the first cursor page of `group_by=primary_topic.id:include_unknown` for 2024 | Read-only keyless GET requests to `https://api.openalex.org` on 2026-10-21. Values copied, not edited. Counts change daily upstream, so use them as recorded examples, not as live truth |

## Golden dataset G1 (GGT, phase P1)

Created 2026-10-21 for P1.0. File: `g1-ggt-nelis-2022.json`.

| Part | Content | Status |
|---|---|---|
| `fields[]` | Yearly field counts (PS), reference totals (PO) and the authors' own cached annual GGT (fraction) for Microplastics, NAFLD, Proteomics (S2) and Sensor arrays, Climate Change (S1) | **Verified**: Eq (i) recomputed from PS/PO reproduces the authors' GGT column exactly (max abs diff 0) in all 43 field sheets of S1/S2 |
| `claims[]` | Every "mean ± x" the paper prints with an explicit year window, recomputed as arithmetic mean with sample SD, sample SEM and population SEM, for two window conventions | **Partly reproducible**: arithmetic mean + sample SEM matches 4 of 12 printed values (NAFLD, Proteomics, Microplastics 2005–2011, Climate Change); 8 match no candidate (the paper's summaries may come from another data pull or window). The abstract reports Microplastics 2012–2018 as "± 10%" while the text says "± 4%" |
| `handExamples` | A clean 6-year series (annual GGT, mean, sample SD, SEM) and an edge-case series (missing year, zero previous count, zero reference count) | Computed independently in Python. Zero reference count in the current year → null (`ZERO_BASELINE`, project convention) |

Source: Nelis et al. (2022), PLOS ONE 17(5): e0268433, supplementary files S1–S3 (`journal.pone.0268433.s001–s003.xlsx`, CC BY 4.0), downloaded 2026-10-21. The template S3 defines GGT as `N = C − I`, with `C = (B_y − B_{y−1})/B_{y−1}` (field) and `I` the same for the reference; it contains no mean/SEM formula.

Notes
- The T10028 series used 3 work types (`article|review|preprint`), not the 5 default types of the app.
- The Sen CI uses linear interpolation between neighbouring ranks when a rank is fractional (project convention documented in `trend.statistics.ts`); the Python reference applies the same rule.
