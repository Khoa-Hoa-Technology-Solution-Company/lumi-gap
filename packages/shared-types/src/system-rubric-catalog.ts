import { SCIENTIFIC_REVIEW_POLICY_V2 } from "./scientific-review.js";

export type SystemRubricArtifactType =
  | "RESEARCH_PAPER"
  | "RESEARCH_PROPOSAL"
  | "LITERATURE_REVIEW"
  | "METHODOLOGY"
  | "THESIS_CHAPTER"
  | "THESIS_DRAFT"
  | "SOFTWARE_RESEARCH_PROJECT";

export type SystemRubricCriterionKey =
  | "research_problem"
  | "originality"
  | "literature"
  | "methodology"
  | "data_evaluation"
  | "results_discussion"
  | "writing"
  | "references";

export type SystemRubricScore = 1 | 2 | 3 | 4 | 5;

export interface BilingualRubricText {
  en: string;
  vi: string;
}

export interface SystemRubricCriterionSpec {
  key: SystemRubricCriterionKey;
  weight: number;
  required: boolean;
  allowNotApplicable: boolean;
  title: BilingualRubricText;
  description: BilingualRubricText;
  levels: Record<SystemRubricScore, BilingualRubricText>;
}

export interface SystemRubricTemplateSpec {
  artifactType: SystemRubricArtifactType;
  versionNumber: 2;
  policyGuideline: string;
  guidelines: readonly string[];
  criteria: readonly SystemRubricCriterionSpec[];
}

export const SYSTEM_RUBRIC_LEVEL_LABELS: Record<SystemRubricScore, string> = {
  1: "Poor / Không đạt",
  2: "Weak / Cần sửa nhiều",
  3: "Adequate / Đạt cơ bản",
  4: "Good / Tốt",
  5: "Excellent / Rất tốt",
};

export const SYSTEM_RUBRIC_V2_GUIDELINES: readonly string[] = [
  SCIENTIFIC_REVIEW_POLICY_V2,
  "No default scores. NOT_ASSESSED is not zero. Use N/A only where permitted.",
  "Weighted average uses assessed applicable criteria; coverage is shown separately. No score threshold grants approval.",
  "Explain the issue, why it matters, where it occurs and the requested improvement.",
  "Integrity concerns need human review, never an AI-detector misconduct verdict.",
  "Internal readiness is not journal or conference acceptance.",
];

// Shared criterion specs tailored so quantitative, qualitative, mixed-methods, and theoretical works
// are evaluated fairly without mechanically imposing statistical or laboratory requirements.

const RESEARCH_PROBLEM_SPEC: SystemRubricCriterionSpec = {
  key: "research_problem",
  weight: 10,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Research Problem & Research Questions",
    vi: "Vấn đề & Câu hỏi nghiên cứu",
  },
  description: {
    en: "The research problem is clearly defined; research questions have scholarly grounding, clear focus, and can be investigated with an appropriate method.",
    vi: "Vấn đề nghiên cứu được xác định rõ; câu hỏi có cơ sở học thuật, có trọng tâm và có thể được nghiên cứu bằng phương pháp phù hợp.",
  },
  levels: {
    1: {
      en: "The research problem or questions are undefined, lack scholarly justification, or do not align with the stated aims of the work.",
      vi: "Vấn đề nghiên cứu hoặc câu hỏi nghiên cứu không được xác định rõ, thiếu cơ sở học thuật hoặc không phù hợp với mục tiêu công trình.",
    },
    2: {
      en: "The problem is mentioned but remains vague. Research questions lack grounding, have an unsuitable scope, or are difficult to investigate with the chosen approach.",
      vi: "Vấn đề nghiên cứu đã được đề cập nhưng còn mơ hồ. Câu hỏi nghiên cứu thiếu cơ sở, phạm vi chưa hợp lý hoặc khó giải quyết bằng hướng tiếp cận được lựa chọn.",
    },
    3: {
      en: "The problem and research questions are reasonably clear, though their scope, scholarly rationale, or feasibility still needs refinement.",
      vi: "Vấn đề và câu hỏi nghiên cứu tương đối rõ ràng. Tuy nhiên, phạm vi, cơ sở học thuật hoặc tính khả thi vẫn cần được hoàn thiện.",
    },
    4: {
      en: "The problem is clearly articulated; research questions have solid scholarly grounding, a reasonable scope, and fit the chosen research approach.",
      vi: "Vấn đề được xác định rõ, câu hỏi có cơ sở học thuật vững, phạm vi hợp lý và phù hợp với hướng tiếp cận nghiên cứu.",
    },
    5: {
      en: "The research problem is tightly framed with compelling scholarly motivation. Research questions are sharply focused, well-scoped, and demonstrably feasible with an appropriate methodology.",
      vi: "Vấn đề nghiên cứu được xác định chặt chẽ và có cơ sở học thuật thuyết phục. Câu hỏi có trọng tâm, phạm vi rõ ràng và khả thi với phương pháp nghiên cứu phù hợp.",
    },
  },
};

const ORIGINALITY_GENERAL_SPEC: SystemRubricCriterionSpec = {
  key: "originality",
  weight: 10,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Originality & Scientific Contributions",
    vi: "Tính mới & Đóng góp khoa học",
  },
  description: {
    en: "Clear, substantiated scholarly contribution positioned accurately relative to existing work.",
    vi: "Đóng góp học thuật được xác định rõ ràng, có cơ sở và định vị chính xác so với các công trình hiện có.",
  },
  levels: {
    1: {
      en: "No discernible scholarly contribution; repeats existing work without new insight, framing, evidence, or synthesis.",
      vi: "Không thể hiện đóng góp học thuật rõ rệt; lặp lại các công trình đã có mà không bổ sung góc nhìn, minh chứng hoặc lập luận mới.",
    },
    2: {
      en: "Claimed contributions are unclear, overstated, or only marginally distinguished from prior studies without convincing justification.",
      vi: "Đóng góp được nêu còn mơ hồ, phóng đại hoặc chỉ khác biệt rất ít so với nghiên cứu trước mà chưa có lập luận thuyết phục.",
    },
    3: {
      en: "Identifies a modest, legitimate contribution, but its distinction from related work or significance to the field needs clearer articulation.",
      vi: "Chỉ ra được đóng góp ở mức cơ bản và hợp lý, nhưng điểm khác biệt so với nghiên cứu liên quan hoặc ý nghĩa học thuật cần làm rõ thêm.",
    },
    4: {
      en: "Presents clear, well-bounded contributions that meaningfully extend prior work and align with the evidence or analysis provided.",
      vi: "Trình bày đóng góp rõ ràng, có giới hạn hợp lý, mở rộng có ý nghĩa so với công trình trước và nhất quán với minh chứng/phân tích trong bài.",
    },
    5: {
      en: "Delivers distinct, well-substantiated contributions with transparent positioning against prior work and clear scholarly or practical value.",
      vi: "Thể hiện đóng góp nổi bật, được định vị minh bạch so với các nghiên cứu trước, có cơ sở thuyết phục và giá trị học thuật hoặc thực tiễn rõ rệt.",
    },
  },
};

