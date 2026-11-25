import {
  SCIENTIFIC_REVIEW_POLICIES,
  SCIENTIFIC_REVIEW_POLICY_V2,
  findSystemRubricV2Criterion,
  type SystemRubricScore,
} from "@trend/shared-types";

/**
 * Vietnamese localization strictly for LumiGap's built-in system rubrics (v1.0 and v2.0).
 * User-authored or project-custom rubrics are always preserved in their original language.
 * Historical v1.0 templates never have their level descriptors silently re-interpreted as v2.0.
 */

const SYSTEM_TITLE_VI: Record<string, string> = {
  "Research Problem & Research Questions": "Vấn đề & Câu hỏi nghiên cứu",
  "Originality & Scientific Contributions": "Tính mới & Đóng góp khoa học",
  "Synthesis Contribution": "Đóng góp tổng hợp & Phân tích học thuật",
  "Literature Review & Related Work": "Tổng quan tài liệu & Nghiên cứu liên quan",
  "Coverage & Source Selection": "Độ bao quát & Lựa chọn nguồn tài liệu",
  "Methodology & Reproducibility": "Phương pháp nghiên cứu & Khả năng tái lập",
  "Proposed Methodology & Reproducibility": "Phương pháp dự kiến & Khả năng tái lập",
  "Search & Synthesis Method": "Phương pháp tìm kiếm & Tổng hợp tài liệu",
  "Research Design & Work Plan": "Thiết kế nghiên cứu & Kế hoạch thực hiện",
  "Data, Experiments & Evaluation": "Dữ liệu, Thực nghiệm & Đánh giá",
  "Data, Evidence & Evaluation": "Dữ liệu, Minh chứng & Đánh giá",
  "Data Access & Evaluation Plan": "Kế hoạch dữ liệu & Đánh giá",
  "Evidence Appraisal": "Thẩm định chất lượng bằng chứng",
  "Validation Strategy": "Chiến lược kiểm chứng & Đánh giá",
  "Data, Resources & Evaluation Plan": "Dữ liệu, Tài nguyên & Kế hoạch đánh giá",
  "Results, Discussion & Limitations": "Kết quả, Thảo luận & Hạn chế",
  "Feasibility, Risks & Expected Contribution": "Tính khả thi, Rủi ro & Đóng góp dự kiến",
  "Synthesis, Contradictions & Limitations": "Tổng hợp phê bình, Mâu thuẫn & Hạn chế",
  "Assumptions, Risks & Limitations": "Giả định phương pháp, Rủi ro & Hạn chế",
  "Timeline, Risks & Limitations": "Tiến độ, Rủi ro & Hạn chế",
  "Scientific Writing, Structure & Presentation": "Trình bày học thuật, Cấu trúc & Hình ảnh",
  "References & Citation Accuracy": "Tài liệu tham khảo & Độ chính xác trích dẫn",
};

