import 'package:flutter_mobile/features/quality/data/quality_models.dart';

/// Offline copy of the paper rubric (packages/shared-types/src/quality-rubric.ts, quality-v3)
/// so the scoring scale can be read before the first evaluation. Once an evaluation exists the
/// rubric inside it (which carries the exact version used) is shown instead.
/// TODO(quality): replace with a rubric endpoint if the backend adds one.
QualityRubric paperRubricFor(String language) {
  final vi = language == 'vi';
  String p(List<String> w) => w[vi ? 1 : 0];

  Map<String, dynamic> criterion(String id, List<String> title, List<String> question, List<List<String>> anchors) => {
        'id': id,
        'title': p(title),
        'question': p(question),
        'anchors': [
          for (var i = 0; i < anchors.length; i++) {'score': i + 1, 'description': p(anchors[i])},
        ],
      };

  return QualityRubric.fromJson({
    'version': 'quality-v3',
    'targetKind': 'paper',
    'scope': p([
      'Title and abstract only; the full paper and underlying data were not reviewed.',
      'Chỉ đọc tiêu đề và tóm tắt; chưa xem toàn văn và dữ liệu gốc.',
    ]),
    'criteria': [
      criterion(
        'relevance',
        ['Clarity of the research problem', 'Độ rõ của vấn đề nghiên cứu'],
        [
          'Can a reader identify the problem, scope and intended contribution from the title and abstract?',
          'Từ tiêu đề và tóm tắt, người đọc có xác định được vấn đề, phạm vi và đóng góp dự kiến không?',
        ],
        [
          ['A problem is stated but remains contradictory or unidentifiable.', 'Có nêu vấn đề nhưng mâu thuẫn hoặc không xác định được vấn đề cụ thể.'],
          ['Only a broad topic is given; the research focus is unclear.', 'Chỉ nêu chủ đề rộng, trọng tâm nghiên cứu chưa rõ.'],
          ['The problem and broad scope are identifiable.', 'Xác định được vấn đề và phạm vi cơ bản.'],
          ['The problem, context and intended contribution are explicit.', 'Vấn đề, bối cảnh và đóng góp dự kiến được nêu rõ.'],
          ['A precise problem, justified context and bounded contribution are connected clearly.', 'Vấn đề cụ thể, bối cảnh có lý do và đóng góp có giới hạn được liên kết rõ ràng.'],
        ],
      ),
      criterion(
        'groundedness',
        ['Support reported for the claims', 'Căn cứ được trình bày cho kết luận'],
        [
          'Does the abstract connect its claims to a stated method, data or observations and results?',
          'Tóm tắt có nối các kết luận với phương pháp, dữ liệu hoặc quan sát và kết quả được trình bày không?',
        ],
        [
          ['The abstract makes clear claims without describing any supporting work.', 'Tóm tắt đưa ra kết luận rõ nhưng không mô tả công việc làm căn cứ.'],
          ['A method is named, but its connection to results is unclear.', 'Có tên phương pháp nhưng chưa rõ liên hệ với kết quả.'],
          ['A method and a relevant result or observation support the main claim.', 'Có phương pháp và kết quả hoặc quan sát liên quan làm căn cứ cho kết luận chính.'],
          ['The design, data or observations and results are explicitly connected.', 'Thiết kế, dữ liệu hoặc quan sát và kết quả được liên kết cụ thể.'],
          ['Specific results, their methodological basis and the limits of the claim are reported.', 'Trình bày kết quả cụ thể, cơ sở phương pháp và giới hạn của kết luận.'],
        ],
      ),
      criterion(
        'completeness',
        ['Completeness of the abstract', 'Mức đầy đủ của tóm tắt'],
        [
          'Does the abstract give enough information about the problem, approach, findings and boundaries to guide further reading?',
          'Tóm tắt có đủ thông tin về vấn đề, cách làm, phát hiện và giới hạn để định hướng đọc tiếp không?',
        ],
        [
          ['Most essential elements are absent from an otherwise readable abstract.', 'Tóm tắt đọc được nhưng thiếu hầu hết thành phần thiết yếu.'],
          ['Only one or two of problem, approach and findings are described.', 'Chỉ mô tả một hoặc hai thành phần trong vấn đề, cách làm và phát hiện.'],
          ['Problem, approach and main findings are present.', 'Có vấn đề, cách làm và phát hiện chính.'],
          ['The contribution and relevant study context are also clear.', 'Đóng góp và bối cảnh nghiên cứu liên quan cũng rõ ràng.'],
          ['The abstract gives a balanced account of contribution, findings and limits relevant to reuse.', 'Tóm tắt cân đối giữa đóng góp, phát hiện và giới hạn cần biết khi tham khảo.'],
        ],
      ),
    ],
    'limitations': [
      p(['AI guidance can be wrong. Check the original sources before making research decisions.', 'AI có thể nhận xét sai. Cần kiểm tra tài liệu gốc trước khi quyết định hướng nghiên cứu.']),
      p([
        'Quotes are checked against the supplied text; their presence does not prove scientific validity or replication.',
        'Trích dẫn được đối chiếu với văn bản đã cung cấp; việc có trích dẫn không chứng minh tính đúng đắn khoa học hay khả năng tái lập.',
      ]),
    ],
  });
}
