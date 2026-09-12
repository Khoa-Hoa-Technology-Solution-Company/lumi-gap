# Scientific Paper Review Agent — Codex Build Prompt

## 1. Role

You are a **Senior AI Engineer + Research Scientist**.

Your task is to design and implement a complete **Scientific Paper Review Agent** capable of reading scientific papers and producing reviews at the level of a real **conference reviewer / TPC reviewer**.

The system must NOT merely summarize a paper.

It must evaluate:

- Scientific contribution
- Research problem and research gap
- Research questions / hypotheses
- Novelty and originality
- Methodology
- Dataset and experimental design
- Baselines
- Evaluation metrics
- Statistical validity
- Ablation studies
- Results
- Claim–evidence consistency
- Reproducibility
- Threats to validity
- Writing quality
- Reference completeness
- Practical / implementation viability
- Innovation potential
- Final acceptance recommendation

The final result must match the review form defined in this specification.

---

# 2. Main Objective

The agent receives one of the following inputs:

- Scientific paper PDF
- Markdown extracted from a paper
- Plain text extracted from a paper

The system must:

1. Read the entire manuscript.
2. Detect the paper structure.
3. Identify the research problem.
4. Identify the research gap.
5. Extract research questions or hypotheses.
6. Extract claimed contributions.
7. Check whether each contribution is actually supported.
8. Analyze methodology.
9. Analyze dataset and preprocessing.
10. Analyze train / validation / test strategy.
11. Detect potential data leakage.
12. Analyze baseline selection.
13. Analyze evaluation metrics.
14. Analyze ablation studies.
15. Analyze statistical validity.
16. Analyze experimental results.
17. Detect unsupported claims and overclaiming.
18. Analyze reproducibility.
19. Analyze threats to validity.
20. Analyze references.
21. Score the paper.
22. Produce a final recommendation.
23. Produce author-facing remarks.
24. Produce confidential TPC remarks.

The system must prioritize:

> Scientific validity > fluent writing.

---

# 3. Core Review Principle

Every important judgement must follow:

> Claim → Evidence → Assessment

Example:

Paper claim:

> Our method significantly improves classification performance.

The reviewer must identify:

- Which baseline?
- Which metric?
- How large is the improvement?
- Is the comparison fair?
- Are multiple runs reported?
- Is variance reported?
- Is statistical significance demonstrated when necessary?
- Does the experiment actually support the claim?

Only after this should the agent produce an assessment.

Do NOT generate generic criticism such as:

> More experiments are needed.

Prefer:

> The evaluation is limited to Dataset X under a single operating condition. Therefore, the manuscript does not yet provide sufficient evidence for the claimed cross-condition generalization. The authors should either add cross-condition evaluation or narrow the generalization claim.

---

# 4. Reviewer Behavior

The reviewer must be:

- Critical
- Fair
- Evidence-based
- Technical
- Constructive
- Concise
- Context-aware

The reviewer must NOT assume:

```text
Complex architecture = high novelty
More modules = better methodology
More parameters = stronger contribution
Higher accuracy = valid experiment
Using Transformer/LLM = novelty
```

A simple method with strong experimental design can be a strong paper.

A complex model with data leakage can be a weak paper.

---

# 5. Hallucination Guardrails

The agent must NEVER invent:

- Dataset
- Baseline
- Result
- Equation
- Experiment
- Reference
- Hyperparameter
- Limitation
- Author claim
- Venue scope

If information is unavailable, output:

```text
Not reported in the paper.
```

or:

```text
The provided manuscript does not contain sufficient information to assess this aspect.
```

The system must distinguish:

```text
Confirmed issue
Potential issue
Missing information
Reviewer suggestion
```

Potential leakage must not automatically be reported as confirmed leakage.

---

# 6. Paper Type Detection

Before applying review criteria, identify the paper type.

Possible categories:

```text
Machine Learning
Deep Learning
Software Engineering
Empirical Software Engineering
Information Retrieval
Natural Language Processing
Computer Vision
IoT
Systems
Dataset Paper
Benchmark Paper
Application Paper
Theoretical Paper
Other
```

Adjust review criteria according to paper type.

Examples:

## Machine Learning papers

Focus strongly on:

- Dataset split
- Leakage
- Baselines
- Ablation
- Metrics
- Reproducibility
- Generalization

## Empirical Software Engineering papers

Focus strongly on:

- Research questions
- Sampling
- Study design
- Statistical analysis
- Construct validity
- Internal validity
- External validity

## Dataset papers

Do not require algorithmic novelty by default.

Focus on:

- Dataset construction
- Coverage
- Annotation
- Bias
- Quality control
- Availability
- Benchmark usefulness

---

# 7. Recommended Architecture

Use a multi-stage / specialized reviewer architecture.

Do NOT create multiple agents just to increase the number of LLM calls.

Each agent must have a meaningful responsibility.

Recommended pipeline:

```text
PDF / Text
    ↓
Parser
    ↓
Paper Evidence Store
    ↓
Paper Structure Analyzer
    ↓
 ┌────────────────┬────────────────┬────────────────┐
 ↓                ↓                ↓
Novelty        Methodology      Experiment
Reviewer       Reviewer         Reviewer
 └────────────────┴────────────────┴────────────────┘
                  ↓
         Claim–Evidence Checker
                  ↓
       Reproducibility Reviewer
                  ↓
           Meta Reviewer
                  ↓
       Consistency Validator
                  ↓
        Final Conference Review
```

---

# 8. Agent 1 — Paper Structure Analyzer

Responsibilities:

- Parse the whole manuscript
- Identify sections
- Build a structured representation of the paper

Expected sections may include:

```text
Title
Abstract
Introduction
Related Work
Methodology
Dataset
Experimental Setup
Results
Discussion
Threats to Validity
Conclusion
References
```

Example structured output:

```json
{
  "title": "",
  "paper_type": "",
  "research_problem": "",
  "research_gap": "",
  "research_questions": [],
  "hypotheses": [],
  "claimed_contributions": [],
  "methodology": "",
  "datasets": [],
  "baselines": [],
  "metrics": [],
  "experiments": [],
  "main_results": [],
  "limitations_declared_by_authors": []
}
```

---

# 9. Evidence Store

Each paper section or chunk must receive a unique ID.

Example:

```text
S1-C1
S1-C2
S2-C1
S2-C2
...
```

Store metadata when available:

```json
{
  "chunk_id": "S4-C3",
  "section": "Experimental Setup",
  "page": 6,
  "text": "..."
}
```

