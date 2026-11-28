# Academic Mentor Recommendation — Scientific Evaluation Protocol

> Status: **Protocol & Synthetic Engineering Benchmark Ready — Human Expert Ground-Truth Collection Pending.**
> Do not present synthetic fixture metrics as human-validated academic proof.

## 1. Separation of Evaluation Responsibilities

| Stakeholder | Evaluates | Never conflated with |
|---|---|---|
| **Independent Academic Experts** | Relevance of lecturer expertise to research problem & specific needs, adequacy of supporting evidence, academic defensibility | Student satisfaction or UI polish |
| **Undergraduate / Student Researchers** | Understandability of needs & explanations, ability to identify uncertainties & next questions, decision support usability | Proof of academic recommendation accuracy |
| **Lecturers** | Confirmation of intended mentoring scope (`CAN_SUPPORT`, `NEEDS_DISCUSSION`, `OUTSIDE_SCOPE`), willingness, and capacity | Independent third-party quality certification |
| **Engineering Regression Suite** | Eligibility/capacity enforcement, authorization, privacy, provenance accuracy, deterministic ranking, AI output validation | Human expert relevance judgment |

## 2. Pilot Dataset Design (20–30 Scenarios)

Construct a stratified pilot set of **24–30 research project scenarios** spanning:
1. Early-stage / sparse topic descriptions (no finalized methodology).
2. Domain-specific technical projects (e.g., LLM + Information Retrieval, Software Vulnerability Detection).
3. Methodological / interdisciplinary projects (e.g., Educational Technology + Qualitative Study, AI in Healthcare + Systematic Review).
4. Projects requiring complementary multi-mentor expertise.
5. Abstention / no-eligible-match scenarios.

## 3. Expert-Labeled Ground Truth Rubric

Recruit at least **2 independent academic reviewers** per project–candidate pair (blinded to algorithm scores and names where feasible).

Ordinal relevance scale (project-specific relevance, **never** overall lecturer quality):
- `0`: No meaningful academic relation found in supplied information.
- `1`: Limited relation (e.g., broad parent discipline only).
- `2`: Meaningfully related to at least one core research need.
- `3`: Strongly related with traceable evidence for essential research needs.
- `Unknown`: Insufficient evidence supplied to judge.

### Disagreement & Inter-Rater Reliability
- Preserve individual reviewer judgments verbatim — never overwrite disagreements into artificial unanimity.
- Report **Krippendorff's alpha (ordinal)** or **quadratic weighted Cohen's kappa** across overlapping ratings, alongside `Unknown` rate and sample size `n`.
- Never generate LLM labels and report them as human expert judgments.

## 4. Baseline Comparison Design

Evaluate under identical eligibility and capacity filters on the exact same frozen dataset:
1. **Baseline 1 — Keyword Matching**: normalized exact term overlap between project terms and lecturer profile tags.
2. **Baseline 2 — Semantic Similarity**: cosine similarity between project/need embeddings and lecturer profile/publication vectors (when compatible 768-dim vectors exist).
3. **Proposed Method — Hybrid Need-Level Recommendation (`mentor-hybrid-v1.0-experimental`)**: taxonomy hierarchy + publication evidence (title/abstract/topic with anti-volume cap) + declared mentoring support + methodology + stage + optional semantic blend, with explicit abstention.

### Metrics
- **Precision@K** (`K = 1, 3`): fraction of top-K eligible recommendations rated `>= 2`.
- **Recall@K**: fraction of all eligible `>= 2` candidates retrieved in top-K.
- **NDCG@K**: graded ranking quality using ordinal labels `0..3`.
- **MRR**: reciprocal rank of the first `>= 2` candidate.
- **Eligible Recommendation Rate**: fraction of highlighted recommendations that satisfy live eligibility & capacity rules (target: `100%`).
- **Abstention Rate**: fraction of sparse/no-overlap scenarios where the system abstains rather than forcing low-evidence recommendations.
- **Stratified Performance by Profile Completeness** (`RICH` vs `PARTIAL` vs `SPARSE`) to monitor fairness for early-career or unlinked lecturers.

## 5. Explanation Quality & Student Usability Evaluation

Evaluate explanations independently along 6 dimensions (Tintarev & Masthoff, 2011):
1. **Faithfulness**: every claimed signal matches actual engine signals.
2. **Factual correctness**: zero fabricated publications, excerpts, verification badges, or capacity.
3. **Evidence mapping**: clear provenance (`PROFILE_DECLARATION`, `PUBLICATION_ABSTRACT`, `PUBLICATION_TITLE`, `MENTORING_PREFERENCE`, etc.).
4. **Understandability**: students can state which needs have evidence vs need discussion.
5. **Uncertainty communication**: missing data is distinguished from lack of competence.
6. **Appropriate reliance**: students distinguish a recommendation from guaranteed mentoring suitability.