/** Exact v1.0 English description -> Vietnamese description map so artifact-specific v1 criteria stay accurate. */
const SYSTEM_DESC_V1_VI: Record<string, string> = {
  "Clear, justified and answerable research questions.":
    "Vấn đề nghiên cứu được xác định rõ; câu hỏi có cơ sở học thuật, có trọng tâm và có thể được nghiên cứu bằng phương pháp phù hợp.",
  "Distinct contributions compared with existing work.":
    "Đóng góp học thuật rõ nét so với các công trình hiện có.",
  "An identifiable analytical contribution beyond listing papers.":
    "Tạo ra đóng góp phân tích và tổng hợp rõ nét vượt lên trên việc liệt kê từng bài báo.",
  "Critical coverage of relevant, credible prior research.":
    "Bao quát có phê bình các nghiên cứu liên quan uy tín và cập nhật.",
  "Transparent scope and justified source coverage.":
    "Phạm vi minh bạch và độ bao quát nguồn tài liệu có cơ sở.",
  "A justified method, sufficient detail and reproducibility.":
    "Phương pháp có cơ sở khoa học, đủ chi tiết và có thể kiểm chứng hoặc tái lập.",
  "Judge the planned method, not experiments that have not been conducted.":
    "Đánh giá phương pháp dự kiến thay vì yêu cầu thực nghiệm chưa được triển khai.",
  "A reproducible search or a clearly explained narrative selection approach.":
    "Quy trình tìm kiếm có thể tái lập hoặc cách lựa chọn tài liệu tự sự được giải thích rõ ràng.",
  "Align research questions, methods, deliverables and reproducibility.":
    "Liên kết chặt chẽ câu hỏi nghiên cứu, phương pháp, sản phẩm đầu ra và khả năng tái lập.",
  "Data provenance, evaluation design, baselines and appropriate analysis.":
    "Nguồn gốc dữ liệu minh bạch, thiết kế đánh giá, đối chiếu và phân tích phù hợp.",
  "Feasible collection, access, ethics and planned validation.":
    "Kế hoạch thu thập, tiếp cận dữ liệu, đạo đức nghiên cứu và kiểm định khả thi.",
  "Quality and relevance of the reviewed sources, not laboratory experiments.":
    "Thẩm định chất lượng và mức độ liên quan của các tài liệu được tổng quan, không đòi hỏi thí nghiệm phòng lab.",
  "Validation appropriate to the method and current stage.":
    "Chiến lược kiểm chứng phù hợp với phương pháp và giai đoạn nghiên cứu hiện tại.",
  "Assess feasible access and evaluation plans, not completed experiments.":
    "Đánh giá kế hoạch tiếp cận tài nguyên và đánh giá khả thi, không yêu cầu thực nghiệm đã hoàn tất.",
  "Supported conclusions, uncertainty, limitations and interpretation.":
    "Kết luận có minh chứng, phân tích độ bất định, hạn chế và diễn giải hợp lý.",
  "Justified expectations, timeline, risks and limitations, not invented results.":
    "Kỳ vọng đóng góp có cơ sở, tiến độ, rủi ro và hạn chế rõ ràng, không đòi hỏi kết quả giả định.",
  "Critical synthesis, contrary evidence and limits of coverage.":
    "Tổng hợp có phê bình, phân tích bằng chứng trái chiều và giới hạn bao quát.",
  "Explain methodological assumptions and validity threats.":
    "Làm rõ các giả định phương pháp và các nguy cơ ảnh hưởng đến độ hiệu lực.",
  "Realistic milestones, dependencies and validity risks.":
    "Các mốc tiến độ thực tế, phụ thuộc triển khai và rủi ro về độ hiệu lực.",
  "Coherent structure, precise writing and readable figures.":
    "Bố cục mạch lạc, văn phong học thuật chính xác, bảng và hình rõ ràng dễ đọc.",
  "Traceable and accurate attribution to relevant sources.":
    "Trích dẫn nguồn chính xác, nhất quán và có thể truy xuất.",
};

/** Historical v1.0 generic Vietnamese level anchors — preserved strictly for v1.0 templates. */
const SYSTEM_LEVEL_DESC_V1_VI: Record<number, string> = {
  1: "Thiếu thông tin cốt lõi hoặc chưa có cơ sở khoa học thuyết phục; cần chỉnh sửa toàn diện.",
  2: "Còn hạn chế đáng kể về nội dung hoặc lập luận; cần bổ sung và điều chỉnh cụ thể.",
  3: "Đáp ứng các yêu cầu cơ bản nhưng vẫn còn một số điểm cần làm rõ thêm.",
  4: "Trình bày tốt, lập luận chặt chẽ và chỉ cần điều chỉnh nhỏ để hoàn thiện.",
  5: "Chính xác, chặt chẽ và có minh chứng rõ ràng, phù hợp chuẩn học thuật của loại tài liệu này.",
};

const SYSTEM_INTEGRITY_VI: Record<string, string> = {
  "Authorship and contribution declarations": "Quyền tác giả & đóng góp",
  "Source attribution and unsupported borrowing": "Ghi nhận nguồn",
  "Data fabrication or falsification concerns": "Tính trung thực dữ liệu",
  "Source credibility and citation accuracy": "Độ tin cậy tài liệu & trích dẫn",
  "Conflicts of interest disclosed": "Xung đột lợi ích",
  "Applicable AI-use disclosures": "Khai báo sử dụng AI",
  "Applicable research ethics approvals": "Đạo đức nghiên cứu",
  "Confidentiality and sensitive data handling": "Bảo mật & dữ liệu nhạy cảm",
};