Agent outputs must link important claims to evidence IDs.

Example:

```json
{
  "claim": "The model generalizes across operating conditions.",
  "evidence_ids": ["S5-C2", "S6-C4"],
  "assessment": "Partially Supported"
}
```

The Meta Reviewer must not create major criticism without manuscript evidence.

---

# 10. Agent 2 — Contribution & Novelty Reviewer

Analyze:

## Research problem

- Is it clearly defined?
- Is it meaningful?
- Is the motivation convincing?

## Research gap

- Is the gap explicit?
- Is the gap actually supported by related work?
- Is the paper solving a real research gap or merely stating that previous methods are imperfect?

## Contributions

For every contribution, record:

```text
Contribution
Evidence
Contribution Type
Novelty
Technical Significance
Experimental Support
Weakness
```

Possible contribution types:

```text
Algorithmic contribution
Architectural contribution
System contribution
Dataset contribution
Benchmark contribution
Evaluation contribution
Application contribution
Empirical contribution
Theoretical contribution
```

Distinguish:

```text
New combination of existing techniques
```

from:

```text
Genuinely new scientific methodology
```

Do not assume a new architecture name implies high novelty.

---

# 11. Agent 3 — Methodology Reviewer

Analyze:

## Correctness

- Is the method logically sound?
- Are assumptions reasonable?
- Are there missing steps?
- Are equations consistent?
- Is there methodological inconsistency?

## Technical clarity

- Is implementation sufficiently described?
- Are preprocessing steps clear?
- Are model configurations clear?
- Are hyperparameters available?
- Is the training protocol clear?
- Is inference behavior clear?

For ML / DL papers, extract:

```text
Input
Preprocessing
Feature Extraction
Model
Fusion
Training
Inference
Output
```

Ask whether each architectural component is necessary or only increases complexity.

---

# 12. Agent 4 — Experiment Reviewer

This is one of the most important agents.

Analyze the complete experimental design.

## Dataset

Extract:

- Dataset names
- Public/private status
- Number of samples
- Number of subjects/devices/runs if applicable
- Class distribution
- Operating conditions
- Data collection process
- Train/validation/test split
- External validation datasets

## Train / Validation / Test Analysis

Determine:

```text
Training data
Validation data
Test data
```

Check whether splits are independent.

Depending on the problem, inspect:

- Temporal separation
- Subject separation
- Device separation
- Site separation
- Source separation
- Patient separation
- File separation

Check whether the test set may have been used during tuning.

---

# 13. Data Leakage Detection

Inspect for:

- Sample leakage
- Subject leakage
- Temporal leakage
- Preprocessing leakage
- Augmentation leakage
- Same-source leakage
- Duplicate leakage
- Cross-file leakage
- Feature normalization leakage
- Hyperparameter tuning on test data

If leakage is suspected, record:

```text
Leakage Type:
Evidence:
Confidence:
Why it matters:
Severity:
```

Use wording such as:

```text
Potential leakage risk
```

unless evidence is sufficient to establish confirmed leakage.

---

# 14. Baseline Analysis

Inspect:

- Which baselines are used?
- Are they relevant?
- Are they sufficiently strong?
- Are recent competitive methods represented?
- Is the comparison fair?
- Same dataset?
- Same data split?
- Same preprocessing?
- Same evaluation protocol?
- Same amount of training data?

Output:

```text
Baseline Strength:
Strong / Moderate / Weak
```

Do not demand unrelated state-of-the-art methods merely because they exist.

---

# 15. Ablation Study Analysis

If the proposed method consists of multiple claimed components, inspect whether experiments isolate their value.

Example method:

```text
CNN
+
Temperature features
+
Attention
+
New loss
```

Expected useful comparisons might include:

```text
CNN
CNN + Temperature
CNN + Attention
CNN + Temperature + Attention
Full model
```

If contributions cannot be isolated, report:

> The current evaluation does not clearly isolate the individual contribution of each proposed component.

Do not automatically require ablation for every paper type.

---

# 16. Evaluation Metrics

Check whether metrics fit the task.

## Classification

Possible metrics:

```text
Accuracy
Precision
Recall
F1
AUROC
AUPRC
Confusion Matrix
Balanced Accuracy
MCC
```

If classes are strongly imbalanced and only Accuracy is reported, flag this where relevant.

## Regression

Possible metrics:

```text
MAE
RMSE
R²
MAPE
```

## Ranking / Retrieval

Possible metrics:

```text
MRR
Recall@K
Precision@K
NDCG
Hit Rate
MAP
```

Assess whether reported metrics actually support the manuscript claims.

---

# 17. Statistical Validity

Inspect:

- Number of runs
- Random seeds
- Mean ± standard deviation
- Confidence intervals
- Statistical tests
- Effect size where appropriate

If a very small improvement is claimed as significant but variance is missing:

> It is unclear whether the reported improvement is statistically meaningful.

Do not mechanically demand statistical significance tests for every study.

Judge based on study design and claims.

---

# 18. Results Reviewer

For each important result, extract:

```text
Claim
Reported result
Baseline comparison
Magnitude of improvement
Evidence
Whether the result supports the claim
Alternative explanation
```

Do not merely repeat table values.

Interpret their scientific meaning.

---

# 19. Claim–Evidence Consistency Checker

Create an explicit claim–evidence table.

Example:

| Claim | Evidence | Assessment |
|---|---|---|
| Proposed approach improves F1 | Table 3 | Supported |
| Model generalizes across environments | One dataset only | Unsupported |
| Multimodal fusion is beneficial | No ablation | Partially Supported |

Allowed assessments:

```text
Supported
Partially Supported
Unsupported
Cannot Assess
```

This stage is critical for detecting overclaiming.

---

# 20. Reproducibility Reviewer

Check whether the manuscript provides:

- Source code
- Dataset availability
- Data preprocessing
- Model architecture
- Hyperparameters
- Optimizer
- Learning rate
- Batch size
- Training epochs
- Random seed
- Hardware
- Software/library versions
- Evaluation procedure

Score:

```text
5 = Highly reproducible
4 = Mostly reproducible
3 = Partially reproducible
2 = Difficult to reproduce
1 = Not reproducible
```

---

# 21. Threats to Validity

Analyze at least:

## Internal Validity

Examples:

- Leakage
- Confounding variables
- Incorrect control
- Unfair comparisons

## External Validity

Examples:

- One dataset
- One environment
- Limited population
- Limited operating conditions

## Construct Validity

Examples:

- Metric does not represent the intended construct
- Proxy measurement does not match the research objective

## Conclusion Validity

Examples:

- Insufficient statistical support
- Conclusions exceed experimental evidence
- Small sample size
- Unstable results

---

# 22. Reference Analysis

Assess:

- Foundational literature coverage
- Recent relevant work
- Baseline-related citations
- Support for major claims
- Whether related work establishes the research gap
- Excessive reliance on outdated sources
- Clearly important omissions visible from the manuscript context

Do NOT invent specific missing papers unless verified.

---

# 23. Major vs Minor Issues

## Major issues

Problems that materially affect:

- Scientific validity
- Main contribution
- Experimental credibility
- Conclusions
- Reproducibility
- Acceptance decision

Examples:

- Confirmed data leakage
- Invalid experimental design
- Unsupported main claim
- Severe baseline weakness
- Fundamental methodology flaw

## Minor issues

Examples:

- Missing implementation detail
- Minor notation issue
- Figure readability
- Small writing issue
- Local clarification needed

Do not turn minor issues into reject reasons.

---

# 24. Meta Reviewer

The Meta Reviewer receives:

```text
Paper analysis
Contribution analysis
Methodology review
Experiment review
Claim/evidence review
Reproducibility analysis
Threats to validity
Reference analysis
```

Responsibilities:

1. Merge duplicate observations.
2. Remove unsupported criticism.
3. Classify issues as major/minor.
4. Determine issue severity.
5. Resolve contradictions.
6. Generate criterion scores.
7. Determine final recommendation.
8. Generate author remarks.
9. Generate confidential TPC remarks.

The Meta Reviewer must NOT invent new factual claims.

---

# 25. Consistency Validator

Before final output, verify:

```text
Does every major concern have evidence?

Does the recommendation match the identified scientific flaws?

Are strengths and weaknesses logically consistent?

Are any datasets, results or experiments invented?

Are requested revisions relevant to the paper?

Is the reviewer demanding unrelated work?

Are all scores between 1 and 5?

Does the final recommendation reflect critical issues rather than a simple average?
```

If inconsistency is found:

```text
Revise once before producing the final answer.
```

---

# 26. Scoring System

The final conference form requires the following criteria.

---

## 26.1 Scientific Quality

Evaluate:

- Research problem
- Research design
- Methodological correctness
- Experimental validity
- Evaluation quality
- Reliability of conclusions
- Data leakage
- Evidence supporting claims

Score:

```text
1/5 = Very Poor
Serious scientific flaws or insufficient evidence.

2/5 = Poor
Some contribution exists, but major scientific weaknesses remain.

3/5 = Adequate
Fundamentally reasonable, with notable limitations.

4/5 = Good
Strong methodology and credible experimental support.

5/5 = Excellent
Highly rigorous, convincing, scientifically strong work.
```

---

## 26.2 Originality

Evaluate:

- New research idea
- New methodology
- New formulation
- New algorithm
- New framework
- New empirical insight
- Meaningful new application

Score:

```text
1/5 = Almost no originality
2/5 = Limited originality
3/5 = Moderate originality
4/5 = Clearly novel
5/5 = Highly original
```

Do not assign a high score solely because the architecture is complex.

---

## 26.3 Quality of Writing

Evaluate:

- Abstract
- Introduction
- Logical organization
- Technical clarity
- Method explanation
- Figures/tables
- Terminology consistency
- Grammar
- Repetition
- Conclusion

Score:

```text
1/5 = Very difficult to understand
2/5 = Poorly written
3/5 = Understandable but needs improvement
4/5 = Clear and well organized
5/5 = Excellent scientific writing
```

Minor English errors should not heavily penalize an otherwise clear manuscript.

---

## 26.4 Topical Suitability

Evaluate whether the paper fits the target venue.

Score:

```text
1/5 = Out of scope
2/5 = Weak relevance
3/5 = Moderately relevant
4/5 = Clearly relevant
5/5 = Excellent topical fit
```

If venue scope is not supplied:

```text
Venue scope was not explicitly provided.
Topical suitability is estimated from the apparent research domain.
```

Never invent the venue scope.

---

## 26.5 Completeness of References

Evaluate:

- Foundational work
- Recent related work
- Relevant baselines
- Citations supporting claims
- Related-work completeness
- Research-gap support

Score:

```text
1/5 = Seriously incomplete
2/5 = Several important omissions
3/5 = Adequate
4/5 = Good coverage
5/5 = Comprehensive and well selected
```

---

## 26.6 Journal Publication Recommendation

Required output:

```text
Yes
```

or:

```text
No
```

Evaluate whether the current manuscript is sufficiently mature for journal publication based on:

- Scientific quality
- Completeness
- Experimental depth
- Reproducibility
- Generalization
- Contribution maturity

This field is independent of the conference acceptance recommendation.

A conference paper may be acceptable while not yet mature enough for journal publication.

---

## 26.7 Innovation Potential

Evaluate future potential of the proposed concept:

- Extensibility
- New research directions
- Scientific potential
- Practical potential
- Generalization potential

Score:

```text
1/5 = Very limited potential
2/5 = Limited potential
3/5 = Reasonable potential
4/5 = Strong potential
5/5 = Very high innovation potential
```

---

## 26.8 Implementation Viability

Evaluate:

- Practical implementability
- Computational requirements
- Data requirements
- System complexity
- Scalability
- Deployment feasibility
- Reproducibility

Score:

```text
1/5 = Very difficult / unrealistic
2/5 = Significant implementation barriers
3/5 = Feasible with limitations
4/5 = Clearly feasible
5/5 = Highly practical and implementation-ready
```

Do not penalize theoretical papers merely because production deployment is not demonstrated.

---

## 26.9 Reviewer Expertise / Confidence

The original form asks:

> Indicate your personal expertise on the subject matter of the paper.

Because the reviewer is an AI system, do not pretend to have human professional experience.

Interpret this field as:

```text
Reviewer Domain Confidence
```

Score:

```text
1/5 = Limited familiarity
2/5 = Some familiarity
3/5 = Good general knowledge
4/5 = Strong domain knowledge
5/5 = Very strong domain-specific confidence
```

This score must NOT alter paper quality scores.

---

# 27. Overall Recommendation

This is a mandatory conference-review criterion.

Allowed values are exactly the following case-sensitive labels:

```text
Strong Reject
Reject
Borderline
Accept
Strong Accept
```

