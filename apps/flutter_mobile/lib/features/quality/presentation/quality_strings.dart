import 'dart:ui' as ui;

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The app has no localization framework yet, so the quality feature carries its own
/// vi/en pairs. The language follows the device locale (Vietnamese -> "vi", else "en")
/// and is also what is sent to the backend as the evaluation language.
final qualityLanguageProvider = Provider<String>((ref) {
  return ui.PlatformDispatcher.instance.locale.languageCode == 'vi' ? 'vi' : 'en';
});

final qualityStringsProvider = Provider<Qs>((ref) => Qs(ref.watch(qualityLanguageProvider)));

class Qs {
  const Qs(this.language);

  final String language;

  bool get vi => language == 'vi';

  String t(String en, String viText) => vi ? viText : en;

  String get insufficient => t('Insufficient evidence', 'Chưa đủ căn cứ');
  String get notStated => t('Not stated in abstract', 'Không nêu trong tóm tắt');
  String get anonymous => t('Anonymous', 'Ẩn danh');
  String get title => t('AI quality review', 'Đánh giá chất lượng bằng AI');
  String get modeReference => t('Reference reading', 'Đọc tham khảo');
  String get modeProject => t('For my project', 'Theo dự án');
  String get evaluate => t('Evaluate', 'Đánh giá');
  String get reEvaluate => t('Re-evaluate', 'Đánh giá lại');
  String get viewRubric => t('View scoring rubric', 'Xem thang đánh giá');
  String get viewDetail => t('View detailed assessment', 'Xem chi tiết đánh giá');
  String get running => t('Evaluating… this can take a minute', 'Đang đánh giá… có thể mất khoảng một phút');
  String get evaluatePrompt => t(
        'Run an AI evaluation to see what this paper is good for, with quotes from the abstract.',
        'Chạy đánh giá AI để biết bài này dùng được vào việc gì, kèm trích dẫn từ tóm tắt.',
      );
  String get outdatedNotice => t(
        'This evaluation is out of date. Re-evaluate to refresh it.',
        'Kết quả này đã cũ. Hãy đánh giá lại để cập nhật.',
      );
  String get legacyNotice => t(
        'This is an older result without a reading card. Re-evaluate to get quotes and reading guidance.',
        'Đây là kết quả cũ, chưa có thẻ đọc. Hãy đánh giá lại để có trích dẫn và hướng dẫn đọc.',
      );
  String get readingCard => t('Reading card', 'Thẻ đọc nhanh');
  String get studyDesign => t('Study design', 'Thiết kế nghiên cứu');
  String get sampleOrData => t('Sample / data', 'Mẫu / dữ liệu');
  String get setting => t('Setting', 'Bối cảnh');
  String get measures => t('Measures', 'Thước đo');
  String get keyResults => t('Key results', 'Kết quả chính');
  String get statedLimitations => t('Limitations stated by the authors', 'Hạn chế do tác giả nêu');
  String get readThisTo => t('Read this paper to…', 'Đọc bài này để…');
  String get audience => t('Suited for', 'Phù hợp với');
  String get caution => t('Be careful when citing', 'Lưu ý khi trích dẫn');
  String get criteria => t('What the abstract lets you judge', 'Những gì tóm tắt cho phép đánh giá');
  String get firstAction => t('Suggested next step', 'Bước tiếp theo gợi ý');
  String get question => t('Question this criterion asks', 'Câu hỏi của tiêu chí');
  String get score => t('Score', 'Điểm');
  String get matchedAnchor => t('Why this score', 'Vì sao có điểm này');
  String get finding => t('Finding', 'Nhận định');
  String get quotes => t('Quoted evidence', 'Trích dẫn làm căn cứ');
  String get missing => t('Missing information', 'Thông tin còn thiếu');
  String get howToUse => t('How to use this', 'Cách dùng kết quả này');
  String get actions => t('Suggested actions', 'Hành động gợi ý');
  String get why => t('Why', 'Lý do');
  String get expected => t('Expected output', 'Kết quả mong đợi');
  String get researchQuestions => t('Research questions', 'Câu hỏi nghiên cứu');
  String get limitations => t('Limitations', 'Giới hạn');
  String get sources => t('Sources read', 'Nguồn đã đọc');
  String get about => t('About this evaluation', 'Về lần đánh giá này');
  String get model => t('Model', 'Mô hình');
  String get date => t('Evaluated on', 'Ngày đánh giá');
  String get rubricVersion => t('Rubric version', 'Phiên bản thang đánh giá');
  String get scope => t('Scope', 'Phạm vi');
  String get rubric => t('Scoring rubric', 'Thang đánh giá');
  String get detailTitle => t('Assessment details', 'Chi tiết đánh giá');
  String get overall => t('Overall', 'Tổng thể');
  String get community => t('Community rating', 'Đánh giá của cộng đồng');
  String get ratingsLine => t('ratings', 'lượt đánh giá');
  String get writeReview => t('Write a short review', 'Viết nhận xét ngắn');
  String get submitReview => t('Submit review', 'Gửi đánh giá');
  String get retry => t('Try again', 'Thử lại');
  String get failed => t('AI evaluation failed. Please try again.', 'Đánh giá AI thất bại. Vui lòng thử lại.');
  String get timedOut => t(
        'The assessment is still running. Reopen this page later to see the result.',
        'Đánh giá vẫn đang chạy. Hãy mở lại trang sau để xem kết quả.',
      );