const INTEGRITY_GUIDANCE_MAP: Record<
  string,
  {
    en: { summary: string; points: string[]; caution: string };
    vi: { summary: string; points: string[]; caution: string };
  }
> = {
  authorship: {
    vi: {
      summary: "Rà soát thông tin tác giả và ghi nhận đóng góp trong phạm vi tài liệu được chia sẻ.",
      points: [
        "Thông tin tác giả và khai báo vai trò đóng góp (nếu có).",
        "Những thiếu sót hoặc điểm chưa khớp có thể nhận biết.",
        "Các nội dung ghi nhận đang cần làm rõ trong phạm vi được phép xem.",
      ],
      caution: "Không kết luận quyền tác giả chỉ từ số hoạt động hoặc số từ LaTeX.",
    },
    en: {
      summary: "Review authorship listings and contribution declarations within the shared scope.",
      points: [
        "Author list and declared contributor roles (where provided).",
        "Observable omissions or inconsistencies across supplied records.",
        "Any open attribution questions visible within your review scope.",
      ],
      caution: "Do not determine authorship solely from activity counts or LaTeX word counts.",
    },
  },
  borrowing: {
    vi: {
      summary: "Rà soát việc ghi nhận nguồn gốc ý tưởng, trích dẫn trực tiếp và diễn giải.",
      points: [
        "Nội dung trích dẫn trực tiếp, diễn giải và ghi nhận nguồn liên quan.",
        "Các đoạn sử dụng ý tưởng, hình ảnh hoặc bảng biểu cần làm rõ nguồn.",
      ],
      caution: "Không kết luận đạo văn chỉ dựa trên điểm tương đồng văn bản.",
    },
    en: {
      summary: "Review attribution of ideas, direct quotations, and paraphrased material.",
      points: [
        "Proper attribution for direct quotes, paraphrases, figures, and borrowed methods.",
        "Passages where source attribution appears incomplete or unclear.",
      ],
      caution: "Do not conclude plagiarism solely from a text-similarity score.",
    },
  },
  data: {
    vi: {
      summary: "Rà soát tính nhất quán của dữ liệu và kết quả trong phạm vi thông tin được cung cấp.",
      points: [
        "Tính nhất quán giữa số liệu, bảng biểu và kết luận trình bày.",
        "Những bất thường có thể nhận biết hoặc nhu cầu đối chiếu minh chứng.",
      ],
      caution: "Không yêu cầu tự điều tra dữ liệu gốc và không kết luận bịa đặt chỉ vì chưa có quyền truy cập.",
    },
    en: {
      summary: "Check data consistency and alignment with reported results within supplied materials.",
      points: [
        "Internal consistency across figures, tables, and stated findings.",
        "Observable anomalies or claims needing supporting documentation.",
      ],
      caution: "You are not expected to audit raw data independently; lack of access is not evidence of fabrication.",
    },
  },
  sources: {
    vi: {
      summary: "Rà soát độ tin cậy và khả năng đối chiếu của danh mục tài liệu tham khảo.",
      points: [
        "Nguồn tham khảo có thể đối chiếu và thông tin thư mục rõ ràng.",
        "Mức độ phù hợp giữa nội dung trích dẫn và nguồn được dẫn chiếu.",
        "Các nguồn khó xác định hoặc có dấu hiệu cần kiểm tra lại.",
      ],
      caution: "Phân biệt độ tin cậy của nguồn với cách ghi nhận nguồn; có DOI không đồng nghĩa chất lượng cao.",
    },
    en: {
      summary: "Check verifiability, metadata quality, and appropriateness of cited sources.",
      points: [
        "Traceable bibliographic metadata and verifiable publications.",
        "Alignment between claims in text and the cited references.",
        "Unidentifiable, retracted, or questionable references requiring clarification.",
      ],
      caution: "Separate source credibility from attribution; having a DOI alone does not guarantee quality.",
    },
  },
  conflicts: {
    vi: {
      summary: "Rà soát khai báo xung đột lợi ích và nguồn tài trợ của nhóm nghiên cứu.",
      points: [
        "Khai báo lợi ích tài chính, tổ chức hoặc quan hệ liên quan.",
        "Nguồn tài trợ và thông tin bắt buộc theo quy định của công trình.",
      ],
      caution: "Có xung đột lợi ích không đồng nghĩa với sai phạm. Xung đột lợi ích của chính người phản biện là trách nhiệm khai báo riêng.",
    },
    en: {
      summary: "Check funding disclosures and author conflict-of-interest statements.",
      points: [
        "Disclosed funding sources, institutional ties, or competing interests.",
        "Missing declarations required by applicable submission policy.",
      ],
      caution: "Having a conflict of interest is not misconduct. Your own reviewer COI disclosure is handled separately.",
    },
  },
  ai_disclosure: {
    vi: {
      summary: "Rà soát thông tin khai báo sử dụng công cụ AI theo chính sách áp dụng.",
      points: [
        "Tuyên bố sử dụng AI và phạm vi hỗ trợ (ngôn ngữ, mã nguồn, phân tích…).",
        "Các nội dung cần nhóm giải thích thêm về mức độ kiểm chứng của tác giả.",
      ],
      caution: "Không tự động coi việc sử dụng AI là vi phạm và không dùng điểm AI-detector làm bằng chứng duy nhất.",
    },
    en: {
      summary: "Check AI-assistance declarations against applicable disclosure guidelines.",
      points: [
        "Declared AI tools and scope of assistance (editing, translation, coding, analysis).",
        "Areas needing author clarification regarding human verification.",
      ],
      caution: "Using AI is not automatically misconduct; never rely on an AI-detector score as sole evidence.",
    },
  },
  ethics: {
    vi: {
      summary: "Rà soát yêu cầu đạo đức nghiên cứu phù hợp với bản chất công trình.",
      points: [
        "Công trình có liên quan con người, động vật hoặc dữ liệu nhạy cảm cần phê duyệt hay không.",
        "Thông tin chấp thuận đạo đức và sự đồng thuận tham gia (informed consent) khi áp dụng.",
      ],
      caution: "Không áp dụng máy móc cho nghiên cứu thuần lý thuyết/kỹ thuật và không coi chấp thuận của cố vấn là phê duyệt hội đồng đạo đức.",
    },
    en: {
      summary: "Check whether ethics approval or informed consent applies to this study type.",
      points: [
        "Whether human participants, animals, or regulated data require ethics oversight.",
        "Approval identifiers and informed consent details where applicable.",
      ],
      caution: "Do not apply human-subjects requirements mechanically; mentor approval is not ethics committee approval.",
    },
  },
  confidentiality: {
    vi: {
      summary: "Rà soát bảo mật thông tin cá nhân, dữ liệu nhạy cảm và quyền chia sẻ.",
      points: [
        "Nguy cơ lộ dữ liệu cá nhân định danh hoặc thông tin chưa được phép công bố.",
        "Ràng buộc chia sẻ từ đối tác, tổ chức hoặc quy định bảo mật dữ liệu.",
      ],
      caution: "Không yêu cầu công khai dữ liệu bị hạn chế vì lý do bảo mật hoặc đạo đức.",
    },
    en: {
      summary: "Review personal data protection, sensitive information, and sharing permissions.",
      points: [
        "Risks of exposing identifiable personal data or confidential institutional material.",
        "Declared sharing restrictions or third-party confidentiality obligations.",
      ],
      caution: "Never require public release of data restricted for privacy, legal, or ethical reasons.",
    },
  },
};