Do not output synonyms, numeric substitutes, combined labels, qualifiers, or translated labels for this field. The Vietnamese review MUST retain the same English decision label. The selected value MUST be written identically to `review_scores.json`, `internal_scores.json`, the English review, and the Vietnamese review.

Do NOT calculate the final decision using only:

```text
average(scores)
```

Decision priority:

```text
Critical flaws
    ↓
Scientific validity
    ↓
Strength of evidence
    ↓
Contribution
    ↓
Originality
    ↓
Significance
    ↓
Presentation
```

## Strong Reject

Use when there are fundamental flaws such as:

- Invalid methodology
- Severe confirmed leakage
- Fundamentally unsupported conclusions
- No meaningful contribution
- Experimental design incapable of validating the main claim

## Reject

Use when some contribution exists but important scientific or experimental weaknesses substantially reduce validity or significance.

## Borderline

Use when strengths and weaknesses are balanced and the paper lies near the acceptance threshold.

## Accept

Use when:

- Scientific design is sound
- Contribution is meaningful
- Evidence is reasonably convincing
- No fatal flaw exists

The paper may still contain moderate or minor issues.

## Strong Accept

Use only when:

- Contribution is very strong
- Novelty is clear
- Methodology is rigorous
- Experimental evidence is highly convincing
- Impact potential is significant

Do not use Strong Accept merely because accuracy is high.

---

# 28. Example Decision Logic

Example 1:

```text
Scientific Quality = 4
Originality = 4
Writing = 5

BUT

Confirmed test-set leakage
```

Possible recommendation:

```text
Reject
```

Example 2:

```text
Scientific Quality = 5
Originality = 3
Experimental Quality = 5
Practical Significance = Strong
No fatal flaw
```

Possible recommendation:

```text
Accept
```

Scientific validity takes priority over average score.

---

# 29. Remarks to the Authors

Generate author-facing comments.

Recommended structure:

```text
Brief Summary

Strong Aspects

Recommended Changes
```

Recommended length:

```text
300–700 words
```

depending on manuscript complexity.

## Brief Summary

Summarize:

- Problem
- Proposed method
- Main contribution
- Overall scientific assessment

## Strong Aspects

Provide approximately 2–5 meaningful strengths.

Each strength must explain why it matters.

Good:

> The paper adopts a leakage-aware temporal evaluation protocol, which improves the credibility of the reported predictive performance.

Bad:

> The paper is interesting.

## Recommended Changes

Order issues from most important to least important.

Each major recommendation should contain:

```text
Problem
→ Why it matters
→ Recommended correction
```

Example:

> The evaluation is limited to a single dataset and operating condition. This makes it difficult to determine whether the reported improvement generalizes beyond the current environment. The authors should either provide additional cross-condition evaluation or narrow the generalization claims accordingly.

Remarks must be:

- Respectful
- Constructive
- Technical
- Actionable
- Evidence-based

Do not unnecessarily reveal the final acceptance recommendation inside the author remarks when the review system separates reviewer decision from author comments.

---

# 30. Remarks for TPC Member

This is a confidential decision-oriented comment.

Do NOT simply copy the author-facing remarks.

Focus on:

- Why should the paper be accepted or rejected?
- What is the strongest contribution?
- What is the most serious concern?
- Is there a fatal flaw?
- How confident is the reviewer?

Recommended length:

```text
100–250 words
```

Recommended structure:

```text
The paper addresses ...

The main strength is ...

The main concern is ...

I consider this issue [fatal / major but fixable / moderate / minor].

Based on the current evidence, I recommend ...

Reviewer confidence: X/5.
```

TPC remarks may directly state the recommendation.

---

# 31. Internal Score Justification

Before generating the user-facing final review, produce an internal structured representation.

Example:

```json
{
  "scientific_quality": {
    "score": 4,
    "evidence": ["S4-C3", "S5-C1"],
    "reason": ""
  },
  "originality": {
    "score": 3,
    "evidence": ["S2-C4"],
    "reason": ""
  },
  "writing_quality": {
    "score": 4,
    "evidence": [],
    "reason": ""
  },
  "topical_suitability": {
    "score": 4,
    "evidence": [],
    "reason": ""
  },
  "references": {
    "score": 3,
    "evidence": [],
    "reason": ""
  },
  "journal_recommendation": {
    "decision": "No",
    "reason": ""
  },
  "innovation_potential": {
    "score": 4,
    "reason": ""
  },
  "implementation_viability": {
    "score": 4,
    "reason": ""
  },
  "reviewer_expertise": {
    "score": 4,
    "reason": ""
  },
  "overall_recommendation": {
    "decision": "Accept",
    "reason": ""
  }
}
```

This structure is for the internal pipeline and debugging.

Do not show it in the final conference review unless debug mode is enabled.

---

# 32. Required Final Conference Output

The final response MUST follow this structure exactly:

```markdown
# Conference Review

**Scientific quality:** X/5

**Originality:** X/5

**Quality of writing:** X/5

**Topical suitability:** X/5

**Completeness of References:** X/5

**Would you recommend this paper for journal publication?:** Yes / No

**Innovation potential of the proposed concept:** X/5

**Implementation viability of the proposed concept:** X/5

**Personal expertise on the subject matter of the paper:** X/5

**Overall recommendation:** Strong Reject / Reject / Borderline / Accept / Strong Accept

---

## Remarks to the Authors

[Final author-facing review]

---

## Remarks for TPC Member

[Confidential TPC review]
```

---

# 33. Optional Detailed Review Output

In addition to the conference form, the system may optionally generate a detailed review file for debugging or research use.

Suggested structure:

```text
Paper Summary
Main Contributions
Strengths
Major Concerns
Minor Concerns
Experimental Evaluation
Claim–Evidence Analysis
Reproducibility
Threats to Validity
Questions for Authors
Required Revisions
Reviewer Scores
Overall Recommendation
```

This detailed analysis should support the final conference form.

---

# 34. Software Architecture

Implement in Python.

Recommended project structure:

```text
scientific-review-agent/
│
├── app/
│   ├── agents/
│   │   ├── paper_analyzer.py
│   │   ├── novelty_reviewer.py
│   │   ├── methodology_reviewer.py
│   │   ├── experiment_reviewer.py
│   │   ├── claim_checker.py
│   │   ├── reproducibility_reviewer.py
│   │   └── meta_reviewer.py
│   │
│   ├── parsers/
│   │   ├── pdf_parser.py
│   │   └── section_parser.py
│   │
│   ├── schemas/
│   │   ├── paper.py
│   │   └── review.py
│   │
│   ├── prompts/
│   │   ├── analyzer.md
│   │   ├── novelty.md
│   │   ├── methodology.md
│   │   ├── experiment.md
│   │   ├── claim_checker.md
│   │   └── meta_review.md
│   │
│   ├── services/
│   │   ├── llm.py
│   │   └── evidence.py
│   │
│   ├── validators/
│   │   └── review_validator.py
│   │
│   └── main.py
│
├── tests/
├── examples/
├── outputs/
├── requirements.txt
├── .env.example
└── README.md
```

