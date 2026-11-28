-- Additive versioned system rubric v2.0 with criterion-specific & artifact-specific descriptors.
-- Historical v1.0 review_template_versions, review_criteria, review_criterion_levels, human_reviews,
-- review_requests, and review_responses remain completely untouched and immutable.
BEGIN;

DO $seed_v2$
DECLARE
  artifact jsonb;
  criterion jsonb;
  lvl jsonb;
  tpl_id uuid;
  v2_id uuid;
  criterion_id uuid;
  ord integer;
  pos integer;
BEGIN
  FOR artifact IN SELECT value FROM jsonb_array_elements($rubrics_v2$
[
  {
    "artifactType": "RESEARCH_PAPER",
    "criteria": [
      {
        "key": "research_problem",
        "title": "Research Problem & Research Questions",
        "description": "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology."
          }
        ]
      },
      {
        "key": "originality",
        "title": "Originality & Scientific Contributions",
        "description": "Clear, substantiated scholarly contribution positioned accurately relative to existing work.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "No discernible scholarly contribution; repeats existing work without new insight, framing, evidence, or synthesis."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Claimed contributions are unclear, overstated, or only marginally distinguished from prior studies without convincing justification."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies a modest, legitimate contribution, but its distinction from related work or significance to the field needs clearer articulation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents clear, well-bounded contributions that meaningfully extend prior work and align with the evidence or analysis provided."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers distinct, well-substantiated contributions with transparent positioning against prior work and clear scholarly or practical value."
          }
        ]
      },
      {
        "key": "literature",
        "title": "Literature Review & Related Work",
        "description": "Critical, balanced synthesis of relevant, credible, and current literature establishing context for the study.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Omits essential foundational or recent work, relies on unreliable sources, or fails to connect prior literature to the study."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Covers a narrow or unbalanced set of papers and summarizes them descriptively without comparing methods, findings, or limitations."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Covers main relevant studies with credible sources, but critical comparison and explicit linkage to the research gap remain limited."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Critically synthesizes relevant foundational and recent literature, clearly contrasting approaches and situating the present work."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Demonstrates authoritative, balanced command of the literature, integrating seminal and current work into a sharp critical synthesis that directly motivates every core design choice."
          }
        ]
      },
      {
        "key": "methodology",
        "title": "Methodology & Reproducibility",
        "description": "The research method fits the questions (quantitative, qualitative, mixed, or theoretical), is well justified, and provides enough detail for audit or replication.",
        "weight": 20,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The method is inappropriate for the research questions, fundamentally flawed, or lacks the procedural detail needed to understand how the study was conducted."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The general approach is identifiable, but key design justifications, procedures, assumptions, or operational details are missing or inconsistent."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The method is broadly appropriate and described at a workable level, though specific parameters, protocols, or justification of trade-offs need clearer detail."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-justified methodology clearly aligned with the research questions, documenting procedures, context, and key design choices clearly enough to audit or replicate."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Exemplary methodological rigor appropriate to the research paradigm, with transparent rationale for alternatives rejected, explicit validity safeguards, and complete documentation for independent replication or audit."
          }
        ]
      },
      {
        "key": "data_evaluation",
        "title": "Data, Evidence & Evaluation",
        "description": "Transparent provenance of data or empirical/analytical material, suitable evaluation or analytical design, and appropriate comparison or verification.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Data, empirical sources, or analytical evidence are missing, unverified, ethically problematic, or unsuitable for evaluating the claims."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Data or evaluation design has substantial gaps, such as missing provenance, weak comparison baselines/controls, or analytical techniques misaligned with the data."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Provides relevant data or analytical material with basic evaluation procedures, though provenance details, robustness checks, or comparison breadth need strengthening."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Documents data/source provenance transparently and applies well-suited evaluation, comparison, or trustworthiness checks aligned with the study paradigm."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Exhibits rigorous data stewardship and evaluation design—with transparent provenance, strong comparative or triangulation safeguards, and thorough sensitivity, ablation, or trustworthiness verification."
          }
        ]
      },
      {
        "key": "results_discussion",
        "title": "Results, Discussion & Limitations",
        "description": "Clear presentation and interpretation of findings backed by evidence, balanced discussion relative to prior work, and candid limitations.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Results are missing, contradictory, or unsupported by evidence; conclusions overclaim and omit critical limitations."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Reports raw outputs with shallow interpretation, leaves notable inconsistencies unexplained, or treats limitations superficially."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Presents core findings accurately and offers basic discussion and limitations, though deeper interpretation, error/case analysis, or linkage to literature is needed."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Interprets findings clearly within the bounds of the evidence, compares meaningfully with prior work, and discusses substantive limitations honestly."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Provides nuanced, evidence-grounded analysis including uncertainty, negative or edge cases, insightful theoretical/practical implications, and candid, well-scoped limitations."
          }
        ]
      },
      {
        "key": "writing",
        "title": "Scientific Writing, Structure & Presentation",
        "description": "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument."
          }
        ]
      },
      {
        "key": "references",
        "title": "References & Citation Accuracy",
        "description": "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature."
          }
        ]
      }
    ]
  },
  {
    "artifactType": "RESEARCH_PROPOSAL",
    "criteria": [
      {
        "key": "research_problem",
        "title": "Research Problem & Research Questions",
        "description": "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology."
          }
        ]
      },
      {
        "key": "originality",
        "title": "Originality & Scientific Contributions",
        "description": "Clear, substantiated scholarly contribution positioned accurately relative to existing work.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "No discernible scholarly contribution; repeats existing work without new insight, framing, evidence, or synthesis."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Claimed contributions are unclear, overstated, or only marginally distinguished from prior studies without convincing justification."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies a modest, legitimate contribution, but its distinction from related work or significance to the field needs clearer articulation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents clear, well-bounded contributions that meaningfully extend prior work and align with the evidence or analysis provided."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers distinct, well-substantiated contributions with transparent positioning against prior work and clear scholarly or practical value."
          }
        ]
      },
      {
        "key": "literature",
        "title": "Literature Review & Related Work",
        "description": "Critical, balanced synthesis of relevant, credible, and current literature establishing context for the study.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Omits essential foundational or recent work, relies on unreliable sources, or fails to connect prior literature to the study."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Covers a narrow or unbalanced set of papers and summarizes them descriptively without comparing methods, findings, or limitations."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Covers main relevant studies with credible sources, but critical comparison and explicit linkage to the research gap remain limited."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Critically synthesizes relevant foundational and recent literature, clearly contrasting approaches and situating the present work."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Demonstrates authoritative, balanced command of the literature, integrating seminal and current work into a sharp critical synthesis that directly motivates every core design choice."
          }
        ]
      },
      {
        "key": "methodology",
        "title": "Proposed Methodology & Reproducibility",
        "description": "Evaluates the soundness, clarity, and auditability of the planned research methodology — not experiments that have not yet been conducted.",
        "weight": 20,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Planned methodology is missing, incoherent, or incapable of answering the proposed research questions."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Outlines a broad direction, but lacks concrete study design, analytical procedures, or justification for why the planned method fits the problem."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Proposes a reasonable method aligned with the aims, though several operational steps, protocols, or methodological alternatives need clearer specification."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents a coherent, well-justified study design with clear procedures, analytical logic, and documentation standards supporting future reproducibility."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers a rigorous, execution-ready methodological blueprint that aligns every research question to concrete procedures, addresses validity threats proactively, and defines reproducible protocols."
          }
        ]
      },
      {
        "key": "data_evaluation",
        "title": "Data Access & Evaluation Plan",
        "description": "Feasible data collection or source access, ethics/privacy readiness, and clear criteria for evaluating planned outcomes.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Data sources, access feasibility, ethics considerations, or evaluation criteria are absent or unrealistic."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Mentions intended data or metrics vaguely without clarifying how access, consent/ethics, or meaningful validation will be achieved."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Outlines a plausible data and evaluation plan, though contingencies for access, sampling/scope, or ethics compliance need clearer detail."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents a realistic, ethically sound data access and evaluation plan with clear success or analytical criteria suited to the research questions."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Provides a concrete, thoroughly vetted data governance, ethics, and evaluation plan including contingency paths and explicit criteria for interpreting both positive and null/unexpected findings."
          }
        ]
      },
      {
        "key": "results_discussion",
        "title": "Feasibility, Risks & Expected Contribution",
        "description": "Realistic timeline, candid assessment of methodological/execution risks and limitations, and grounded expected outcomes — not invented results.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Timeline, risks, and expected outcomes are missing, implausible, or rely on unsupported assumptions."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "States optimistic goals and a rough schedule, but overlooks major methodological, resource, or timeline risks and mitigation steps."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Outlines a plausible timeline and expected contributions with basic risk awareness, though mitigation plans and scope limits need elaboration."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Demonstrates strong feasibility with realistic milestones, candid discussion of methodological/execution risks, and well-calibrated expected contributions."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Presents a highly credible execution roadmap with explicit contingencies for key validity or access risks and clearly bounded, realistic scholarly contributions."
          }
        ]
      },
      {
        "key": "writing",
        "title": "Scientific Writing, Structure & Presentation",
        "description": "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument."
          }
        ]
      },
      {
        "key": "references",
        "title": "References & Citation Accuracy",
        "description": "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature."
          }
        ]
      }
    ]
  },
  {
    "artifactType": "LITERATURE_REVIEW",
    "criteria": [
      {
        "key": "research_problem",
        "title": "Research Problem & Research Questions",
        "description": "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology."
          }
        ]
      },
      {
        "key": "originality",
        "title": "Synthesis Contribution",
        "description": "Provides an analytical synthesis, conceptual framing, or research agenda that goes beyond summarizing individual papers.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Lists or summarizes papers one by one without synthesis, thematic structure, or analytical insight."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Groups prior work superficially, with descriptive summaries dominating and little synthesis of patterns, gaps, or conceptual links."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Offers a recognizable thematic synthesis and identifies some gaps, though the analytical framing could be deeper or better integrated."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Synthesizes prior literature into coherent themes or frameworks and derives well-grounded research gaps or implications."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Advances understanding of the field through an insightful taxonomy, conceptual integration, or evidence-backed research agenda that reframes existing work."
          }
        ]
      },
      {
        "key": "literature",
        "title": "Coverage & Source Selection",
        "description": "Transparent scope boundaries, credible source selection, and balanced coverage of relevant scholarship.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Scope boundaries and source selection are unstated or arbitrary; major bodies of relevant work are missing."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Selection scope is partially stated but exhibits clear coverage gaps, outdated sources, or unexplained exclusions."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Defines reasonable scope and draws mostly credible sources, though minor coverage gaps or selection justifications need clarification."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Clearly justifies temporal, thematic, and source-quality boundaries, achieving balanced coverage of foundational and recent studies."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Provides comprehensive, transparently justified coverage across key perspectives and venues, explicitly accounting for scope boundaries and potential selection bias."
          }
        ]
      },
      {
        "key": "methodology",
        "title": "Search & Synthesis Method",
        "description": "Evaluates transparency and suitability of the literature search, screening, and synthesis process (whether systematic, scoping, or narrative).",
        "weight": 20,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "No explanation of how literature was searched, selected, or synthesized; process cannot be audited."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Mentions databases or themes briefly, but search strategy, inclusion/exclusion logic, or synthesis procedure is inconsistent or incomplete."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Describes a workable search or narrative selection approach, though screening criteria, search terms, or synthesis steps need fuller transparency."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Clearly documents search sources, selection rationale, and synthesis method appropriate to the review type, allowing readers to follow how conclusions were formed."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Provides a fully transparent, auditable search and synthesis protocol suited to the review paradigm, explicitly justifying methodological choices and mitigating selection or synthesis bias."
          }
        ]
      },
      {
        "key": "data_evaluation",
        "title": "Evidence Appraisal",
        "description": "Evaluates how critically the review assesses the quality, rigor, and relevance of reviewed sources — not laboratory experiments.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Treats all cited sources uncritically at face value regardless of methodological quality, relevance, or evidentiary strength."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Makes occasional remarks on source quality, but lacks consistent appraisal criteria or relies heavily on weak/unverified claims."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Distinguishes stronger from weaker studies in places, though appraisal criteria and weighting of evidence could be applied more consistently."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Systematically appraises the methodological rigor, context, and relevance of reviewed sources when weighing claims."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Applies transparent, nuanced evidence appraisal across the corpus, explicitly distinguishing well-supported consensus from preliminary, context-bound, or methodologically weak claims."
          }
        ]
      },
      {
        "key": "results_discussion",
        "title": "Synthesis, Contradictions & Limitations",
        "description": "Critical integration of findings across studies, engagement with conflicting evidence, and transparent limitations of the review itself.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Fails to synthesize findings across studies, ignores conflicting evidence, and omits limitations of the review."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Summarizes agreements superficially while glossing over contradictions, contextual differences, or coverage limits."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Synthesizes main patterns and notes some limitations, though conflicting findings and future research directions need deeper analysis."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Integrates converging and diverging findings thoughtfully, explains key tensions across studies, and states review limitations candidly."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Produces an authoritative critical synthesis that reconciles or explains contradictory evidence, clarifies boundary conditions, and derives prioritized research directions while acknowledging review limitations."
          }
        ]
      },
      {
        "key": "writing",
        "title": "Scientific Writing, Structure & Presentation",
        "description": "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument."
          }
        ]
      },
      {
        "key": "references",
        "title": "References & Citation Accuracy",
        "description": "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature."
          }
        ]
      }
    ]
  },
  {
    "artifactType": "METHODOLOGY",
    "criteria": [
      {
        "key": "research_problem",
        "title": "Research Problem & Research Questions",
        "description": "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology."
          }
        ]
      },
      {
        "key": "originality",
        "title": "Originality & Scientific Contributions",
        "description": "Clear, substantiated scholarly contribution positioned accurately relative to existing work.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "No discernible scholarly contribution; repeats existing work without new insight, framing, evidence, or synthesis."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Claimed contributions are unclear, overstated, or only marginally distinguished from prior studies without convincing justification."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies a modest, legitimate contribution, but its distinction from related work or significance to the field needs clearer articulation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents clear, well-bounded contributions that meaningfully extend prior work and align with the evidence or analysis provided."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers distinct, well-substantiated contributions with transparent positioning against prior work and clear scholarly or practical value."
          }
        ]
      },
      {
        "key": "literature",
        "title": "Literature Review & Related Work",
        "description": "Critical, balanced synthesis of relevant, credible, and current literature establishing context for the study.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Omits essential foundational or recent work, relies on unreliable sources, or fails to connect prior literature to the study."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Covers a narrow or unbalanced set of papers and summarizes them descriptively without comparing methods, findings, or limitations."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Covers main relevant studies with credible sources, but critical comparison and explicit linkage to the research gap remain limited."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Critically synthesizes relevant foundational and recent literature, clearly contrasting approaches and situating the present work."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Demonstrates authoritative, balanced command of the literature, integrating seminal and current work into a sharp critical synthesis that directly motivates every core design choice."
          }
        ]
      },
      {
        "key": "methodology",
        "title": "Methodology & Reproducibility",
        "description": "The research method fits the questions (quantitative, qualitative, mixed, or theoretical), is well justified, and provides enough detail for audit or replication.",
        "weight": 20,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The method is inappropriate for the research questions, fundamentally flawed, or lacks the procedural detail needed to understand how the study was conducted."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The general approach is identifiable, but key design justifications, procedures, assumptions, or operational details are missing or inconsistent."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The method is broadly appropriate and described at a workable level, though specific parameters, protocols, or justification of trade-offs need clearer detail."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-justified methodology clearly aligned with the research questions, documenting procedures, context, and key design choices clearly enough to audit or replicate."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Exemplary methodological rigor appropriate to the research paradigm, with transparent rationale for alternatives rejected, explicit validity safeguards, and complete documentation for independent replication or audit."
          }
        ]
      },
      {
        "key": "data_evaluation",
        "title": "Validation Strategy",
        "description": "Validation, verification, or trustworthiness strategy appropriate to the proposed methodology and current research stage.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Provides no credible way to validate the methodology or verify whether its outputs are reliable."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Proposes narrow or mismatched validation checks that fail to test core methodological claims or assumptions."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Describes a reasonable validation strategy, though criteria for adequacy, edge cases, or comparative checks need refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Defines clear, well-aligned validation procedures and metrics or trustworthiness criteria suited to the methodology and stage."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Designs a comprehensive, multi-angle validation strategy that directly probes key assumptions, boundary conditions, and failure modes."
          }
        ]
      },
      {
        "key": "results_discussion",
        "title": "Assumptions, Risks & Limitations",
        "description": "Explicit treatment of methodological assumptions, validity threats, boundary conditions, and mitigation strategies.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Fails to state underlying assumptions or recognize obvious threats to internal, external, or analytical validity."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Lists generic limitations without linking them to the specific methodology or explaining how they affect interpretation."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies main assumptions and validity threats, though trade-offs and mitigation strategies need clearer explanation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Articulates key methodological assumptions, boundary conditions, and validity threats clearly, pairing them with practical safeguards."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Critically examines assumptions, trade-offs, and validity threats across the design, clearly defining where the method holds, where it breaks down, and how residual risks are managed."
          }
        ]
      },
      {
        "key": "writing",
        "title": "Scientific Writing, Structure & Presentation",
        "description": "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument."
          }
        ]
      },
      {
        "key": "references",
        "title": "References & Citation Accuracy",
        "description": "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature."
          }
        ]
      }
    ]
  },
  {
    "artifactType": "THESIS_CHAPTER",
    "criteria": [
      {
        "key": "research_problem",
        "title": "Research Problem & Research Questions",
        "description": "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology."
          }
        ]
      },
      {
        "key": "originality",
        "title": "Originality & Scientific Contributions",
        "description": "Clear, substantiated scholarly contribution positioned accurately relative to existing work.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "No discernible scholarly contribution; repeats existing work without new insight, framing, evidence, or synthesis."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Claimed contributions are unclear, overstated, or only marginally distinguished from prior studies without convincing justification."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies a modest, legitimate contribution, but its distinction from related work or significance to the field needs clearer articulation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents clear, well-bounded contributions that meaningfully extend prior work and align with the evidence or analysis provided."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers distinct, well-substantiated contributions with transparent positioning against prior work and clear scholarly or practical value."
          }
        ]
      },
      {
        "key": "literature",
        "title": "Literature Review & Related Work",
        "description": "Critical, balanced synthesis of relevant, credible, and current literature establishing context for the study.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Omits essential foundational or recent work, relies on unreliable sources, or fails to connect prior literature to the study."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Covers a narrow or unbalanced set of papers and summarizes them descriptively without comparing methods, findings, or limitations."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Covers main relevant studies with credible sources, but critical comparison and explicit linkage to the research gap remain limited."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Critically synthesizes relevant foundational and recent literature, clearly contrasting approaches and situating the present work."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Demonstrates authoritative, balanced command of the literature, integrating seminal and current work into a sharp critical synthesis that directly motivates every core design choice."
          }
        ]
      },
      {
        "key": "methodology",
        "title": "Methodology & Reproducibility",
        "description": "The research method fits the questions (quantitative, qualitative, mixed, or theoretical), is well justified, and provides enough detail for audit or replication.",
        "weight": 20,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The method is inappropriate for the research questions, fundamentally flawed, or lacks the procedural detail needed to understand how the study was conducted."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The general approach is identifiable, but key design justifications, procedures, assumptions, or operational details are missing or inconsistent."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The method is broadly appropriate and described at a workable level, though specific parameters, protocols, or justification of trade-offs need clearer detail."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-justified methodology clearly aligned with the research questions, documenting procedures, context, and key design choices clearly enough to audit or replicate."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Exemplary methodological rigor appropriate to the research paradigm, with transparent rationale for alternatives rejected, explicit validity safeguards, and complete documentation for independent replication or audit."
          }
        ]
      },
      {
        "key": "data_evaluation",
        "title": "Data, Evidence & Evaluation",
        "description": "Transparent provenance of data or empirical/analytical material, suitable evaluation or analytical design, and appropriate comparison or verification.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Data, empirical sources, or analytical evidence are missing, unverified, ethically problematic, or unsuitable for evaluating the claims."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Data or evaluation design has substantial gaps, such as missing provenance, weak comparison baselines/controls, or analytical techniques misaligned with the data."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Provides relevant data or analytical material with basic evaluation procedures, though provenance details, robustness checks, or comparison breadth need strengthening."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Documents data/source provenance transparently and applies well-suited evaluation, comparison, or trustworthiness checks aligned with the study paradigm."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Exhibits rigorous data stewardship and evaluation design—with transparent provenance, strong comparative or triangulation safeguards, and thorough sensitivity, ablation, or trustworthiness verification."
          }
        ]
      },
      {
        "key": "results_discussion",
        "title": "Results, Discussion & Limitations",
        "description": "Clear presentation and interpretation of findings backed by evidence, balanced discussion relative to prior work, and candid limitations.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Results are missing, contradictory, or unsupported by evidence; conclusions overclaim and omit critical limitations."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Reports raw outputs with shallow interpretation, leaves notable inconsistencies unexplained, or treats limitations superficially."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Presents core findings accurately and offers basic discussion and limitations, though deeper interpretation, error/case analysis, or linkage to literature is needed."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Interprets findings clearly within the bounds of the evidence, compares meaningfully with prior work, and discusses substantive limitations honestly."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Provides nuanced, evidence-grounded analysis including uncertainty, negative or edge cases, insightful theoretical/practical implications, and candid, well-scoped limitations."
          }
        ]
      },
      {
        "key": "writing",
        "title": "Scientific Writing, Structure & Presentation",
        "description": "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument."
          }
        ]
      },
      {
        "key": "references",
        "title": "References & Citation Accuracy",
        "description": "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature."
          }
        ]
      }
    ]
  },
  {
    "artifactType": "THESIS_DRAFT",
    "criteria": [
      {
        "key": "research_problem",
        "title": "Research Problem & Research Questions",
        "description": "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology."
          }
        ]
      },
      {
        "key": "originality",
        "title": "Originality & Scientific Contributions",
        "description": "Clear, substantiated scholarly contribution positioned accurately relative to existing work.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "No discernible scholarly contribution; repeats existing work without new insight, framing, evidence, or synthesis."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Claimed contributions are unclear, overstated, or only marginally distinguished from prior studies without convincing justification."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies a modest, legitimate contribution, but its distinction from related work or significance to the field needs clearer articulation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents clear, well-bounded contributions that meaningfully extend prior work and align with the evidence or analysis provided."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers distinct, well-substantiated contributions with transparent positioning against prior work and clear scholarly or practical value."
          }
        ]
      },
      {
        "key": "literature",
        "title": "Literature Review & Related Work",
        "description": "Critical, balanced synthesis of relevant, credible, and current literature establishing context for the study.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Omits essential foundational or recent work, relies on unreliable sources, or fails to connect prior literature to the study."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Covers a narrow or unbalanced set of papers and summarizes them descriptively without comparing methods, findings, or limitations."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Covers main relevant studies with credible sources, but critical comparison and explicit linkage to the research gap remain limited."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Critically synthesizes relevant foundational and recent literature, clearly contrasting approaches and situating the present work."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Demonstrates authoritative, balanced command of the literature, integrating seminal and current work into a sharp critical synthesis that directly motivates every core design choice."
          }
        ]
      },
      {
        "key": "methodology",
        "title": "Methodology & Reproducibility",
        "description": "The research method fits the questions (quantitative, qualitative, mixed, or theoretical), is well justified, and provides enough detail for audit or replication.",
        "weight": 20,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The method is inappropriate for the research questions, fundamentally flawed, or lacks the procedural detail needed to understand how the study was conducted."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The general approach is identifiable, but key design justifications, procedures, assumptions, or operational details are missing or inconsistent."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The method is broadly appropriate and described at a workable level, though specific parameters, protocols, or justification of trade-offs need clearer detail."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-justified methodology clearly aligned with the research questions, documenting procedures, context, and key design choices clearly enough to audit or replicate."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Exemplary methodological rigor appropriate to the research paradigm, with transparent rationale for alternatives rejected, explicit validity safeguards, and complete documentation for independent replication or audit."
          }
        ]
      },
      {
        "key": "data_evaluation",
        "title": "Data, Evidence & Evaluation",
        "description": "Transparent provenance of data or empirical/analytical material, suitable evaluation or analytical design, and appropriate comparison or verification.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Data, empirical sources, or analytical evidence are missing, unverified, ethically problematic, or unsuitable for evaluating the claims."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Data or evaluation design has substantial gaps, such as missing provenance, weak comparison baselines/controls, or analytical techniques misaligned with the data."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Provides relevant data or analytical material with basic evaluation procedures, though provenance details, robustness checks, or comparison breadth need strengthening."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Documents data/source provenance transparently and applies well-suited evaluation, comparison, or trustworthiness checks aligned with the study paradigm."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Exhibits rigorous data stewardship and evaluation design—with transparent provenance, strong comparative or triangulation safeguards, and thorough sensitivity, ablation, or trustworthiness verification."
          }
        ]
      },
      {
        "key": "results_discussion",
        "title": "Results, Discussion & Limitations",
        "description": "Clear presentation and interpretation of findings backed by evidence, balanced discussion relative to prior work, and candid limitations.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Results are missing, contradictory, or unsupported by evidence; conclusions overclaim and omit critical limitations."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Reports raw outputs with shallow interpretation, leaves notable inconsistencies unexplained, or treats limitations superficially."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Presents core findings accurately and offers basic discussion and limitations, though deeper interpretation, error/case analysis, or linkage to literature is needed."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Interprets findings clearly within the bounds of the evidence, compares meaningfully with prior work, and discusses substantive limitations honestly."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Provides nuanced, evidence-grounded analysis including uncertainty, negative or edge cases, insightful theoretical/practical implications, and candid, well-scoped limitations."
          }
        ]
      },
      {
        "key": "writing",
        "title": "Scientific Writing, Structure & Presentation",
        "description": "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument."
          }
        ]
      },
      {
        "key": "references",
        "title": "References & Citation Accuracy",
        "description": "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature."
          }
        ]
      }
    ]
  },
  {
    "artifactType": "SOFTWARE_RESEARCH_PROJECT",
    "criteria": [
      {
        "key": "research_problem",
        "title": "Research Problem & Research Questions",
        "description": "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology."
          }
        ]
      },
      {
        "key": "originality",
        "title": "Originality & Scientific Contributions",
        "description": "Clear, substantiated scholarly contribution positioned accurately relative to existing work.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "No discernible scholarly contribution; repeats existing work without new insight, framing, evidence, or synthesis."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Claimed contributions are unclear, overstated, or only marginally distinguished from prior studies without convincing justification."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies a modest, legitimate contribution, but its distinction from related work or significance to the field needs clearer articulation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Presents clear, well-bounded contributions that meaningfully extend prior work and align with the evidence or analysis provided."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers distinct, well-substantiated contributions with transparent positioning against prior work and clear scholarly or practical value."
          }
        ]
      },
      {
        "key": "literature",
        "title": "Literature Review & Related Work",
        "description": "Critical, balanced synthesis of relevant, credible, and current literature establishing context for the study.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Omits essential foundational or recent work, relies on unreliable sources, or fails to connect prior literature to the study."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Covers a narrow or unbalanced set of papers and summarizes them descriptively without comparing methods, findings, or limitations."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Covers main relevant studies with credible sources, but critical comparison and explicit linkage to the research gap remain limited."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Critically synthesizes relevant foundational and recent literature, clearly contrasting approaches and situating the present work."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Demonstrates authoritative, balanced command of the literature, integrating seminal and current work into a sharp critical synthesis that directly motivates every core design choice."
          }
        ]
      },
      {
        "key": "methodology",
        "title": "Research Design & Work Plan",
        "description": "Aligns research questions, technical or empirical methods, deliverables, and reproducibility practices.",
        "weight": 20,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Work plan is disjointed from research questions; technical architecture or methodological steps are missing or unworkable."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Describes software or research activities vaguely without clear alignment between technical choices, research goals, and reproducible deliverables."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Presents a sensible research and engineering plan, though specific milestones, design rationale, or reproducibility practices need sharper detail."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Coherently aligns research questions, technical design, deliverables, and versioning/reproducibility practices into an actionable plan."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Integrates rigorous research design with well-justified engineering decisions, explicit evaluation checkpoints, and strong artifact reproducibility standards."
          }
        ]
      },
      {
        "key": "data_evaluation",
        "title": "Data, Resources & Evaluation Plan",
        "description": "Assesses feasible data/resource availability and concrete evaluation criteria for the software research project — not completed experiments.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Required datasets, computing/software resources, or evaluation criteria are missing or clearly unobtainable."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Lists resources or metrics broadly, but omits concrete access plans, baselines, or how engineering quality and research claims will be evaluated."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Identifies workable data/resources and basic evaluation metrics, though operational benchmarks or resource contingencies need clarification."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Details realistic data/resource plans with well-chosen evaluation metrics, baselines, or user/system testing aligned with project objectives."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Presents a thorough, verifiable resource and evaluation plan covering datasets, environment reproducibility, meaningful baselines, and both quantitative/qualitative success criteria."
          }
        ]
      },
      {
        "key": "results_discussion",
        "title": "Timeline, Risks & Limitations",
        "description": "Realistic milestones, technical and research dependencies, validity risks, and clear scope boundaries.",
        "weight": 15,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Milestones, dependencies, or technical/research risks are missing or clearly unrealistic for the scope."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Provides a rough schedule with generic risks, omitting key bottlenecks, integration dependencies, or fallback options."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Presents reasonable milestones and identifies major risks, though dependency sequencing and limitation boundaries need sharper detail."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Lays out realistic, well-sequenced milestones alongside concrete technical/research risks, mitigations, and clear project limitations."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Delivers an execution-ready schedule with explicit dependency management, actionable risk mitigations, and candid boundaries on both engineering and research validity."
          }
        ]
      },
      {
        "key": "writing",
        "title": "Scientific Writing, Structure & Presentation",
        "description": "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument."
          }
        ]
      },
      {
        "key": "references",
        "title": "References & Citation Accuracy",
        "description": "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
        "weight": 10,
        "required": true,
        "allowNotApplicable": false,
        "levels": [
          {
            "score": 1,
            "label": "Poor / Không đạt",
            "description": "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability."
          },
          {
            "score": 2,
            "label": "Weak / Cần sửa nhiều",
            "description": "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources."
          },
          {
            "score": 3,
            "label": "Adequate / Đạt cơ bản",
            "description": "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain."
          },
          {
            "score": 4,
            "label": "Good / Tốt",
            "description": "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources."
          },
          {
            "score": 5,
            "label": "Excellent / Rất tốt",
            "description": "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature."
          }
        ]
      }
    ]
  }
]
$rubrics_v2$::jsonb)
  LOOP
    SELECT id INTO tpl_id
    FROM review_templates
    WHERE source = 'SYSTEM'
      AND active = true
      AND (artifact_type = artifact->>'artifactType' OR submission_type = artifact->>'artifactType')
      AND name LIKE 'LumiGap Scientific Manuscript Review Rubric%'
    ORDER BY created_at ASC
    LIMIT 1;

    IF tpl_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Idempotency guard: skip if version 2 already exists for this system template.
    IF EXISTS (
      SELECT 1 FROM review_template_versions
      WHERE template_id = tpl_id AND version_number = 2
    ) THEN
      CONTINUE;
    END IF;

    v2_id := gen_random_uuid();
    INSERT INTO review_template_versions (
      id, template_id, version_number, review_mode, description, guidelines, status, published_at
    ) VALUES (
      v2_id,
      tpl_id,
      2,
      'RUBRIC_ASSESSMENT',
      'LumiGap internal academic rubric v2.0 with criterion-specific performance descriptors. Not a publisher-mandated standard.',
      ARRAY['LumiGap Scientific Manuscript Review Rubric v2.0', 'No default scores. NOT_ASSESSED is not zero. Use N/A only where permitted.', 'Weighted average uses assessed applicable criteria; coverage is shown separately. No score threshold grants approval.', 'Explain the issue, why it matters, where it occurs and the requested improvement.', 'Integrity concerns need human review, never an AI-detector misconduct verdict.', 'Internal readiness is not journal or conference acceptance.'],
      'PUBLISHED',
      now()
    );

    ord := 0;
    FOR criterion IN SELECT value FROM jsonb_array_elements(artifact->'criteria') LOOP
      criterion_id := gen_random_uuid();
      INSERT INTO review_criteria (
        id, template_id, version_id, key, label, description, weight, "order", required, allow_not_applicable, updated_at
      ) VALUES (
        criterion_id,
        tpl_id,
        v2_id,
        criterion->>'key',
        criterion->>'title',
        criterion->>'description',
        (criterion->>'weight')::float,
        ord,
        COALESCE((criterion->>'required')::boolean, true),
        COALESCE((criterion->>'allowNotApplicable')::boolean, false),
        now()
      );

      pos := 0;
      FOR lvl IN SELECT value FROM jsonb_array_elements(criterion->'levels') LOOP
        INSERT INTO review_criterion_levels (
          criterion_id, label, description, score, position
        ) VALUES (
          criterion_id,
          lvl->>'label',
          lvl->>'description',
          (lvl->>'score')::integer,
          pos
        );
        pos := pos + 1;
      END LOOP;

      ord := ord + 1;
    END LOOP;

    -- Point active_version_id to v2.0 for new review requests while preserving v1.0 for all historical reviews.
    UPDATE review_templates
    SET active_version_id = v2_id,
        version = 2,
        updated_at = now()
    WHERE id = tpl_id;
  END LOOP;
END $seed_v2$;

COMMIT;