const ORIGINALITY_LITERATURE_SPEC: SystemRubricCriterionSpec = {
  key: "originality",
  weight: 10,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Synthesis Contribution",
    vi: "Đóng góp tổng hợp & Phân tích học thuật",
  },
  description: {
    en: "Provides an analytical synthesis, conceptual framing, or research agenda that goes beyond summarizing individual papers.",
    vi: "Tạo ra khung tổng hợp, phân loại hoặc định hướng nghiên cứu có giá trị phân tích vượt lên trên việc liệt kê từng bài báo.",
  },
  levels: {
    1: {
      en: "Lists or summarizes papers one by one without synthesis, thematic structure, or analytical insight.",
      vi: "Chỉ liệt kê hoặc tóm tắt rời rạc từng bài báo, không có cấu trúc tổng hợp hay nhận định phân tích.",
    },
    2: {
      en: "Groups prior work superficially, with descriptive summaries dominating and little synthesis of patterns, gaps, or conceptual links.",
      vi: "Nhóm tài liệu ở mức bề mặt, thiên về mô tả lại nội dung cũ và ít phân tích mối liên hệ hay khoảng trống nghiên cứu.",
    },
    3: {
      en: "Offers a recognizable thematic synthesis and identifies some gaps, though the analytical framing could be deeper or better integrated.",
      vi: "Xây dựng được cấu trúc tổng hợp theo chủ đề và nêu một số khoảng trống, nhưng khung phân tích còn cần đào sâu và liên kết chặt hơn.",
    },
    4: {
      en: "Synthesizes prior literature into coherent themes or frameworks and derives well-grounded research gaps or implications.",
      vi: "Tổng hợp tài liệu thành hệ thống chủ đề hoặc khung phân tích mạch lạc và rút ra được các khoảng trống, hàm ý nghiên cứu có cơ sở.",
    },
    5: {
      en: "Advances understanding of the field through an insightful taxonomy, conceptual integration, or evidence-backed research agenda that reframes existing work.",
      vi: "Nâng tầm hiểu biết về lĩnh vực thông qua hệ thống phân loại sâu sắc, tích hợp khái niệm chặt chẽ hoặc định hướng nghiên cứu mới có minh chứng vững chắc.",
    },
  },
};

const LITERATURE_GENERAL_SPEC: SystemRubricCriterionSpec = {
  key: "literature",
  weight: 10,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Literature Review & Related Work",
    vi: "Tổng quan tài liệu & Nghiên cứu liên quan",
  },
  description: {
    en: "Critical, balanced synthesis of relevant, credible, and current literature establishing context for the study.",
    vi: "Tổng hợp có phê bình, cân bằng và cập nhật các nghiên cứu liên quan uy tín để định vị bối cảnh cho công trình.",
  },
  levels: {
    1: {
      en: "Omits essential foundational or recent work, relies on unreliable sources, or fails to connect prior literature to the study.",
      vi: "Bỏ sót các công trình nền tảng hoặc nghiên cứu cập nhật thiết yếu, dùng nguồn thiếu tin cậy hoặc không gắn kết được với đề tài.",
    },
    2: {
      en: "Covers a narrow or unbalanced set of papers and summarizes them descriptively without comparing methods, findings, or limitations.",
      vi: "Phạm vi tài liệu còn hẹp hoặc thiên lệch; chủ yếu tóm tắt mô tả mà chưa đối chiếu phương pháp, kết quả hay hạn chế của các nghiên cứu trước.",
    },
    3: {
      en: "Covers main relevant studies with credible sources, but critical comparison and explicit linkage to the research gap remain limited.",
      vi: "Bao quát được các nghiên cứu liên quan chính từ nguồn uy tín, nhưng mức độ phân tích phê bình và liên kết với khoảng trống nghiên cứu còn hạn chế.",
    },
    4: {
      en: "Critically synthesizes relevant foundational and recent literature, clearly contrasting approaches and situating the present work.",
      vi: "Tổng hợp có phê bình các tài liệu nền tảng và cập nhật, so sánh rõ các hướng tiếp cận và định vị thuyết phục cho công trình hiện tại.",
    },
    5: {
      en: "Demonstrates authoritative, balanced command of the literature, integrating seminal and current work into a sharp critical synthesis that directly motivates every core design choice.",
      vi: "Thể hiện sự am hiểu sâu rộng và cân bằng về tài liệu chuyên ngành, tích hợp công trình nền tảng lẫn mới nhất thành phân tích phê bình sắc bén dẫn dắt trực tiếp thiết kế nghiên cứu.",
    },
  },
};

const LITERATURE_COVERAGE_SPEC: SystemRubricCriterionSpec = {
  key: "literature",
  weight: 10,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Coverage & Source Selection",
    vi: "Độ bao quát & Lựa chọn nguồn tài liệu",
  },
  description: {
    en: "Transparent scope boundaries, credible source selection, and balanced coverage of relevant scholarship.",
    vi: "Phạm vi bao quát minh bạch, tiêu chí lựa chọn nguồn tin cậy và độ phủ cân bằng các công trình liên quan.",
  },
  levels: {
    1: {
      en: "Scope boundaries and source selection are unstated or arbitrary; major bodies of relevant work are missing.",
      vi: "Không nêu rõ phạm vi hay cơ sở chọn tài liệu; lựa chọn mang tính tùy tiện và bỏ sót nhiều mảng nghiên cứu quan trọng.",
    },
    2: {
      en: "Selection scope is partially stated but exhibits clear coverage gaps, outdated sources, or unexplained exclusions.",
      vi: "Đã đề cập một phần phạm vi chọn lọc nhưng còn thiếu hụt rõ rệt về độ bao quát, nguồn lỗi thời hoặc loại trừ thiếu giải thích.",
    },
    3: {
      en: "Defines reasonable scope and draws mostly credible sources, though minor coverage gaps or selection justifications need clarification.",
      vi: "Xác định phạm vi tương đối hợp lý và sử dụng phần lớn nguồn uy tín, nhưng một số giới hạn độ phủ hoặc lý do chọn nguồn cần làm rõ thêm.",
    },
    4: {
      en: "Clearly justifies temporal, thematic, and source-quality boundaries, achieving balanced coverage of foundational and recent studies.",
      vi: "Giải thích rõ ràng giới hạn thời gian, chủ đề và chất lượng nguồn, đạt độ bao quát cân bằng giữa công trình nền tảng và nghiên cứu mới.",
    },
    5: {
      en: "Provides comprehensive, transparently justified coverage across key perspectives and venues, explicitly accounting for scope boundaries and potential selection bias.",
      vi: "Đạt độ bao quát toàn diện và minh bạch qua nhiều góc nhìn học thuật chính, giải trình chặt chẽ ranh giới phạm vi và khả năng thiên lệch chọn nguồn.",
    },
  },
};