const SYSTEM_GUIDELINES_VI: Record<string, string> = {
  "LumiGap Scientific Manuscript Review Rubric v1.0": "Bộ tiêu chí đánh giá bản thảo khoa học LumiGap v1.0",
  "LumiGap Scientific Manuscript Review Rubric v2.0": "Bộ tiêu chí đánh giá bản thảo khoa học LumiGap v2.0",
  "No default scores. NOT_ASSESSED is not zero. Use N/A only where permitted.":
    "Không chấm điểm mặc định. Chưa đánh giá không phải điểm 0. Chỉ dùng N/A khi tiêu chí cho phép.",
  "Weighted average uses assessed applicable criteria; coverage is shown separately. No score threshold grants approval.":
    "Điểm trung bình trọng số chỉ tính trên các tiêu chí đã chấm; mức độ hoàn thành được hiển thị riêng. Không có ngưỡng điểm nào tự động chấp thuận bài.",
  "Explain the issue, why it matters, where it occurs and the requested improvement.":
    "Nêu rõ vấn đề, lý do quan trọng, vị trí trong bài và hướng cải thiện cụ thể.",
  "Integrity concerns need human review, never an AI-detector misconduct verdict.":
    "Các dấu hiệu liêm chính cần con người xem xét xác minh, không dùng kết luận tự động của AI làm phán quyết vi phạm.",
  "Internal readiness is not journal or conference acceptance.":
    "Đánh giá sẵn sàng nội bộ không đồng nghĩa với việc tạp chí hay hội nghị chấp nhận công bố.",
};