The architecture may be adjusted if a simpler and more robust design is justified.

Do not over-engineer.

---

# 35. LLM Abstraction

Do not hard-code one provider.

Use an abstraction such as:

```python
class LLMProvider:
    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        response_schema=None
    ):
        ...
```

Possible providers:

```text
OpenAI
OpenAI-compatible endpoint
Local LLM
```

Configuration must be controlled through environment variables.

---

# 36. Structured Agent Communication

Use Pydantic models.

Example:

```python
class ReviewIssue(BaseModel):
    title: str
    severity: Literal["critical", "high", "medium", "low"]
    evidence_ids: list[str]
    evidence: str
    explanation: str
    recommendation: str
```

Scores:

```python
class ConferenceScores(BaseModel):
    scientific_quality: int
    originality: int
    writing_quality: int
    topical_suitability: int
    reference_completeness: int
    innovation_potential: int
    implementation_viability: int
    reviewer_expertise: int
```

Recommendation:

```python
class Recommendation(BaseModel):
    journal_publication: Literal["Yes", "No"]
    overall: Literal[
        "Strong Reject",
        "Reject",
        "Borderline",
        "Accept",
        "Strong Accept"
    ]
```

Prefer structured JSON for agent-to-agent communication rather than unstructured prose.

---

# 37. Review Strictness

Support:

```text
lenient
balanced
strict
```

Default:

```text
balanced
```

Strictness must NOT simply subtract or add points.

It should affect the strength of evidence required to support acceptance.

---

# 38. CLI

Create a CLI.

Basic usage:

```bash
python -m app.main review paper.pdf
```

Optional usage:

```bash
python -m app.main review paper.pdf \
  --venue conference \
  --domain auto \
  --strictness balanced \
  --output outputs/final_review.md
```

Useful options:

```text
--venue
--domain
--model
--strictness
--output
--debug
```

---

# 39. Output Files

Recommended outputs:

```text
outputs/
├── paper_analysis.json
├── novelty_review.json
├── methodology_review.json
├── experiment_review.json
├── claims.json
├── reproducibility_review.json
├── internal_scores.json
├── detailed_review.md
└── final_review.md
```

The primary user-facing result is:

```text
final_review.md
```

---

# 40. README Requirements

README must explain:

```text
Installation
Environment variables
Running a review
Architecture
Agent responsibilities
Evidence system
Review pipeline
Scoring logic
Adding an LLM provider
Example review
Limitations
```

---

# 41. Testing Requirements

Create unit tests for at least:

```text
PDF parser
Section parser
Paper schema validation
Review schema validation
Evidence linking
Score range validation
Recommendation validation
Claim–evidence validation
Final output formatting
```

Create a mock LLM implementation so tests do not require a real API.

---

# 42. Implementation Order

Implement in this order:

## Phase 1

Architecture and Pydantic schemas.

## Phase 2

PDF parser and evidence store.

## Phase 3

Paper Structure Analyzer.

## Phase 4

Specialized reviewers.

## Phase 5

Claim–Evidence Checker.

## Phase 6

Meta Reviewer.

## Phase 7

Consistency Validator.

## Phase 8

Conference scoring and output formatter.

## Phase 9

CLI.

## Phase 10

Tests.

## Phase 11

README and example.

Do not stop after producing a plan.

Build the actual project.

---

# 43. Coding Requirements

Use:

- Python 3.11+
- Type hints
- Pydantic
- Async LLM calls where appropriate
- Reusable prompts
- Clear architecture
- Environment-based configuration
- Logging
- Graceful error handling
- Unit-testable services

Do not:

- Hard-code API keys
- Add unnecessary multi-agent frameworks
- Hide scientific review logic inside one enormous prompt
- Generate reviewer scores before analysis is complete

---

# 44. Definition of Done

The project is complete when this command works:

```bash
python -m app.main review examples/sample_paper.pdf
```

and produces:

```text
outputs/final_review.md
```

with:

```text
Scientific quality
Originality
Quality of writing
Topical suitability
Completeness of References
Journal publication recommendation
Innovation potential
Implementation viability
Reviewer expertise
Overall recommendation
Remarks to the Authors
Remarks for TPC Member
```

The system should also generate structured internal evidence that explains how the final review was reached.

---

# 45. Final Review Philosophy

The system must always follow:

> Read the entire paper first.  
> Extract claims and evidence second.  
> Evaluate scientific validity third.  
> Score only after the analysis is complete.  
> Recommendation must be the final step.

Never use:

```text
Abstract
→ Initial opinion
→ Score
→ Search for evidence that supports the score
```

Use:

```text
Full manuscript
→ Evidence extraction
→ Scientific analysis
→ Claim verification
→ Strengths / weaknesses
→ Scores
→ Recommendation
```

The core goal is:

> Produce a reviewer decision that is explainable, evidence-based, scientifically defensible, and directly usable in a conference review form.

---

# 46. Mandatory Conference Review Form and Bilingual Output

After the AI completes the full scientific review pipeline, it MUST produce the final result according to the exact conference review form below.

The final review is not allowed to contain only scores. Every score MUST include a concise evidence-based explanation.

The system MUST generate:

```text
outputs/final_review_bilingual.md
```

This Markdown file contains:

```text
PART A — ENGLISH REVIEW
PART B — VIETNAMESE REVIEW
```

The English version is the authoritative version for submission to the conference review system.

The Vietnamese version is a faithful explanation/translation to help the reviewer understand why each score and decision was produced.

---

# 47. Exact Conference Review Fields

The final output MUST contain exactly these review criteria:

```text
Scientific quality: 1–5

Originality: 1–5

Quality of writing: 1–5

Topical suitability: 1–5

Completeness of References: 1–5

Would you recommend this paper for journal publication?:
Yes / No

Innovation potential of the proposed concept: 1–5

Implementation viability of the proposed concept: 1–5

Indicate your personal expertise on the subject matter of the paper: 1–5

Overall recommendation:
Strong Reject
Reject
Borderline
Accept
Strong Accept

Remarks to the authors

Remarks for TPC Member
```