  String get unverifiedQuote => t('Quote could not be verified', 'Chưa xác minh được trích dẫn');
  String get partialYearNote => t('is a partial year (still in progress)', 'là năm chưa trọn vẹn (đang diễn ra)');

  /// Localized message for a QualityErrorCode; null/unknown codes fall back to [failed].
  String errorMessage(String? code) => switch (code) {
        'AI_EVALUATION_BUSY' => t('The AI service is busy right now. Please try again in a few minutes.', 'Dịch vụ AI đang quá tải. Vui lòng thử lại sau vài phút.'),
        'AI_EVALUATION_INVALID_OUTPUT' => t('The AI returned an unusable answer. Please try again.', 'AI trả về kết quả không dùng được. Vui lòng thử lại.'),
        'AI_EVALUATION_QUOTA' => t('The AI quota is used up. Try again later or check your AI connection.', 'Hạn mức AI đã hết. Hãy thử lại sau hoặc kiểm tra kết nối AI của bạn.'),
        'AI_EVALUATION_UNAVAILABLE' => t('AI evaluation is temporarily unavailable. Please try again.', 'Đánh giá AI tạm thời không khả dụng. Vui lòng thử lại.'),
        _ => failed,
      };

  // Project mode
  String get pickProject => t('Choose a project', 'Chọn dự án');
  String get noProjects => t(
        'Project mode compares this paper with your own research plan. You are not in any project yet.',
        'Chế độ theo dự án so sánh bài này với kế hoạch nghiên cứu của bạn. Bạn chưa thuộc dự án nào.',
      );
  String get createProject => t('Create a project', 'Tạo dự án');
  String get projectPrompt => t(
        'Evaluate how this paper serves the plan of the selected project.',
        'Đánh giá bài này phục vụ kế hoạch của dự án đã chọn như thế nào.',
      );
  String get planItemsHelped => t('Plan items this paper helps with', 'Mục trong kế hoạch bài này hỗ trợ');
  String get reusable => t('Reusable methods and data', 'Phương pháp và dữ liệu có thể tái sử dụng');
  String get tensions => t('Tensions with your plan', 'Điểm có thể xung đột với kế hoạch');
  String get screening => t('Screening suggestion', 'Gợi ý sàng lọc');
  String get yourCriteria => t('Your criteria', 'Tiêu chí của dự án');
  String get addToProject => t('Add to project', 'Thêm vào dự án');
  String get addedToProject => t('Added to the project.', 'Đã thêm vào dự án.');
  String get inProject => t('Already in this project', 'Đã có trong dự án');

  // Reading context
  String get trendContext => t('Where this paper sits', 'Bài này nằm ở đâu trong xu hướng');
  String get readNext => t('Read next', 'Đọc tiếp');
  String get totalPapers => t('Papers', 'Số bài');
  String get growth => t('Growth', 'Tăng trưởng');
  String get cagr3y => t('3-year CAGR', 'CAGR 3 năm');
  String get momentum => t('Momentum', 'Đà tăng');
  String get thisPaper => t('This paper', 'Bài này');

  String criterionTitle(String id) => switch (id) {
        'relevance' => t('Relevance', 'Mức liên quan'),
        'groundedness' => t('Groundedness', 'Mức có căn cứ'),
        'completeness' => t('Completeness', 'Mức đầy đủ'),
        _ => id,
      };

  String purpose(String key) => switch (key) {
        'overview' => t('Get an overview', 'Nắm tổng quan'),
        'method' => t('Learn the method', 'Học phương pháp'),
        'data' => t('Find data', 'Tìm dữ liệu'),
        'results' => t('See the results', 'Xem kết quả'),
        'counterpoint' => t('Find a counterpoint', 'Tìm quan điểm đối chiếu'),
        'background' => t('Build background', 'Xây nền tảng'),
        _ => key,
      };

  String audienceLabel(String key) => switch (key) {
        'newcomer' => t('Newcomers', 'Người mới bắt đầu'),
        'intermediate' => t('Intermediate readers', 'Người đã có nền tảng'),
        'specialist' => t('Specialists', 'Chuyên gia'),
        _ => key,
      };

  String verdict(String key) => switch (key) {
        'core' => t('Core', 'Cốt lõi'),
        'supporting' => t('Supporting', 'Hỗ trợ'),
        'background' => t('Background', 'Nền tảng'),
        'not_relevant' => t('Not relevant', 'Không liên quan'),
        _ => key,
      };

  String suggestion(String key) => switch (key) {
        'include' => t('Include', 'Nên đưa vào'),
        'exclude' => t('Exclude', 'Nên loại'),
        _ => t('Undecided', 'Chưa quyết định'),
      };

  String reusableKind(String key) => switch (key) {
        'method' => t('Method', 'Phương pháp'),
        'dataset' => t('Dataset', 'Bộ dữ liệu'),
        'measure' => t('Measure', 'Thước đo'),
        'framework' => t('Framework', 'Khung lý thuyết'),
        _ => key,
      };

  String priority(String key) => switch (key) {
        'high' => t('High priority', 'Ưu tiên cao'),
        'low' => t('Low priority', 'Ưu tiên thấp'),
        _ => t('Medium priority', 'Ưu tiên vừa'),
      };

  String relatedReason(String key) => switch (key) {
        'same_topic_newer' => t('Newer, same topic', 'Cùng chủ đề, mới hơn'),
        'same_topic_most_cited' => t('Most cited, same topic', 'Cùng chủ đề, được trích dẫn nhiều'),
        _ => t('Similar content', 'Nội dung tương tự'),
      };
}