export interface SystemRubricContext {
  artifactType?: string | null;
  versionNumber?: number | null;
  guidelines?: readonly string[];
}

export function isLumiGapSystemRubric(guidelines?: readonly string[]): boolean {
  return Boolean(guidelines && SCIENTIFIC_REVIEW_POLICIES.some(policy => guidelines.includes(policy)));
}

export function isSystemRubricV2(context?: SystemRubricContext): boolean {
  if (!context) return false;
  if (context.guidelines?.includes(SCIENTIFIC_REVIEW_POLICY_V2)) return true;
  if (typeof context.versionNumber === "number" && context.versionNumber >= 2) return true;
  return false;
}

export function localizeSystemCriterion(
  criterion: { key: string; title: string; description?: string | null },
  language: string,
  isSystemRubric: boolean,
  context?: SystemRubricContext,
): { title: string; description?: string } {
  const fallbackDescription = criterion.description ?? undefined;
  if (language !== "vi" || !isSystemRubric) {
    return { title: criterion.title, description: fallbackDescription };
  }

  const v2 = isSystemRubricV2(context);
  const v2Spec = findSystemRubricV2Criterion(criterion, context?.artifactType);

  if (v2 && v2Spec) {
    return {
      title: v2Spec.title.vi,
      description: v2Spec.description.vi,
    };
  }

  const byTitle = SYSTEM_TITLE_VI[criterion.title];
  const byDesc = fallbackDescription ? SYSTEM_DESC_V1_VI[fallbackDescription] : undefined;
  return {
    title: byTitle ?? v2Spec?.title.vi ?? criterion.title,
    description: byDesc ?? v2Spec?.description.vi ?? fallbackDescription,
  };
}

export function localizeSystemLevelDescription(
  level: { score: number; description?: string | null },
  language: string,
  isSystemRubric: boolean,
  options?: {
    criterionKey?: string;
    criterionTitle?: string | null;
    artifactType?: string | null;
    versionNumber?: number | null;
    guidelines?: readonly string[];
  },
): string | undefined {
  const fallback = level.description ?? undefined;
  if (!isSystemRubric) return fallback;

  // English uses the exact versioned descriptor stored on the template version.
  if (language !== "vi") return fallback;

  // For v2.0 templates, resolve the criterion-specific and artifact-specific Vietnamese descriptor.
  const v2 = isSystemRubricV2(options);
  if (v2 && options?.criterionKey) {
    const spec = findSystemRubricV2Criterion(
      { key: options.criterionKey, title: options.criterionTitle },
      options.artifactType,
    );
    const scoreKey = level.score as SystemRubricScore;
    if (spec?.levels[scoreKey]?.vi) {
      return spec.levels[scoreKey].vi;
    }
  }

  // Historical v1.0 templates keep their exact v1.0 anchor text so completed reviews are never re-interpreted.
  return SYSTEM_LEVEL_DESC_V1_VI[level.score] ?? fallback;
}

export function localizeIntegrityTitle(title: string, language: string): string {
  if (language !== "vi") return title;
  return SYSTEM_INTEGRITY_VI[title] ?? title;
}

export function localizeIntegrityGuidance(
  key: string,
  language: string,
): { summary: string; points: string[]; caution: string } | undefined {
  const entry = INTEGRITY_GUIDANCE_MAP[key];
  if (!entry) return undefined;
  return language === "vi" ? entry.vi : entry.en;
}

export function localizeSystemGuideline(guideline: string, language: string): string {
  if (language !== "vi") return guideline;
  return SYSTEM_GUIDELINES_VI[guideline] ?? guideline;
}