const METHODOLOGY_PAPER_SPEC: SystemRubricCriterionSpec = {
  key: "methodology",
  weight: 20,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Methodology & Reproducibility",
    vi: "Phương pháp nghiên cứu & Khả năng tái lập",
  },
  description: {
    en: "The research method fits the questions (quantitative, qualitative, mixed, or theoretical), is well justified, and provides enough detail for audit or replication.",
    vi: "Phương pháp phù hợp với câu hỏi nghiên cứu (định lượng, định tính, hỗn hợp hoặc lý thuyết), có cơ sở rõ ràng và đủ chi tiết để kiểm chứng hoặc tái lập.",
  },
  levels: {
    1: {
      en: "The method is inappropriate for the research questions, fundamentally flawed, or lacks the procedural detail needed to understand how the study was conducted.",
      vi: "Phương pháp không phù hợp với câu hỏi nghiên cứu, có sai sót nghiêm trọng về thiết kế hoặc thiếu chi tiết quy trình để hiểu cách thực hiện.",
    },
    2: {
      en: "The general approach is identifiable, but key design justifications, procedures, assumptions, or operational details are missing or inconsistent.",
      vi: "Có thể nhận diện hướng tiếp cận chung, nhưng thiếu cơ sở lựa chọn phương pháp, quy trình, giả định hoặc chi tiết triển khai quan trọng.",
    },
    3: {
      en: "The method is broadly appropriate and described at a workable level, though specific parameters, protocols, or justification of trade-offs need clearer detail.",
      vi: "Phương pháp nhìn chung phù hợp và được mô tả ở mức cơ bản, nhưng một số bước quy trình, tham số hoặc lý do đánh đổi thiết kế cần làm rõ hơn.",
    },
    4: {
      en: "Well-justified methodology clearly aligned with the research questions, documenting procedures, context, and key design choices clearly enough to audit or replicate.",
      vi: "Phương pháp có cơ sở chặt chẽ, nhất quán với câu hỏi nghiên cứu, trình bày đầy đủ quy trình, bối cảnh và lựa chọn thiết kế đủ để kiểm chứng hoặc tái lập.",
    },
    5: {
      en: "Exemplary methodological rigor appropriate to the research paradigm, with transparent rationale for alternatives rejected, explicit validity safeguards, and complete documentation for independent replication or audit.",
      vi: "Đạt độ chặt chẽ cao về phương pháp luận phù hợp bản chất nghiên cứu, giải trình minh bạch các phương án thay thế, có biện pháp đảm bảo độ tin cậy/hiệu lực và đủ thông tin để độc lập kiểm chứng hoặc tái lập.",
    },
  },
};

const METHODOLOGY_PROPOSAL_SPEC: SystemRubricCriterionSpec = {
  key: "methodology",
  weight: 20,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Proposed Methodology & Reproducibility",
    vi: "Phương pháp dự kiến & Khả năng tái lập",
  },
  description: {
    en: "Evaluates the soundness, clarity, and auditability of the planned research methodology — not experiments that have not yet been conducted.",
    vi: "Đánh giá tính hợp lý, rõ ràng và khả năng kiểm chứng của phương pháp dự kiến — không đòi hỏi kết quả thực nghiệm chưa triển khai.",
  },
  levels: {
    1: {
      en: "Planned methodology is missing, incoherent, or incapable of answering the proposed research questions.",
      vi: "Kế hoạch phương pháp bị thiếu, thiếu nhất quán hoặc không thể trả lời được các câu hỏi nghiên cứu đề xuất.",
    },
    2: {
      en: "Outlines a broad direction, but lacks concrete study design, analytical procedures, or justification for why the planned method fits the problem.",
      vi: "Chỉ nêu định hướng chung, thiếu thiết kế nghiên cứu cụ thể, quy trình phân tích hoặc lập luận chứng minh sự phù hợp của phương pháp.",
    },
    3: {
      en: "Proposes a reasonable method aligned with the aims, though several operational steps, protocols, or methodological alternatives need clearer specification.",
      vi: "Đề xuất được phương pháp hợp lý và phù hợp mục tiêu, nhưng một số bước triển khai, quy trình hoặc phương án dự phòng cần cụ thể hóa hơn.",
    },
    4: {
      en: "Presents a coherent, well-justified study design with clear procedures, analytical logic, and documentation standards supporting future reproducibility.",
      vi: "Trình bày thiết kế nghiên cứu mạch lạc, có cơ sở rõ ràng cùng quy trình triển khai, logic phân tích và chuẩn ghi nhận hỗ trợ tái lập về sau.",
    },
    5: {
      en: "Delivers a rigorous, execution-ready methodological blueprint that aligns every research question to concrete procedures, addresses validity threats proactively, and defines reproducible protocols.",
      vi: "Xây dựng kế hoạch phương pháp luận chặt chẽ, sẵn sàng triển khai, gắn kết từng câu hỏi nghiên cứu với quy trình cụ thể, chủ động phòng ngừa rủi ro hiệu lực và quy định chuẩn tái lập rõ ràng.",
    },
  },
};

const METHODOLOGY_LITERATURE_SPEC: SystemRubricCriterionSpec = {
  key: "methodology",
  weight: 20,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Search & Synthesis Method",
    vi: "Phương pháp tìm kiếm & Tổng hợp tài liệu",
  },
  description: {
    en: "Evaluates transparency and suitability of the literature search, screening, and synthesis process (whether systematic, scoping, or narrative).",
    vi: "Đánh giá tính minh bạch và phù hợp của quy trình tìm kiếm, sàng lọc và tổng hợp tài liệu (tổng quan hệ thống, tổng quan phạm vi hoặc tổng quan tự sự).",
  },
  levels: {
    1: {
      en: "No explanation of how literature was searched, selected, or synthesized; process cannot be audited.",
      vi: "Không giải thích cách tìm kiếm, lựa chọn hoặc tổng hợp tài liệu; quy trình hoàn toàn không thể kiểm chứng.",
    },
    2: {
      en: "Mentions databases or themes briefly, but search strategy, inclusion/exclusion logic, or synthesis procedure is inconsistent or incomplete.",
      vi: "Chỉ nhắc sơ qua nguồn tìm kiếm hoặc chủ đề; chiến lược tìm kiếm, tiêu chí chọn/loại hoặc cách tổng hợp còn thiếu nhất quán.",
    },
    3: {
      en: "Describes a workable search or narrative selection approach, though screening criteria, search terms, or synthesis steps need fuller transparency.",
      vi: "Mô tả được quy trình tìm kiếm hoặc cách chọn tài liệu tự sự ở mức chấp nhận được, nhưng tiêu chí sàng lọc, từ khóa hoặc bước tổng hợp cần minh bạch hơn.",
    },
    4: {
      en: "Clearly documents search sources, selection rationale, and synthesis method appropriate to the review type, allowing readers to follow how conclusions were formed.",
      vi: "Trình bày rõ nguồn tìm kiếm, tiêu chí chọn lọc và phương pháp tổng hợp phù hợp loại hình tổng quan, giúp người đọc theo dõi được cách hình thành kết luận.",
    },
    5: {
      en: "Provides a fully transparent, auditable search and synthesis protocol suited to the review paradigm, explicitly justifying methodological choices and mitigating selection or synthesis bias.",
      vi: "Cung cấp quy trình tìm kiếm và tổng hợp hoàn toàn minh bạch, có thể kiểm chứng và phù hợp loại hình tổng quan, giải trình rõ mọi lựa chọn phương pháp và biện pháp giảm thiên lệch.",
    },
  },
};

