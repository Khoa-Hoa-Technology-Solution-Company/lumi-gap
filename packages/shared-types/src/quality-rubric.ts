import type { QualityCriterion, QualityCriterionId, QualityLanguage, QualityRubric, QualityTargetKind } from "./quality.js";

/**
 * Change this version whenever the rubric, its score anchors or the assessment shape change.
 * v3: paper assessments add a reading card (facts) and reading guidance.
 */
export const QUALITY_RUBRIC_VERSION = "quality-v3";

/** Version of the project-mode assessment (QualityProjectAssessment). */
export const QUALITY_PROJECT_ASSESSMENT_VERSION = "quality-project-v1";

type Wording = [en: string, vi: string];
type CriterionDefinition = { id: QualityCriterionId; title: Wording; question: Wording; anchors: Wording[] };

const definitions: Record<QualityTargetKind, CriterionDefinition[]> = {
  paper: [
    {
      id: "relevance",
      title: ["Clarity of the research problem", "Độ rõ của vấn đề nghiên cứu"],
      question: ["Can a reader identify the problem, scope and intended contribution from the title and abstract?", "Từ tiêu đề và tóm tắt, người đọc có xác định được vấn đề, phạm vi và đóng góp dự kiến không?"],
      anchors: [
        ["A problem is stated but remains contradictory or unidentifiable.", "Có nêu vấn đề nhưng mâu thuẫn hoặc không xác định được vấn đề cụ thể."],
        ["Only a broad topic is given; the research focus is unclear.", "Chỉ nêu chủ đề rộng, trọng tâm nghiên cứu chưa rõ."],
        ["The problem and broad scope are identifiable.", "Xác định được vấn đề và phạm vi cơ bản."],
        ["The problem, context and intended contribution are explicit.", "Vấn đề, bối cảnh và đóng góp dự kiến được nêu rõ."],
        ["A precise problem, justified context and bounded contribution are connected clearly.", "Vấn đề cụ thể, bối cảnh có lý do và đóng góp có giới hạn được liên kết rõ ràng."],
      ],
    },
    {
      id: "groundedness",
      title: ["Support reported for the claims", "Căn cứ được trình bày cho kết luận"],
      question: ["Does the abstract connect its claims to a stated method, data or observations and results?", "Tóm tắt có nối các kết luận với phương pháp, dữ liệu hoặc quan sát và kết quả được trình bày không?"],
      anchors: [
        ["The abstract makes clear claims without describing any supporting work.", "Tóm tắt đưa ra kết luận rõ nhưng không mô tả công việc làm căn cứ."],
        ["A method is named, but its connection to results is unclear.", "Có tên phương pháp nhưng chưa rõ liên hệ với kết quả."],
        ["A method and a relevant result or observation support the main claim.", "Có phương pháp và kết quả hoặc quan sát liên quan làm căn cứ cho kết luận chính."],
        ["The design, data or observations and results are explicitly connected.", "Thiết kế, dữ liệu hoặc quan sát và kết quả được liên kết cụ thể."],
        ["Specific results, their methodological basis and the limits of the claim are reported.", "Trình bày kết quả cụ thể, cơ sở phương pháp và giới hạn của kết luận."],
      ],
    },
    {
      id: "completeness",
      title: ["Completeness of the abstract", "Mức đầy đủ của tóm tắt"],
      question: ["Does the abstract give enough information about the problem, approach, findings and boundaries to guide further reading?", "Tóm tắt có đủ thông tin về vấn đề, cách làm, phát hiện và giới hạn để định hướng đọc tiếp không?"],
      anchors: [
        ["Most essential elements are absent from an otherwise readable abstract.", "Tóm tắt đọc được nhưng thiếu hầu hết thành phần thiết yếu."],
        ["Only one or two of problem, approach and findings are described.", "Chỉ mô tả một hoặc hai thành phần trong vấn đề, cách làm và phát hiện."],
        ["Problem, approach and main findings are present.", "Có vấn đề, cách làm và phát hiện chính."],
        ["The contribution and relevant study context are also clear.", "Đóng góp và bối cảnh nghiên cứu liên quan cũng rõ ràng."],
        ["The abstract gives a balanced account of contribution, findings and limits relevant to reuse.", "Tóm tắt cân đối giữa đóng góp, phát hiện và giới hạn cần biết khi tham khảo."],
      ],
    },
  ],
  report: [
    {
      id: "relevance",
      title: ["Fit to the research question", "Mức đáp ứng câu hỏi nghiên cứu"],
      question: ["Does the report answer the requested question within its stated scope?", "Báo cáo có trả lời câu hỏi đã yêu cầu trong phạm vi đã nêu không?"],
      anchors: [
        ["The report addresses a different question.", "Báo cáo trả lời một câu hỏi khác."],
        ["It discusses the topic but misses the central question.", "Có bàn về chủ đề nhưng bỏ lỡ câu hỏi trọng tâm."],
        ["It answers the main question with some drift or unclear scope.", "Trả lời được câu hỏi chính nhưng còn lệch trọng tâm hoặc phạm vi chưa rõ."],
        ["It answers the question directly with a consistent scope.", "Trả lời trực tiếp và giữ phạm vi nhất quán."],
        ["It answers all material parts and explicitly bounds the answer.", "Trả lời các phần quan trọng và nêu rõ giới hạn của câu trả lời."],
      ],
    },
    {
      id: "groundedness",
      title: ["Support from the linked literature", "Căn cứ từ tài liệu được liên kết"],
      question: ["Can the report's key claims be checked against the supplied paper abstracts?", "Các kết luận chính của báo cáo có đối chiếu được với tóm tắt các bài báo đã cung cấp không?"],
      anchors: [
        ["Key claims conflict with the supplied evidence or attribute findings incorrectly.", "Kết luận chính trái với căn cứ hoặc gán sai phát hiện cho tài liệu."],
        ["Several material claims are unsupported or overstate the abstracts.", "Nhiều kết luận quan trọng chưa có căn cứ hoặc vượt quá nội dung tóm tắt."],
        ["The central claim is supported, with some unchecked inferences.", "Kết luận trung tâm có căn cứ, còn một số suy luận chưa kiểm chứng."],
        ["Key claims align with the evidence and inference is identified.", "Kết luận chính khớp căn cứ và phần suy luận được nhận diện."],
        ["Specific claims are traceable and qualifications or disagreements are represented faithfully.", "Truy được căn cứ cho kết luận cụ thể và phản ánh đúng điều kiện áp dụng hoặc bất đồng."],
      ],
    },
    {
      id: "completeness",
      title: ["Coverage and synthesis", "Độ bao quát và tổng hợp"],
      question: ["Does the report compare the relevant supplied findings and discuss omissions or limitations?", "Báo cáo có so sánh các phát hiện liên quan đã cung cấp và bàn về phần thiếu hoặc giới hạn không?"],
      anchors: [
        ["It omits most findings needed to address the question.", "Bỏ sót hầu hết phát hiện cần để trả lời câu hỏi."],
        ["It lists a few findings without meaningful synthesis.", "Liệt kê vài phát hiện nhưng chưa tổng hợp có ý nghĩa."],
        ["It summarizes the main relevant findings.", "Tóm lược được những phát hiện liên quan chính."],
        ["It compares approaches or results and identifies important limitations.", "So sánh cách tiếp cận hoặc kết quả và chỉ ra giới hạn quan trọng."],
        ["It synthesizes convergence, disagreement, limits and implications within the supplied corpus.", "Tổng hợp điểm đồng thuận, bất đồng, giới hạn và hàm ý trong tập tài liệu đã cung cấp."],
      ],
    },
  ],
  gap: [
    {
      id: "relevance",
      title: ["Specificity of the research gap", "Độ cụ thể của khoảng trống nghiên cứu"],
      question: ["Is the proposed gap a bounded unresolved question with a reason to investigate it?", "Khoảng trống có phải là câu hỏi chưa được giải quyết, có phạm vi và lý do đáng nghiên cứu không?"],
      anchors: [
        ["The proposal is contradictory or does not identify an unresolved question.", "Đề xuất mâu thuẫn hoặc không xác định câu hỏi chưa được giải quyết."],
        ["It names a broad topic with a vague claim of missing research.", "Chỉ nêu chủ đề rộng và khẳng định mơ hồ rằng còn thiếu nghiên cứu."],
        ["It identifies an unresolved issue and a basic scope.", "Xác định được vấn đề chưa giải quyết và phạm vi cơ bản."],
        ["The unresolved issue, context and research value are explicit.", "Vấn đề chưa giải quyết, bối cảnh và giá trị nghiên cứu được nêu rõ."],
        ["A bounded, investigable question is linked to a specific limitation and meaningful contribution.", "Câu hỏi có giới hạn, có thể nghiên cứu, gắn với thiếu sót cụ thể và đóng góp có ý nghĩa."],
      ],
    },
    {
      id: "groundedness",
      title: ["Evidence for the proposed gap", "Căn cứ cho khoảng trống đề xuất"],
      question: ["Do the supplied abstracts support the claimed limitation, without implying a complete novelty search?", "Các tóm tắt đã cung cấp có hỗ trợ thiếu sót được nêu, trong phạm vi tập tài liệu này không?"],
      anchors: [
        ["The claimed gap conflicts with findings in the supplied abstracts.", "Khoảng trống được nêu trái với phát hiện trong tóm tắt đã cung cấp."],
        ["The claim of a gap has little connection to the supplied findings.", "Khẳng định khoảng trống ít liên hệ với phát hiện đã cung cấp."],
        ["A relevant limitation is supported, but the inference remains tentative.", "Có căn cứ cho một giới hạn liên quan nhưng suy luận còn cần kiểm tra."],
        ["The gap is explicitly connected to supported limitations or comparisons.", "Khoảng trống được nối cụ thể với giới hạn hoặc so sánh có căn cứ."],
        ["Multiple relevant findings support a carefully bounded gap, with counterevidence considered.", "Nhiều phát hiện liên quan hỗ trợ khoảng trống có giới hạn rõ, có xét căn cứ trái chiều."],
      ],
    },
    {
      id: "completeness",
      title: ["Actionability and feasibility", "Khả năng triển khai và tính khả thi"],
      question: ["Does the proposal suggest a concrete research direction, data or approach and a way to judge progress?", "Đề xuất có hướng nghiên cứu cụ thể, dữ liệu hoặc cách tiếp cận và cách nhận biết tiến triển không?"],
      anchors: [
        ["No investigable direction can be identified.", "Không xác định được hướng có thể triển khai nghiên cứu."],
        ["An intention is stated without a concrete approach.", "Có ý định nghiên cứu nhưng chưa có cách tiếp cận cụ thể."],
        ["A research direction and a plausible approach are identifiable.", "Có hướng nghiên cứu và cách tiếp cận hợp lý có thể xác định được."],
        ["Data or study design and expected outcomes are described.", "Có mô tả dữ liệu hoặc thiết kế nghiên cứu và kết quả kỳ vọng."],
        ["The proposal bounds resources or scope, suggests an evaluation and acknowledges feasibility limits.", "Đề xuất giới hạn nguồn lực hoặc phạm vi, gợi ý cách đánh giá và nhận diện giới hạn khả thi."],
      ],
    },
  ],
};