All numeric scores MUST be integers from 1 to 5.

---

# 48. Mandatory Score Explanation Rule

For every numeric criterion, the reviewer MUST output:

```text
Score
Evidence
Explanation
```

Example:

```markdown
### Scientific quality — 4/5

**Evidence:**  
The manuscript defines a clear research problem, describes a coherent methodology, and evaluates the proposed method using relevant metrics. However, evaluation is limited to a single dataset.

**Explanation:**  
The scientific design is generally sound and the primary conclusions are supported by the reported experiments. The limited external validation reduces confidence in generalization, therefore 4/5 is more appropriate than 5/5.
```

The explanation MUST come from the manuscript.

Do not invent evidence.

When available, cite manuscript locations such as:

```text
[Page 6]
[Section 4.2]
[Table 3]
[Figure 5]
```

If the PDF parser provides evidence chunk IDs, include them internally as well.

---

# 49. Conference Scoring Rubric

## 49.1 Scientific quality

Evaluate:

- Clarity and significance of the research problem
- Research questions or hypotheses
- Soundness of the methodology
- Correctness of experimental design
- Dataset suitability
- Train / validation / test strategy
- Data leakage risk
- Baseline quality
- Evaluation metrics
- Statistical validity
- Claim–evidence consistency
- Whether conclusions are supported

Scoring:

```text
1/5 — Very Poor
Serious scientific flaws, invalid methodology, unreliable evaluation,
or conclusions are not supported.

2/5 — Poor
Some scientific merit exists, but major methodological or experimental
weaknesses materially reduce credibility.

3/5 — Adequate
The study is scientifically reasonable overall, but important
limitations remain.

4/5 — Good
The study is scientifically strong, the methodology is appropriate,
and the main conclusions are supported, although some limitations remain.

5/5 — Excellent
Highly rigorous scientific design, strong validation, convincing evidence,
and well-supported conclusions.
```

A fatal flaw such as confirmed test leakage can override otherwise high scores when determining the overall recommendation.

---

## 49.2 Originality

Evaluate:

- Novel research question
- Novel algorithm
- Novel methodology
- Novel architecture
- Novel framework
- Novel dataset or benchmark
- Novel empirical insight
- Novel practical application

Scoring:

```text
1/5 — Almost no originality
2/5 — Limited originality
3/5 — Moderate / incremental originality
4/5 — Clearly novel and technically meaningful
5/5 — Highly original and potentially significant
```

Important:

```text
Complex architecture ≠ High originality
New combination ≠ Automatically a new scientific method
Higher accuracy ≠ Novelty
```

The reviewer must compare claimed contributions with the related work presented in the manuscript.

---

## 49.3 Quality of writing

Evaluate:

- Abstract clarity
- Introduction structure
- Problem and contribution presentation
- Related work organization
- Method clarity
- Result interpretation
- Figures
- Tables
- Terminology
- Grammar
- Logical flow
- Conclusion quality

Scoring:

```text
1/5 — Very difficult to understand
2/5 — Major writing or organization problems
3/5 — Understandable but needs noticeable improvement
4/5 — Clear, well organized, and technically readable
5/5 — Excellent scientific writing and presentation
```

Do not heavily penalize small English-language mistakes if the technical content remains clear.

---

## 49.4 Topical suitability

Evaluate whether the manuscript is appropriate for the intended conference or journal.

Scoring:

```text
1/5 — Out of scope
2/5 — Weak relevance
3/5 — Reasonably relevant
4/5 — Clearly relevant
5/5 — Excellent thematic fit
```

If the official venue scope has not been provided, state explicitly:

> Venue scope was not explicitly provided. Topical suitability is therefore estimated from the apparent research domain and the context of the review form.

Never fabricate a venue scope.

---

## 49.5 Completeness of References

Evaluate:

- Foundational literature
- Recent related research
- Relevant competing approaches
- References supporting important claims
- Coverage of the research gap
- Balance of old and recent work
- Quality of the related-work discussion

Scoring:

```text
1/5 — Seriously incomplete
2/5 — Several important areas are insufficiently covered
3/5 — Adequate coverage
4/5 — Good and relevant coverage
5/5 — Comprehensive, balanced, and well integrated
```

Do not invent missing papers or citations.

If external literature verification is unavailable, assess only what can reasonably be concluded from the manuscript.

---

## 49.6 Would you recommend this paper for journal publication?

Output exactly:

```text
Yes
```

or:

```text
No
```

This field evaluates whether the current work appears mature enough for journal publication.

Consider:

- Scientific depth
- Experimental breadth
- Reproducibility
- Generalization
- Contribution maturity
- Completeness
- Validation depth

This decision is separate from conference acceptance.

Example:

```text
Conference recommendation: Accept
Journal publication recommendation: No
```

is valid when the work is suitable for a conference but requires substantial extension for journal publication.

---

## 49.7 Innovation potential of the proposed concept

Evaluate future potential, not only current novelty.

Consider:

- Extensibility
- Future research directions
- Practical applications
- Scientific impact
- Transferability to related problems
- Potential for technical advancement

Scoring:

```text
1/5 — Very limited innovation potential
2/5 — Limited potential
3/5 — Reasonable potential
4/5 — Strong potential
5/5 — Very high innovation potential
```

---

## 49.8 Implementation viability of the proposed concept

Evaluate:

- Technical feasibility
- Computational requirements
- Data requirements
- Resource requirements
- Reproducibility
- Scalability
- Deployment feasibility
- Practical constraints

Scoring:

```text
1/5 — Very difficult or unrealistic to implement
2/5 — Significant implementation barriers
3/5 — Feasible with important limitations
4/5 — Clearly feasible and technically realistic
5/5 — Highly viable, practical, scalable, and implementation-ready
```

Judge this relative to the paper type.

Do not penalize a theoretical paper merely because it is not production-ready.

---

## 49.9 Indicate your personal expertise on the subject matter of the paper

Because the reviewer is an AI system, it MUST NOT fabricate human employment history, publications, academic degrees, or personal research experience.

Interpret this field internally as:

```text
Reviewer domain familiarity and confidence
```

Scoring:

```text
1/5 — Limited familiarity with the specific subject
2/5 — Some relevant familiarity
3/5 — Good general knowledge
4/5 — Strong domain understanding and high assessment confidence
5/5 — Very strong domain-specific understanding and very high confidence
```

The final English review MUST retain the conference's exact field label:

```text
Indicate your personal expertise on the subject matter of the paper
```

The explanation should clarify that the score represents AI reviewer confidence/domain familiarity.

This score MUST NOT be used to artificially increase or decrease the paper's quality scores.

---

# 50. Overall Recommendation

This is a mandatory conference-review criterion.

Allowed values are exactly the following case-sensitive labels:

```text
Strong Reject
Reject
Borderline
Accept
Strong Accept
```

Do not output synonyms, numeric substitutes, combined labels, qualifiers, or translated labels for this field. The Vietnamese review MUST retain the same English decision label. The selected value MUST be written identically to `review_scores.json`, `internal_scores.json`, the English review, and the Vietnamese review.

The system MUST NOT determine the recommendation using a simple average of numeric scores.

Use this priority:

```text
Critical / fatal flaw
        ↓
Scientific validity
        ↓
Strength of evidence
        ↓
Validity of main contribution
        ↓
Originality and significance
        ↓
Experimental completeness
        ↓
Writing and presentation
```

## Strong Reject

Use when fundamental problems make the central findings unreliable.

Examples:

- Severe confirmed leakage
- Invalid methodology
- Experimental setup cannot test the central claim
- Core conclusions are fundamentally unsupported
- No identifiable meaningful scientific contribution

## Reject

Use when the work has some value but major scientific, methodological, experimental, or originality concerns remain.

## Borderline

Use when meaningful strengths and meaningful weaknesses are balanced and the paper is close to the acceptance threshold.

## Accept

Use when:

- Scientific methodology is sound
- Contribution is meaningful
- Evaluation is credible
- Main claims are reasonably supported
- No fatal flaw exists

The paper may still contain moderate or minor issues.

## Strong Accept

Use only when:

- Scientific quality is exceptionally strong
- Contribution is important
- Novelty/significance is clear
- Validation is rigorous
- Evidence is highly convincing
- Presentation is strong

Do not select Strong Accept only because the reported metric is high.

---

# 51. Remarks to the Authors

The author-facing remarks MUST contain:

```text
Brief Summary
Strong Aspects
Recommended Changes
```

Recommended English length:

```text
300–700 words
```

depending on paper complexity.

## Brief Summary

Briefly describe:

- Research problem
- Proposed approach
- Main contribution
- Overall scientific assessment

Do not merely copy the abstract.

## Strong Aspects

Provide approximately 2–5 meaningful strengths.

Every strength should explain why it matters.

Good example:

> The paper uses a leakage-aware temporal evaluation protocol, which improves confidence that the reported results are not caused by overlap between training and test data.

Weak example:

> The paper is interesting.

## Recommended Changes

Order the recommendations by scientific importance.

For major issues, follow:

```text
Issue
→ Evidence
→ Why it matters
→ Recommended correction
```

Example:

> The evaluation is limited to a single dataset and operating condition. This limits the evidence supporting the manuscript's generalization claims. The authors should either provide additional cross-condition validation or narrow the generalization claims accordingly.

Author remarks must be:

- Respectful
- Constructive
- Technical
- Actionable
- Evidence-based

If the review system separates the acceptance decision from author comments, avoid unnecessarily writing "Reject" or "Accept" directly inside the author remarks.

---

# 52. Remarks for TPC Member

This section is confidential and decision-oriented.

It MUST NOT simply duplicate `Remarks to the Authors`.

Recommended English length:

```text
100–250 words
```

The TPC remarks should address:

```text
What is the paper's main contribution?

What is the strongest aspect?

What is the most serious concern?

Is there a fatal flaw?

Is the main weakness fixable?

Why is the final recommendation appropriate?

How confident is the reviewer?
```

Recommended structure:

```text
The paper addresses ...

The strongest aspect is ...

The primary concern is ...

This concern is considered [fatal / major but fixable / moderate / minor].

Given the current evidence, I recommend ...

Reviewer confidence: X/5.
```

The TPC remarks may state the final decision directly.

---

# 53. Mandatory English Markdown Result

The English section of the final report MUST use this structure:

```markdown
# Scientific Paper Review

# Part A — English Review

## Review Form

### Scientific quality — X/5

**Evidence:**  
...

**Explanation:**  
...

### Originality — X/5

**Evidence:**  
...

**Explanation:**  
...

### Quality of writing — X/5

**Evidence:**  
...

**Explanation:**  
...

### Topical suitability — X/5

**Evidence:**  
...

**Explanation:**  
...

### Completeness of References — X/5

**Evidence:**  
...

**Explanation:**  
...

### Would you recommend this paper for journal publication? — Yes / No

**Explanation:**  
...

### Innovation potential of the proposed concept — X/5

**Evidence:**  
...

**Explanation:**  
...

### Implementation viability of the proposed concept — X/5

**Evidence:**  
...

**Explanation:**  
...

### Indicate your personal expertise on the subject matter of the paper — X/5

**Explanation:**  
This score represents AI reviewer domain familiarity and confidence rather than fabricated human professional experience.

### Overall recommendation — Strong Reject / Reject / Borderline / Accept / Strong Accept

**Decision rationale:**  
...

---

## Remarks to the Authors

### Brief Summary

...

### Strong Aspects

1. ...
2. ...
3. ...

### Recommended Changes

1. ...
2. ...
3. ...

---

## Remarks for TPC Member

...
```

---

# 54. Mandatory Vietnamese Markdown Result

The same Markdown file MUST contain a complete Vietnamese version after the English section.

Use:

```markdown
# Part B — Đánh giá tiếng Việt

## Phiếu đánh giá

### Chất lượng khoa học — X/5

**Bằng chứng:**  
...

**Giải thích:**  
...

### Tính nguyên bản / tính mới — X/5

**Bằng chứng:**  
...

**Giải thích:**  
...

### Chất lượng trình bày — X/5

**Bằng chứng:**  
...

**Giải thích:**  
...

### Mức độ phù hợp chủ đề — X/5

**Bằng chứng:**  
...

**Giải thích:**  
...

### Mức độ đầy đủ của tài liệu tham khảo — X/5

**Bằng chứng:**  
...

**Giải thích:**  
...

### Có đề xuất bài báo cho xuất bản tạp chí không? — Có / Không

**Giải thích:**  
...

### Tiềm năng đổi mới của ý tưởng đề xuất — X/5

**Bằng chứng:**  
...

**Giải thích:**  
...

### Khả năng triển khai của ý tưởng đề xuất — X/5

**Bằng chứng:**  
...

**Giải thích:**  
...

### Mức độ am hiểu chủ đề của reviewer — X/5

**Giải thích:**  
Điểm này thể hiện mức độ am hiểu miền kiến thức và độ tự tin của AI reviewer khi đánh giá bài báo, không phải kinh nghiệm nghề nghiệp cá nhân của con người.

### Khuyến nghị tổng thể — Strong Reject / Reject / Borderline / Accept / Strong Accept

**Giải thích quyết định:**  
...

---

## Nhận xét gửi tác giả

### Tóm tắt ngắn

...

### Điểm mạnh

1. ...
2. ...
3. ...

### Các nội dung cần chỉnh sửa

1. ...
2. ...
3. ...

---

## Nhận xét dành cho TPC Member

...
```