const METHODOLOGY_SOFTWARE_SPEC: SystemRubricCriterionSpec = {
  key: "methodology",
  weight: 20,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Research Design & Work Plan",
    vi: "Thiết kế nghiên cứu & Kế hoạch thực hiện",
  },
  description: {
    en: "Aligns research questions, technical or empirical methods, deliverables, and reproducibility practices.",
    vi: "Liên kết chặt chẽ giữa câu hỏi nghiên cứu, phương pháp kỹ thuật/thực nghiệm, sản phẩm bàn giao và quy chuẩn tái lập.",
  },
  levels: {
    1: {
      en: "Work plan is disjointed from research questions; technical architecture or methodological steps are missing or unworkable.",
      vi: "Kế hoạch thực hiện tách rời câu hỏi nghiên cứu; thiết kế kỹ thuật hoặc các bước phương pháp bị thiếu hay không khả thi.",
    },
    2: {
      en: "Describes software or research activities vaguely without clear alignment between technical choices, research goals, and reproducible deliverables.",
      vi: "Mô tả hoạt động phần mềm hoặc nghiên cứu còn chung chung, chưa kết nối rõ lựa chọn kỹ thuật với mục tiêu nghiên cứu và đầu ra có thể kiểm chứng.",
    },
    3: {
      en: "Presents a sensible research and engineering plan, though specific milestones, design rationale, or reproducibility practices need sharper detail.",
      vi: "Đề xuất kế hoạch nghiên cứu và triển khai tương đối hợp lý, nhưng các mốc công việc, lý do thiết kế hoặc chuẩn tái lập cần làm rõ thêm.",
    },
    4: {
      en: "Coherently aligns research questions, technical design, deliverables, and versioning/reproducibility practices into an actionable plan.",
      vi: "Liên kết mạch lạc câu hỏi nghiên cứu, thiết kế kỹ thuật, sản phẩm đầu ra và quy chuẩn lưu trữ/tái lập thành kế hoạch có thể triển khai rõ ràng.",
    },
    5: {
      en: "Integrates rigorous research design with well-justified engineering decisions, explicit evaluation checkpoints, and strong artifact reproducibility standards.",
      vi: "Kết hợp chặt chẽ thiết kế nghiên cứu nghiêm túc với lựa chọn kỹ thuật có cơ sở, các mốc kiểm định rõ ràng và chuẩn mực tái lập sản phẩm nghiên cứu cao.",
    },
  },
};

const DATA_EVALUATION_PAPER_SPEC: SystemRubricCriterionSpec = {
  key: "data_evaluation",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Data, Evidence & Evaluation",
    vi: "Dữ liệu, Minh chứng & Đánh giá",
  },
  description: {
    en: "Transparent provenance of data or empirical/analytical material, suitable evaluation or analytical design, and appropriate comparison or verification.",
    vi: "Nguồn gốc dữ liệu hoặc tư liệu phân tích minh bạch, thiết kế đánh giá/kiểm chứng phù hợp bản chất nghiên cứu và đối chiếu hợp lý.",
  },
  levels: {
    1: {
      en: "Data, empirical sources, or analytical evidence are missing, unverified, ethically problematic, or unsuitable for evaluating the claims.",
      vi: "Dữ liệu, nguồn tư liệu hoặc thiết kế đánh giá bị thiếu, không rõ nguồn gốc, có vấn đề đạo đức/quyền sử dụng hoặc không đủ để kiểm chứng tuyên bố.",
    },
    2: {
      en: "Data or evaluation design has substantial gaps, such as missing provenance, weak comparison baselines/controls, or analytical techniques misaligned with the data.",
      vi: "Dữ liệu hoặc thiết kế đánh giá còn nhiều thiếu sót như chưa rõ nguồn gốc, thiếu đối chiếu/chuẩn so sánh phù hợp hoặc kỹ thuật phân tích chưa khớp đặc trưng dữ liệu.",
    },
    3: {
      en: "Provides relevant data or analytical material with basic evaluation procedures, though provenance details, robustness checks, or comparison breadth need strengthening.",
      vi: "Cung cấp dữ liệu hoặc tư liệu phù hợp cùng đánh giá ở mức cơ bản, nhưng chi tiết nguồn gốc, kiểm tra độ bền vững hoặc độ rộng đối chiếu cần củng cố thêm.",
    },
    4: {
      en: "Documents data/source provenance transparently and applies well-suited evaluation, comparison, or trustworthiness checks aligned with the study paradigm.",
      vi: "Trình bày minh bạch nguồn gốc dữ liệu/tư liệu và áp dụng thiết kế đánh giá, đối chiếu hoặc kiểm chứng độ tin cậy phù hợp với hướng nghiên cứu.",
    },
    5: {
      en: "Exhibits rigorous data stewardship and evaluation design—with transparent provenance, strong comparative or triangulation safeguards, and thorough sensitivity, ablation, or trustworthiness verification.",
      vi: "Thể hiện quản trị dữ liệu và thiết kế đánh giá chuẩn mực—minh bạch nguồn gốc, có đối chiếu hoặc kiểm chứng chéo thuyết phục cùng phân tích độ nhạy, thành phần hoặc độ tin cậy toàn diện.",
    },
  },
};

const DATA_EVALUATION_PROPOSAL_SPEC: SystemRubricCriterionSpec = {
  key: "data_evaluation",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Data Access & Evaluation Plan",
    vi: "Kế hoạch dữ liệu & Đánh giá",
  },
  description: {
    en: "Feasible data collection or source access, ethics/privacy readiness, and clear criteria for evaluating planned outcomes.",
    vi: "Tính khả thi trong thu thập/tiếp cận dữ liệu, sẵn sàng về đạo đức/quyền riêng tư và tiêu chí đánh giá kết quả dự kiến.",
  },
  levels: {
    1: {
      en: "Data sources, access feasibility, ethics considerations, or evaluation criteria are absent or unrealistic.",
      vi: "Thiếu nguồn dữ liệu, tính khả thi tiếp cận, cân nhắc đạo đức hoặc tiêu chí đánh giá; hoặc kế hoạch không khả thi.",
    },
    2: {
      en: "Mentions intended data or metrics vaguely without clarifying how access, consent/ethics, or meaningful validation will be achieved.",
      vi: "Đề cập dữ liệu hoặc chỉ số đánh giá còn chung chung, chưa làm rõ cách tiếp cận nguồn, yếu tố đạo đức/chấp thuận hay phương án kiểm định.",
    },
    3: {
      en: "Outlines a plausible data and evaluation plan, though contingencies for access, sampling/scope, or ethics compliance need clearer detail.",
      vi: "Đề xuất kế hoạch dữ liệu và đánh giá tương đối khả thi, nhưng chi tiết về tiếp cận nguồn, phạm vi mẫu hoặc tuân thủ đạo đức cần cụ thể hơn.",
    },
    4: {
      en: "Presents a realistic, ethically sound data access and evaluation plan with clear success or analytical criteria suited to the research questions.",
      vi: "Trình bày kế hoạch tiếp cận dữ liệu và đánh giá thực tế, đảm bảo đạo đức nghiên cứu với tiêu chí kiểm định rõ ràng và phù hợp câu hỏi nghiên cứu.",
    },
    5: {
      en: "Provides a concrete, thoroughly vetted data governance, ethics, and evaluation plan including contingency paths and explicit criteria for interpreting both positive and null/unexpected findings.",
      vi: "Xây dựng kế hoạch quản trị dữ liệu, đạo đức và đánh giá chi tiết, đã tính đến phương án dự phòng và tiêu chí diễn giải rõ ràng cho cả kết quả kỳ vọng lẫn kết quả ngoài dự đoán.",
    },
  },
};