export function getQualityRubric(targetKind: QualityTargetKind, language: QualityLanguage = "en"): QualityRubric {
  const pick = (value: Wording) => value[language === "vi" ? 1 : 0];
  const scopes: Record<QualityTargetKind, Wording> = {
    paper: ["Title and abstract only; the full paper and underlying data were not reviewed.", "Chỉ đọc tiêu đề và tóm tắt; chưa xem toàn văn và dữ liệu gốc."],
    report: ["Report text and the linked grounding paper abstracts supplied to this assessment.", "Nội dung báo cáo và tóm tắt các bài báo làm căn cứ đã được cung cấp cho lần đánh giá này."],
    gap: ["Gap description, rationale and the linked supporting paper abstracts supplied to this assessment.", "Mô tả, lý do của khoảng trống và tóm tắt các bài báo hỗ trợ đã được cung cấp cho lần đánh giá này."],
  };
  const criteria: QualityCriterion[] = definitions[targetKind].map((criterion) => ({
    id: criterion.id, title: pick(criterion.title), question: pick(criterion.question),
    anchors: criterion.anchors.map((description, index) => ({ score: index + 1, description: pick(description) })),
  }));
  return {
    version: QUALITY_RUBRIC_VERSION, targetKind, language, scope: pick(scopes[targetKind]), criteria,
    limitations: [
      pick(["AI guidance can be wrong. Check the original sources before making research decisions.", "AI có thể nhận xét sai. Cần kiểm tra tài liệu gốc trước khi quyết định hướng nghiên cứu."]),
      pick(["Quotes are checked against the supplied text; their presence does not prove scientific validity or replication.", "Trích dẫn được đối chiếu với văn bản đã cung cấp; việc có trích dẫn không chứng minh tính đúng đắn khoa học hay khả năng tái lập."]),
      ...(targetKind === "gap" ? [pick(["This is not an exhaustive literature search and cannot establish that a gap is novel.", "Đây chưa phải tìm kiếm toàn diện tài liệu và không đủ để khẳng định khoảng trống là mới."])] : []),
    ],
  };
}