---

# 55. English–Vietnamese Consistency Rules

The two language versions MUST be scientifically equivalent.

Required consistency:

1. Numeric scores MUST be identical.
2. Journal recommendation MUST match:
   - English `Yes` = Vietnamese `Có`
   - English `No` = Vietnamese `Không`
3. Overall recommendation MUST be identical.
4. Major strengths MUST correspond.
5. Major concerns MUST correspond.
6. TPC decision rationale MUST correspond.
7. The Vietnamese version may explain technical concepts more clearly, but it MUST NOT introduce new criticism or evidence.
8. Translation MUST NOT weaken or strengthen the review.
9. Evidence references such as pages, tables, figures, sections, and chunk IDs MUST remain consistent.

---

# 56. Machine-Readable Score File

In addition to the Markdown result, generate:

```text
outputs/review_scores.json
```

Schema:

```json
{
  "scientific_quality": 4,
  "originality": 3,
  "quality_of_writing": 4,
  "topical_suitability": 4,
  "completeness_of_references": 3,
  "journal_publication": "No",
  "innovation_potential": 4,
  "implementation_viability": 4,
  "personal_expertise": 4,
  "overall_recommendation": "Accept"
}
```

This file makes the result easy to use later in a UI or automatically copy into a conference review form.

The values in `review_scores.json` MUST exactly match `final_review_bilingual.md`.

---

# 57. Internal Score Justification

Before generating final files, the Meta Reviewer should produce an internal structure similar to:

```json
{
  "scientific_quality": {
    "score": 4,
    "evidence_ids": ["S4-C3", "S5-C1"],
    "reason": "..."
  },
  "originality": {
    "score": 3,
    "evidence_ids": ["S2-C4"],
    "reason": "..."
  },
  "quality_of_writing": {
    "score": 4,
    "reason": "..."
  },
  "topical_suitability": {
    "score": 4,
    "reason": "..."
  },
  "completeness_of_references": {
    "score": 3,
    "reason": "..."
  },
  "journal_publication": {
    "decision": "No",
    "reason": "..."
  },
  "innovation_potential": {
    "score": 4,
    "reason": "..."
  },
  "implementation_viability": {
    "score": 4,
    "reason": "..."
  },
  "personal_expertise": {
    "score": 4,
    "reason": "..."
  },
  "overall_recommendation": {
    "decision": "Accept",
    "reason": "..."
  }
}
```

This internal representation is used to validate the final result.

Do not expose it to the user unless debug mode is enabled.

---

# 58. Final Output Files

For each reviewed paper, generate:

```text
outputs/
├── paper_analysis.json
├── novelty_review.json
├── methodology_review.json
├── experiment_review.json
├── claims.json
├── reproducibility_review.json
├── internal_scores.json
├── review_scores.json
└── final_review_bilingual.md
```

The primary human-readable result is:

```text
outputs/final_review_bilingual.md
```

---

# 59. Bilingual Final Validation

Before saving the final review, verify:

```text
All numeric scores are integers between 1 and 5.

All required conference fields are present.

The English and Vietnamese numeric scores are identical.

Yes/No journal recommendation is consistent between languages.

Overall recommendation is identical between languages.

Every score has an evidence-based explanation.

Every major criticism has manuscript evidence.

No result, dataset, baseline, metric, citation, experiment, or claim was invented.

Remarks to the Authors are constructive and actionable.

Remarks for TPC Member are confidential and decision-oriented.

The overall recommendation is compatible with the identified critical flaws.

The recommendation was assigned only after full-paper analysis.

review_scores.json matches final_review_bilingual.md exactly.
```

If any validation fails:

```text
Regenerate the final review once.
```

If validation still fails after regeneration, return an explicit validation error instead of silently producing an inconsistent review.

---

# 60. Updated Review Execution Pipeline

The complete review pipeline MUST be:

```text
Read the complete manuscript
        ↓
Parse sections and pages
        ↓
Build Paper Evidence Store
        ↓
Detect paper type
        ↓
Extract research problem / gap / RQs
        ↓
Extract contributions and claims
        ↓
Review originality
        ↓
Review methodology
        ↓
Review experiments
        ↓
Check train/validation/test split
        ↓
Check data leakage
        ↓
Review baselines and metrics
        ↓
Review statistical validity
        ↓
Review references
        ↓
Check reproducibility
        ↓
Analyze threats to validity
        ↓
Build Claim–Evidence matrix
        ↓
Identify strengths
        ↓
Identify major and minor concerns
        ↓
Assign conference scores
        ↓
Decide journal publication Yes/No
        ↓
Determine overall recommendation
        ↓
Generate English review
        ↓
Generate faithful Vietnamese version
        ↓
Validate bilingual consistency
        ↓
Write review_scores.json
        ↓
Write final_review_bilingual.md
```

Never:

```text
Read Abstract
→ Guess recommendation
→ Search the paper for supporting evidence
```

Always:

```text
Evidence
→ Assessment
→ Score
→ Recommendation
```

---

# 61. Updated Definition of Done

The project is complete only when:

```bash
python -m app.main review examples/sample_paper.pdf
```

successfully produces:

```text
outputs/final_review_bilingual.md
outputs/review_scores.json
```

and the Markdown result contains both:

```text
Complete English Conference Review
+
Complete Vietnamese Review and Explanation
```

with the exact conference fields:

```text
Scientific quality
Originality
Quality of writing
Topical suitability
Completeness of References
Would you recommend this paper for journal publication?
Innovation potential of the proposed concept
Implementation viability of the proposed concept
Indicate your personal expertise on the subject matter of the paper
Overall recommendation
Remarks to the authors
Remarks for TPC Member
```

The final review must be evidence-based, explainable, internally consistent, bilingual, and directly usable in the conference review system.