const DATA_EVALUATION_LITERATURE_SPEC: SystemRubricCriterionSpec = {
  key: "data_evaluation",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Evidence Appraisal",
    vi: "Thẩm định chất lượng bằng chứng",
  },
  description: {
    en: "Evaluates how critically the review assesses the quality, rigor, and relevance of reviewed sources — not laboratory experiments.",
    vi: "Đánh giá mức độ thẩm định có phê bình về chất lượng, độ tin cậy và mức độ liên quan của các tài liệu được tổng quan — không đòi hỏi thí nghiệm phòng lab.",
  },
  levels: {
    1: {
      en: "Treats all cited sources uncritically at face value regardless of methodological quality, relevance, or evidentiary strength.",
      vi: "Tiếp nhận mọi tài liệu trích dẫn một cách thiếu chọn lọc, không phân biệt chất lượng phương pháp, mức độ liên quan hay sức nặng bằng chứng.",
    },
    2: {
      en: "Makes occasional remarks on source quality, but lacks consistent appraisal criteria or relies heavily on weak/unverified claims.",
      vi: "Chỉ nhận xét rời rạc về chất lượng nguồn, thiếu tiêu chí thẩm định nhất quán hoặc phụ thuộc nhiều vào các tuyên bố chưa đủ cơ sở.",
    },
    3: {
      en: "Distinguishes stronger from weaker studies in places, though appraisal criteria and weighting of evidence could be applied more consistently.",
      vi: "Có bước đầu phân biệt nghiên cứu mạnh và yếu ở một số đoạn, nhưng tiêu chí thẩm định và cách cân nhắc sức nặng bằng chứng cần nhất quán hơn.",
    },
    4: {
      en: "Systematically appraises the methodological rigor, context, and relevance of reviewed sources when weighing claims.",
      vi: "Thẩm định có hệ thống độ chặt chẽ phương pháp, bối cảnh và mức độ liên quan của các nguồn tài liệu khi cân nhắc lập luận.",
    },
    5: {
      en: "Applies transparent, nuanced evidence appraisal across the corpus, explicitly distinguishing well-supported consensus from preliminary, context-bound, or methodologically weak claims.",
      vi: "Áp dụng tiêu chí thẩm định bằng chứng minh bạch và tinh tế trên toàn bộ tập tài liệu, tách bạch rõ đồng thuận có cơ sở vững với các nhận định sơ bộ, phụ thuộc bối cảnh hoặc yếu về phương pháp.",
    },
  },
};

const DATA_EVALUATION_METHODOLOGY_SPEC: SystemRubricCriterionSpec = {
  key: "data_evaluation",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Validation Strategy",
    vi: "Chiến lược kiểm chứng & Đánh giá",
  },
  description: {
    en: "Validation, verification, or trustworthiness strategy appropriate to the proposed methodology and current research stage.",
    vi: "Chiến lược kiểm chứng, đối chiếu hoặc đảm bảo độ tin cậy phù hợp với phương pháp luận và giai đoạn nghiên cứu hiện tại.",
  },
  levels: {
    1: {
      en: "Provides no credible way to validate the methodology or verify whether its outputs are reliable.",
      vi: "Không đưa ra cơ chế đáng tin cậy để kiểm chứng phương pháp hoặc xác minh độ tin cậy của kết quả thu được.",
    },
    2: {
      en: "Proposes narrow or mismatched validation checks that fail to test core methodological claims or assumptions.",
      vi: "Đề xuất cách kiểm chứng còn hẹp hoặc chưa khớp, không kiểm tra được các giả định và tuyên bố cốt lõi của phương pháp.",
    },
    3: {
      en: "Describes a reasonable validation strategy, though criteria for adequacy, edge cases, or comparative checks need refinement.",
      vi: "Mô tả chiến lược kiểm chứng hợp lý ở mức cơ bản, nhưng tiêu chí đánh giá mức đạt, trường hợp biên hoặc đối chiếu cần cụ thể hơn.",
    },
    4: {
      en: "Defines clear, well-aligned validation procedures and metrics or trustworthiness criteria suited to the methodology and stage.",
      vi: "Xác định quy trình kiểm chứng cùng tiêu chí/chỉ số độ tin cậy rõ ràng, phù hợp chặt chẽ với phương pháp và giai đoạn nghiên cứu.",
    },
    5: {
      en: "Designs a comprehensive, multi-angle validation strategy that directly probes key assumptions, boundary conditions, and failure modes.",
      vi: "Thiết kế chiến lược kiểm chứng đa chiều toàn diện, kiểm tra trực tiếp các giả định cốt lõi, điều kiện biên và tình huống phương pháp có thể sai lệch.",
    },
  },
};

const DATA_EVALUATION_SOFTWARE_SPEC: SystemRubricCriterionSpec = {
  key: "data_evaluation",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Data, Resources & Evaluation Plan",
    vi: "Dữ liệu, Tài nguyên & Kế hoạch đánh giá",
  },
  description: {
    en: "Assesses feasible data/resource availability and concrete evaluation criteria for the software research project — not completed experiments.",
    vi: "Đánh giá tính khả thi của dữ liệu, tài nguyên kỹ thuật và tiêu chí đánh giá dự án nghiên cứu phần mềm — không yêu cầu thực nghiệm đã hoàn tất.",
  },
  levels: {
    1: {
      en: "Required datasets, computing/software resources, or evaluation criteria are missing or clearly unobtainable.",
      vi: "Thiếu dữ liệu, tài nguyên tính toán/phần mềm hoặc tiêu chí đánh giá; hoặc nguồn lực yêu cầu không khả thi.",
    },
    2: {
      en: "Lists resources or metrics broadly, but omits concrete access plans, baselines, or how engineering quality and research claims will be evaluated.",
      vi: "Liệt kê tài nguyên hoặc chỉ số còn đại khái, thiếu kế hoạch tiếp cận, mốc so sánh hoặc cách đánh giá đồng thời chất lượng kỹ thuật và câu hỏi nghiên cứu.",
    },
    3: {
      en: "Identifies workable data/resources and basic evaluation metrics, though operational benchmarks or resource contingencies need clarification.",
      vi: "Xác định được dữ liệu, tài nguyên và chỉ số đánh giá cơ bản khả thi, nhưng chuẩn đối chiếu hoặc phương án dự phòng tài nguyên cần làm rõ thêm.",
    },
    4: {
      en: "Details realistic data/resource plans with well-chosen evaluation metrics, baselines, or user/system testing aligned with project objectives.",
      vi: "Trình bày kế hoạch dữ liệu và tài nguyên thực tế cùng chỉ số đánh giá, mốc đối chiếu hoặc kịch bản kiểm thử hệ thống/người dùng phù hợp mục tiêu.",
    },
    5: {
      en: "Presents a thorough, verifiable resource and evaluation plan covering datasets, environment reproducibility, meaningful baselines, and both quantitative/qualitative success criteria.",
      vi: "Cung cấp kế hoạch tài nguyên và đánh giá chặt chẽ, có thể kiểm chứng, bao quát dữ liệu, khả năng tái lập môi trường, mốc đối chiếu thuyết phục và tiêu chí đánh giá đa chiều.",
    },
  },
};

const RESULTS_DISCUSSION_PAPER_SPEC: SystemRubricCriterionSpec = {
  key: "results_discussion",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Results, Discussion & Limitations",
    vi: "Kết quả, Thảo luận & Hạn chế",
  },
  description: {
    en: "Clear presentation and interpretation of findings backed by evidence, balanced discussion relative to prior work, and candid limitations.",
    vi: "Trình bày và diễn giải kết quả rõ ràng dựa trên minh chứng, thảo luận cân bằng với nghiên cứu trước và nêu hạn chế thẳng thắn.",
  },
  levels: {
    1: {
      en: "Results are missing, contradictory, or unsupported by evidence; conclusions overclaim and omit critical limitations.",
      vi: "Kết quả bị thiếu, mâu thuẫn hoặc không có minh chứng hỗ trợ; kết luận suy diễn quá mức và bỏ qua các hạn chế cốt lõi.",
    },
    2: {
      en: "Reports raw outputs with shallow interpretation, leaves notable inconsistencies unexplained, or treats limitations superficially.",
      vi: "Trình bày kết quả thô với phân tích còn nông, chưa giải thích các điểm bất nhất đáng chú ý hoặc chỉ nêu hạn chế mang tính hình thức.",
    },
    3: {
      en: "Presents core findings accurately and offers basic discussion and limitations, though deeper interpretation, error/case analysis, or linkage to literature is needed.",
      vi: "Trình bày kết quả chính tương đối chính xác cùng thảo luận và hạn chế ở mức cơ bản, nhưng cần phân tích sâu hơn về nguyên nhân, sai số/tình huống ngoại lệ và liên hệ tài liệu.",
    },
    4: {
      en: "Interprets findings clearly within the bounds of the evidence, compares meaningfully with prior work, and discusses substantive limitations honestly.",
      vi: "Diễn giải kết quả mạch lạc trong đúng giới hạn minh chứng, đối chiếu có ý nghĩa với các công trình trước và thảo luận thẳng thắn các hạn chế thực chất.",
    },
    5: {
      en: "Provides nuanced, evidence-grounded analysis including uncertainty, negative or edge cases, insightful theoretical/practical implications, and candid, well-scoped limitations.",
      vi: "Phân tích kết quả sâu sắc, chặt chẽ theo minh chứng, bao gồm phân tích độ bất định, trường hợp ngoại lệ/sai số, hàm ý lý thuyết-thực tiễn thuyết phục và trình bày hạn chế thẳng thắn, rõ phạm vi.",
    },
  },
};

const RESULTS_DISCUSSION_PROPOSAL_SPEC: SystemRubricCriterionSpec = {
  key: "results_discussion",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Feasibility, Risks & Expected Contribution",
    vi: "Tính khả thi, Rủi ro & Đóng góp dự kiến",
  },
  description: {
    en: "Realistic timeline, candid assessment of methodological/execution risks and limitations, and grounded expected outcomes — not invented results.",
    vi: "Tiến độ thực tế, nhận diện thẳng thắn rủi ro/hạn chế triển khai và kỳ vọng đóng góp có cơ sở — không đòi hỏi kết quả đã có.",
  },
  levels: {
    1: {
      en: "Timeline, risks, and expected outcomes are missing, implausible, or rely on unsupported assumptions.",
      vi: "Thiếu kế hoạch tiến độ, phân tích rủi ro hoặc đóng góp dự kiến; hoặc các giả định hoàn toàn thiếu cơ sở thực tế.",
    },
    2: {
      en: "States optimistic goals and a rough schedule, but overlooks major methodological, resource, or timeline risks and mitigation steps.",
      vi: "Đặt mục tiêu lạc quan và lịch trình sơ sài, bỏ qua các rủi ro lớn về phương pháp, nguồn lực hoặc tiến độ và chưa có hướng xử lý.",
    },
    3: {
      en: "Outlines a plausible timeline and expected contributions with basic risk awareness, though mitigation plans and scope limits need elaboration.",
      vi: "Đưa ra tiến độ và kỳ vọng đóng góp tương đối hợp lý kèm nhận diện rủi ro cơ bản, nhưng phương án giảm thiểu và giới hạn phạm vi cần cụ thể hơn.",
    },
    4: {
      en: "Demonstrates strong feasibility with realistic milestones, candid discussion of methodological/execution risks, and well-calibrated expected contributions.",
      vi: "Chứng minh tính khả thi tốt với các mốc tiến độ thực tế, phân tích thẳng thắn rủi ro phương pháp/triển khai và đóng góp dự kiến vừa tầm.",
    },
    5: {
      en: "Presents a highly credible execution roadmap with explicit contingencies for key validity or access risks and clearly bounded, realistic scholarly contributions.",
      vi: "Xây dựng lộ trình triển khai rất thuyết phục kèm phương án dự phòng cụ thể cho các rủi ro hiệu lực/tiếp cận chính và định vị đóng góp dự kiến rõ ràng, thực tế.",
    },
  },
};

const RESULTS_DISCUSSION_LITERATURE_SPEC: SystemRubricCriterionSpec = {
  key: "results_discussion",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Synthesis, Contradictions & Limitations",
    vi: "Tổng hợp phê bình, Mâu thuẫn & Hạn chế",
  },
  description: {
    en: "Critical integration of findings across studies, engagement with conflicting evidence, and transparent limitations of the review itself.",
    vi: "Tích hợp có phê bình kết quả giữa các nghiên cứu, phân tích bằng chứng mâu thuẫn và nêu minh bạch hạn chế của chính tổng quan.",
  },
  levels: {
    1: {
      en: "Fails to synthesize findings across studies, ignores conflicting evidence, and omits limitations of the review.",
      vi: "Không tổng hợp được kết quả giữa các nghiên cứu, bỏ qua các bằng chứng mâu thuẫn và không đề cập hạn chế của tổng quan.",
    },
    2: {
      en: "Summarizes agreements superficially while glossing over contradictions, contextual differences, or coverage limits.",
      vi: "Chỉ tóm lược sơ bộ các điểm tương đồng, lướt qua mâu thuẫn học thuật, khác biệt bối cảnh hoặc giới hạn bao quát.",
    },
    3: {
      en: "Synthesizes main patterns and notes some limitations, though conflicting findings and future research directions need deeper analysis.",
      vi: "Tổng hợp được các xu hướng chính và nêu một số hạn chế, nhưng phần phân tích kết quả trái chiều và định hướng nghiên cứu tương lai cần đào sâu hơn.",
    },
    4: {
      en: "Integrates converging and diverging findings thoughtfully, explains key tensions across studies, and states review limitations candidly.",
      vi: "Tích hợp thuyết phục cả kết quả đồng thuận lẫn trái chiều, giải thích các tranh luận chính giữa các nghiên cứu và nêu thẳng thắn hạn chế của tổng quan.",
    },
    5: {
      en: "Produces an authoritative critical synthesis that reconciles or explains contradictory evidence, clarifies boundary conditions, and derives prioritized research directions while acknowledging review limitations.",
      vi: "Tạo ra phân tích tổng hợp phê bình sâu sắc giúp lý giải các bằng chứng mâu thuẫn, làm rõ điều kiện áp dụng và đề xuất hướng nghiên cứu ưu tiên có cơ sở cùng đánh giá hạn chế minh bạch.",
    },
  },
};

const RESULTS_DISCUSSION_METHODOLOGY_SPEC: SystemRubricCriterionSpec = {
  key: "results_discussion",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Assumptions, Risks & Limitations",
    vi: "Giả định phương pháp, Rủi ro & Hạn chế",
  },
  description: {
    en: "Explicit treatment of methodological assumptions, validity threats, boundary conditions, and mitigation strategies.",
    vi: "Trình bày tường minh các giả định phương pháp, nguy cơ ảnh hưởng đến độ hiệu lực, điều kiện biên và cách giảm thiểu.",
  },
  levels: {
    1: {
      en: "Fails to state underlying assumptions or recognize obvious threats to internal, external, or analytical validity.",
      vi: "Không nêu các giả định nền tảng hoặc không nhận diện được các nguy cơ rõ rệt ảnh hưởng đến độ hiệu lực và độ tin cậy.",
    },
    2: {
      en: "Lists generic limitations without linking them to the specific methodology or explaining how they affect interpretation.",
      vi: "Chỉ liệt kê hạn chế chung chung, chưa gắn với đặc thù phương pháp đang dùng hay phân tích tác động đến kết quả diễn giải.",
    },
    3: {
      en: "Identifies main assumptions and validity threats, though trade-offs and mitigation strategies need clearer explanation.",
      vi: "Nhận diện được các giả định và nguy cơ hiệu lực chính, nhưng phần phân tích đánh đổi và giải pháp kiểm soát cần làm rõ hơn.",
    },
    4: {
      en: "Articulates key methodological assumptions, boundary conditions, and validity threats clearly, pairing them with practical safeguards.",
      vi: "Trình bày rõ ràng các giả định cốt lõi, điều kiện biên và nguy cơ hiệu lực kèm theo các biện pháp kiểm soát phù hợp.",
    },
    5: {
      en: "Critically examines assumptions, trade-offs, and validity threats across the design, clearly defining where the method holds, where it breaks down, and how residual risks are managed.",
      vi: "Phân tích sâu sắc giả định, đánh đổi thiết kế và các mối đe dọa đến hiệu lực, chỉ rõ phạm vi phương pháp phát huy hiệu quả, điểm giới hạn và cách quản trị rủi ro tồn dư.",
    },
  },
};

const RESULTS_DISCUSSION_SOFTWARE_SPEC: SystemRubricCriterionSpec = {
  key: "results_discussion",
  weight: 15,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Timeline, Risks & Limitations",
    vi: "Tiến độ, Rủi ro & Hạn chế",
  },
  description: {
    en: "Realistic milestones, technical and research dependencies, validity risks, and clear scope boundaries.",
    vi: "Các mốc tiến độ thực tế, phụ thuộc kỹ thuật/nghiên cứu, rủi ro về độ hiệu lực và giới hạn phạm vi rõ ràng.",
  },
  levels: {
    1: {
      en: "Milestones, dependencies, or technical/research risks are missing or clearly unrealistic for the scope.",
      vi: "Thiếu mốc tiến độ, phân tích phụ thuộc hoặc rủi ro kỹ thuật/nghiên cứu; hoặc kế hoạch không tương xứng với phạm vi.",
    },
    2: {
      en: "Provides a rough schedule with generic risks, omitting key bottlenecks, integration dependencies, or fallback options.",
      vi: "Chỉ có lịch trình sơ bộ và nêu rủi ro chung chung, bỏ qua nút thắt kỹ thuật, phụ thuộc tích hợp hoặc phương án dự phòng.",
    },
    3: {
      en: "Presents reasonable milestones and identifies major risks, though dependency sequencing and limitation boundaries need sharper detail.",
      vi: "Đề xuất các mốc tiến độ hợp lý và nêu được rủi ro chính, nhưng thứ tự phụ thuộc và giới hạn phạm vi cần cụ thể hơn.",
    },
    4: {
      en: "Lays out realistic, well-sequenced milestones alongside concrete technical/research risks, mitigations, and clear project limitations.",
      vi: "Xây dựng các mốc tiến độ thực tế, hợp lý về trình tự cùng phân tích rủi ro kỹ thuật/nghiên cứu, cách giảm thiểu và hạn chế rõ ràng.",
    },
    5: {
      en: "Delivers an execution-ready schedule with explicit dependency management, actionable risk mitigations, and candid boundaries on both engineering and research validity.",
      vi: "Trình bày lộ trình sẵn sàng triển khai với quản trị phụ thuộc rõ ràng, kế hoạch ứng phó rủi ro khả thi và ranh giới minh bạch cho cả giá trị kỹ thuật lẫn hiệu lực nghiên cứu.",
    },
  },
};

const WRITING_SPEC: SystemRubricCriterionSpec = {
  key: "writing",
  weight: 10,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "Scientific Writing, Structure & Presentation",
    vi: "Trình bày học thuật, Cấu trúc & Hình ảnh",
  },
  description: {
    en: "Logical organization, precise academic prose, consistent terminology, and readable tables, figures, or diagrams.",
    vi: "Bố cục mạch lạc, văn phong học thuật chính xác, thuật ngữ nhất quán, bảng biểu và hình ảnh rõ ràng dễ đọc.",
  },
  levels: {
    1: {
      en: "Disorganized structure or pervasive language, notation, or visual defects make the core argument difficult to follow.",
      vi: "Bố cục rời rạc hoặc lỗi ngôn ngữ, ký hiệu, trình bày dày đặc khiến người đọc rất khó theo dõi lập luận chính.",
    },
    2: {
      en: "Basic sections exist, but unclear transitions, imprecise phrasing, inconsistent terminology, or poorly labeled tables/figures impede comprehension.",
      vi: "Có khung mục cơ bản nhưng chuyển ý thiếu mạch lạc, diễn đạt chưa chính xác, thuật ngữ thiếu nhất quán hoặc bảng/hình thiếu chú thích rõ ràng.",
    },
    3: {
      en: "Generally readable with standard academic structure, though several sections need tighter prose, clearer signposting, or cleaner visual presentation.",
      vi: "Nhìn chung đọc hiểu được theo bố cục học thuật chuẩn, nhưng một số đoạn cần cô đọng câu chữ, dẫn dắt rõ hơn hoặc cải thiện trình bày bảng/hình.",
    },
    4: {
      en: "Well-structured, concise academic writing with consistent terminology and clear, properly captioned tables and figures.",
      vi: "Bố cục chặt chẽ, văn phong học thuật cô đọng, thuật ngữ nhất quán và bảng biểu/hình ảnh rõ ràng, chú thích đầy đủ.",
    },
    5: {
      en: "Publication-quality clarity and narrative flow: precise terminology, seamless logical progression across sections, and informative, self-contained visuals that reinforce the argument.",
      vi: "Đạt độ rõ ràng và mạch lạc chuẩn xuất bản: thuật ngữ chính xác, chuyển tiếp logic mượt mà giữa các phần, bảng và hình giàu thông tin, tự giải thích tốt và củng cố trực tiếp cho lập luận.",
    },
  },
};

const REFERENCES_SPEC: SystemRubricCriterionSpec = {
  key: "references",
  weight: 10,
  required: true,
  allowNotApplicable: false,
  title: {
    en: "References & Citation Accuracy",
    vi: "Tài liệu tham khảo & Độ chính xác trích dẫn",
  },
  description: {
    en: "Accurate, consistent, and traceable citations that fairly attribute prior work and support factual claims.",
    vi: "Trích dẫn chính xác, nhất quán, có thể truy xuất, ghi nhận công bằng công trình trước và hỗ trợ đúng các nhận định trong bài.",
  },
  levels: {
    1: {
      en: "Missing essential citations, fabricated/untraceable references, or major attribution errors undermine scholarly reliability.",
      vi: "Thiếu nhiều trích dẫn thiết yếu, tài liệu tham khảo không thể truy xuất hoặc sai sót nghiêm trọng về ghi nguồn làm giảm độ tin cậy học thuật.",
    },
    2: {
      en: "Frequent formatting inconsistencies, incomplete bibliographic metadata, or noticeable mismatches between in-text claims and cited sources.",
      vi: "Còn nhiều lỗi định dạng không nhất quán, thiếu thông tin thư mục hoặc trích dẫn trong bài chưa khớp chính xác với nội dung nguồn.",
    },
    3: {
      en: "Most claims are cited with traceable sources, though minor formatting inconsistencies, incomplete details, or citation omissions remain.",
      vi: "Phần lớn nhận định có trích dẫn nguồn truy xuất được, nhưng vẫn còn một số lỗi định dạng nhỏ, thiếu chi tiết thư mục hoặc sót trích dẫn.",
    },
    4: {
      en: "Accurate, consistent citations across the text and reference list, reliably supporting claims with credible and traceable sources.",
      vi: "Trích dẫn chính xác và nhất quán giữa nội dung bài và danh mục tham khảo, hỗ trợ đáng tin cậy cho các nhận định bằng nguồn uy tín, dễ truy xuất.",
    },
    5: {
      en: "Impeccable citation integrity: complete, uniform bibliographic metadata, exact alignment between every cited claim and its primary source, and balanced attribution to foundational and recent literature.",
      vi: "Đạt độ chuẩn xác cao về trích dẫn: thông tin thư mục đầy đủ và đồng nhất, khớp chính xác giữa từng nhận định với nguồn gốc sơ cấp, và ghi nhận công bằng cả công trình nền tảng lẫn nghiên cứu mới.",
    },
  },
};

export const SYSTEM_RUBRIC_V2_CATALOG: Record<SystemRubricArtifactType, SystemRubricTemplateSpec> = {
  RESEARCH_PAPER: {
    artifactType: "RESEARCH_PAPER",
    versionNumber: 2,
    policyGuideline: SCIENTIFIC_REVIEW_POLICY_V2,
    guidelines: SYSTEM_RUBRIC_V2_GUIDELINES,
    criteria: [
      RESEARCH_PROBLEM_SPEC,
      ORIGINALITY_GENERAL_SPEC,
      LITERATURE_GENERAL_SPEC,
      METHODOLOGY_PAPER_SPEC,
      DATA_EVALUATION_PAPER_SPEC,
      RESULTS_DISCUSSION_PAPER_SPEC,
      WRITING_SPEC,
      REFERENCES_SPEC,
    ],
  },
  RESEARCH_PROPOSAL: {
    artifactType: "RESEARCH_PROPOSAL",
    versionNumber: 2,
    policyGuideline: SCIENTIFIC_REVIEW_POLICY_V2,
    guidelines: SYSTEM_RUBRIC_V2_GUIDELINES,
    criteria: [
      RESEARCH_PROBLEM_SPEC,
      ORIGINALITY_GENERAL_SPEC,
      LITERATURE_GENERAL_SPEC,
      METHODOLOGY_PROPOSAL_SPEC,
      DATA_EVALUATION_PROPOSAL_SPEC,
      RESULTS_DISCUSSION_PROPOSAL_SPEC,
      WRITING_SPEC,
      REFERENCES_SPEC,
    ],
  },
  LITERATURE_REVIEW: {
    artifactType: "LITERATURE_REVIEW",
    versionNumber: 2,
    policyGuideline: SCIENTIFIC_REVIEW_POLICY_V2,
    guidelines: SYSTEM_RUBRIC_V2_GUIDELINES,
    criteria: [
      RESEARCH_PROBLEM_SPEC,
      ORIGINALITY_LITERATURE_SPEC,
      LITERATURE_COVERAGE_SPEC,
      METHODOLOGY_LITERATURE_SPEC,
      DATA_EVALUATION_LITERATURE_SPEC,
      RESULTS_DISCUSSION_LITERATURE_SPEC,
      WRITING_SPEC,
      REFERENCES_SPEC,
    ],
  },
  METHODOLOGY: {
    artifactType: "METHODOLOGY",
    versionNumber: 2,
    policyGuideline: SCIENTIFIC_REVIEW_POLICY_V2,
    guidelines: SYSTEM_RUBRIC_V2_GUIDELINES,
    criteria: [
      RESEARCH_PROBLEM_SPEC,
      ORIGINALITY_GENERAL_SPEC,
      LITERATURE_GENERAL_SPEC,
      METHODOLOGY_PAPER_SPEC,
      DATA_EVALUATION_METHODOLOGY_SPEC,
      RESULTS_DISCUSSION_METHODOLOGY_SPEC,
      WRITING_SPEC,
      REFERENCES_SPEC,
    ],
  },
  THESIS_CHAPTER: {
    artifactType: "THESIS_CHAPTER",
    versionNumber: 2,
    policyGuideline: SCIENTIFIC_REVIEW_POLICY_V2,
    guidelines: SYSTEM_RUBRIC_V2_GUIDELINES,
    criteria: [
      RESEARCH_PROBLEM_SPEC,
      ORIGINALITY_GENERAL_SPEC,
      LITERATURE_GENERAL_SPEC,
      METHODOLOGY_PAPER_SPEC,
      DATA_EVALUATION_PAPER_SPEC,
      RESULTS_DISCUSSION_PAPER_SPEC,
      WRITING_SPEC,
      REFERENCES_SPEC,
    ],
  },
  THESIS_DRAFT: {
    artifactType: "THESIS_DRAFT",
    versionNumber: 2,
    policyGuideline: SCIENTIFIC_REVIEW_POLICY_V2,
    guidelines: SYSTEM_RUBRIC_V2_GUIDELINES,
    criteria: [
      RESEARCH_PROBLEM_SPEC,
      ORIGINALITY_GENERAL_SPEC,
      LITERATURE_GENERAL_SPEC,
      METHODOLOGY_PAPER_SPEC,
      DATA_EVALUATION_PAPER_SPEC,
      RESULTS_DISCUSSION_PAPER_SPEC,
      WRITING_SPEC,
      REFERENCES_SPEC,
    ],
  },
  SOFTWARE_RESEARCH_PROJECT: {
    artifactType: "SOFTWARE_RESEARCH_PROJECT",
    versionNumber: 2,
    policyGuideline: SCIENTIFIC_REVIEW_POLICY_V2,
    guidelines: SYSTEM_RUBRIC_V2_GUIDELINES,
    criteria: [
      RESEARCH_PROBLEM_SPEC,
      ORIGINALITY_GENERAL_SPEC,
      LITERATURE_GENERAL_SPEC,
      METHODOLOGY_SOFTWARE_SPEC,
      DATA_EVALUATION_SOFTWARE_SPEC,
      RESULTS_DISCUSSION_SOFTWARE_SPEC,
      WRITING_SPEC,
      REFERENCES_SPEC,
    ],
  },
};

export function getSystemRubricV2Template(
  artifactType?: string | null,
): SystemRubricTemplateSpec | undefined {
  if (!artifactType) return undefined;
  return SYSTEM_RUBRIC_V2_CATALOG[artifactType as SystemRubricArtifactType];
}

export function findSystemRubricV2Criterion(
  criterion: { key: string; title?: string | null },
  artifactType?: string | null,
): SystemRubricCriterionSpec | undefined {
  const byArtifact = getSystemRubricV2Template(artifactType)?.criteria.find(
    item => item.key === criterion.key,
  );
  if (byArtifact) return byArtifact;

  const normalizedTitle = criterion.title?.trim().toLowerCase();
  if (normalizedTitle) {
    for (const template of Object.values(SYSTEM_RUBRIC_V2_CATALOG)) {
      const exactTitleMatch = template.criteria.find(
        item =>
          item.key === criterion.key &&
          (item.title.en.toLowerCase() === normalizedTitle ||
            item.title.vi.toLowerCase() === normalizedTitle),
      );
      if (exactTitleMatch) return exactTitleMatch;
    }
  }

  return SYSTEM_RUBRIC_V2_CATALOG.RESEARCH_PAPER.criteria.find(
    item => item.key === criterion.key,
  );
}
