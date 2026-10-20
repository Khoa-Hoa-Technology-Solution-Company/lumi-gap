import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_panel.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_reading_context_card.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_strings.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _rubric() => {
      'version': 'quality-v3',
      'targetKind': 'paper',
      'language': 'vi',
      'scope': 'Chỉ đọc tiêu đề và tóm tắt.',
      'criteria': [
        {
          'id': 'relevance',
          'title': 'Độ rõ của vấn đề nghiên cứu',
          'question': 'Vấn đề có rõ không?',
          'anchors': [
            for (var i = 1; i <= 5; i++) {'score': i, 'description': 'Mô tả mức $i'},
          ],
        },
        {
          'id': 'groundedness',
          'title': 'Căn cứ',
          'question': 'Có căn cứ không?',
          'anchors': [
            {'score': 1, 'description': 'Mức 1'},
          ],
        },
      ],
      'limitations': ['AI có thể sai.'],
    };

Map<String, dynamic> _evaluationJson({bool withFacts = true, String? freshness}) => {
      'targetKind': 'paper',
      'targetId': 'p1',
      'relevance': 4,
      'groundedness': null,
      'completeness': 3,
      'overall': null,
      'rationale': 'Tóm tắt ngắn.',
      'model': 'gemini-test',
      'createdAt': '2026-10-19T00:00:00.000Z',
      'freshness': ?freshness,
      'details': {
        'rubric': _rubric(),
        'summary': 'Bài khảo sát về học máy.',
        'criteria': [
          {
            'id': 'relevance',
            'score': 4,
            'status': 'assessed',
            'finding': 'Vấn đề được nêu rõ.',
            'evidence': [
              {'sourceId': 's1', 'quote': 'we study X'},
            ],
            'missingEvidence': ['Chưa nêu phạm vi'],
            'improvement': 'Đọc phần mở đầu.',
          },
          {
            'id': 'groundedness',
            'score': null,
            'status': 'insufficient_evidence',
            'finding': 'Không đủ thông tin.',
            'evidence': <dynamic>[],
            'missingEvidence': <dynamic>[],
            'improvement': '',
          },
        ],
        'actions': [
          {'criterionId': 'relevance', 'priority': 'high', 'action': 'Kiểm tra bộ dữ liệu', 'why': 'Vì cỡ mẫu', 'expectedOutcome': 'Bảng so sánh'},
        ],
        'researchQuestions': [
          {'criterionId': 'relevance', 'question': 'X có đúng ở nơi khác?', 'why': 'Tính tổng quát'},
        ],
        'limitations': ['Chỉ đọc tóm tắt'],
        'sources': [
          {'id': 's1', 'title': 'Paper One', 'kind': 'abstract', 'charactersRead': 100, 'truncated': false},
        ],
        if (withFacts)
          'facts': {
            'studyDesign': {
              'status': 'reported',
              'value': 'Khảo sát cắt ngang',
              'evidence': {'sourceId': 's1', 'quote': 'a cross-sectional survey'},
            },
            'sampleOrData': {'status': 'not_reported', 'value': null, 'evidence': null},
            'setting': {'status': 'not_reported', 'value': null, 'evidence': null},
            'measures': {'status': 'not_reported', 'value': null, 'evidence': null},
            'keyResults': <dynamic>[],
            'authorStatedLimitations': <dynamic>[],
          },
        if (withFacts)
          'guidance': {
            'purposes': [
              {'purpose': 'overview', 'explanation': 'Nắm bức tranh chung'},
            ],
            'audience': 'newcomer',
            'audienceReason': 'Ít thuật ngữ',
            'caution': 'Cỡ mẫu nhỏ',
          },
      },
    };

Map<String, dynamic> _view({Map<String, dynamic>? evaluation, Map<String, dynamic>? task, Map<String, dynamic>? project}) => {
      'evaluation': ?evaluation,
      'evaluationTask': ?task,
      'projectEvaluation': ?project,
      'ratingSummary': {'avg': 0, 'count': 0},
    };

Dio _fakeDio(Map<String, dynamic> Function(RequestOptions o) handler, {List<String>? log}) {
  final dio = Dio();
  dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
    log?.add('${o.method} ${o.path}');
    h.resolve(Response<dynamic>(requestOptions: o, statusCode: 200, data: {'success': true, 'data': handler(o)}));
  }));
  return dio;
}

Widget _host(Dio dio, Widget child, {List<ProjectView> projects = const []}) {
  return ProviderScope(
    overrides: [
      qualityApiProvider.overrideWithValue(QualityApi(dio, pollInterval: Duration.zero)),
      qualityLanguageProvider.overrideWithValue('vi'),
      projectsProvider.overrideWith((ref) async => projects),
      projectProvider.overrideWith((ref, id) async => ProjectView(id: id, title: 'My project')),
    ],
    child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child))),
  );
}

void _narrow(WidgetTester tester) {
  tester.view.physicalSize = const Size(320 * 2, 640 * 2);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

void _pixel6(WidgetTester tester) {
  tester.view.physicalSize = const Size(412 * 2.625, 892 * 2.625);
  tester.view.devicePixelRatio = 2.625;
  addTearDown(tester.view.reset);
}

void main() {
  group('models', () {
    test('parse details, not_reported facts and null scores', () {
      final e = QualityEvaluation.fromJson(_evaluationJson());
      final d = e.details!;
      expect(d.facts!.studyDesign.reported, isTrue);
      expect(d.facts!.sampleOrData.reported, isFalse);
      expect(d.criterion('groundedness')!.assessed, isFalse);
      expect(d.criterion('relevance')!.evidence.single.quote, 'we study X');
      expect(d.rubric.criterion('relevance')!.anchorFor(4)!.description, 'Mô tả mức 4');
      expect(d.sourceTitle('s1'), 'Paper One');
      expect(d.guidance!.audience, 'newcomer');
    });

    test('a reported fact without a value degrades to not reported; legacy has no details', () {
      expect(QualityFact.fromJson({'status': 'reported', 'value': null}).reported, isFalse);
      final legacy = QualityEvaluation.fromJson({'rationale': 'old', 'freshness': 'legacy'});
      expect(legacy.isLegacy, isTrue);
      expect(legacy.details, isNull);
    });

    test('task and reading context parse', () {
      final task = QualityEvaluationTask.tryParse({'status': 'running', 'jobId': 'j1'})!;
      expect(task.isPending, isTrue);
      final ctx = PaperReadingContext.fromJson({
        'paperId': 'p1',
        'trend': {'topic': 'AI', 'source': 'paper_topic', 'totalPapers': 10, 'yearlyBreakdown': [{'year': 2020, 'count': 3}], 'paperYear': 2020},
        'related': [
          {'id': 'p2', 'title': 'Next', 'similarity': 0.8, 'sharedTopics': ['AI'], 'reason': 'same_topic_newer'},
        ],
      });
      expect(ctx.trend!.yearly.single.count, 3);
      expect(ctx.related.single.reason, 'same_topic_newer');
    });
  });

  group('api', () {
    test('evaluate posts, polls the job until completed', () async {
      final log = <String>[];
      var polls = 0;
      final dio = _fakeDio(log: log, (o) {
        if (o.method == 'POST') return {'status': 'queued', 'jobId': 'j1'};
        polls++;
        return polls < 2 ? {'status': 'running', 'jobId': 'j1'} : {'status': 'completed', 'jobId': 'j1'};
      });
      final task = await QualityApi(dio, pollInterval: Duration.zero).evaluate('paper', 'p1', language: 'vi');
      expect(task.status, QualityTaskStatus.completed);
      expect(log.first, 'POST /quality/evaluate');
      expect(log.where((l) => l.contains('evaluation-jobs/j1')).length, 2);
    });

    test('a failed job throws with its message', () async {
      final dio = _fakeDio((o) => {'status': 'failed', 'error': 'boom'});
      expect(
        QualityApi(dio, pollInterval: Duration.zero).evaluate('paper', 'p1'),
        throwsA(isA<QualityTaskException>().having((e) => e.message, 'message', 'boom')),
      );
    });
  });

  group('panel', () {
    testWidgets('reference mode shows reading card, localized gaps and opens the detail page', (tester) async {
      _pixel6(tester);
      final dio = _fakeDio((o) => _view(evaluation: _evaluationJson()));
      await tester.pumpWidget(_host(dio, const QualityPanel(targetKind: 'paper', targetId: 'p1', showRatings: false)));
      await tester.pumpAndSettle();

      expect(find.text('Đọc tham khảo'), findsOneWidget);
      expect(find.text('Khảo sát cắt ngang'), findsOneWidget);
      expect(find.text('Không nêu trong tóm tắt'), findsWidgets);
      expect(find.text('Đọc bài này để…'), findsOneWidget);
      expect(find.text('Chưa đủ căn cứ'), findsOneWidget); // null criterion, never "0" or English
      expect(find.text('4/5'), findsOneWidget);
      expect(find.text('Insufficient evidence'), findsNothing);

      await tester.tap(find.text('Độ rõ của vấn đề nghiên cứu'));
      await tester.pumpAndSettle();
      expect(find.text('“we study X”'), findsOneWidget);
      expect(find.text('Paper One'), findsOneWidget);
      expect(find.textContaining('Mô tả mức 4'), findsOneWidget);
      expect(find.text('Chưa nêu phạm vi'), findsOneWidget);
      expect(find.text('Kiểm tra bộ dữ liệu'), findsOneWidget);
      await tester.scrollUntilVisible(find.textContaining('gemini-test'), 300);
      expect(find.textContaining('Mô hình: gemini-test'), findsOneWidget);
    });

    testWidgets('no evaluation shows the prompt and the rubric before evaluating', (tester) async {
      _pixel6(tester);
      final dio = _fakeDio((o) => _view());
      await tester.pumpWidget(_host(dio, const QualityPanel(targetKind: 'paper', targetId: 'p1', showRatings: false)));
      await tester.pumpAndSettle();
      expect(find.text('Đánh giá'), findsOneWidget);
      await tester.tap(find.text('Xem thang đánh giá'));
      await tester.pumpAndSettle();
      expect(find.text('Độ rõ của vấn đề nghiên cứu'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('quality-v3'), 300);
      expect(find.text('quality-v3'), findsOneWidget);
    });

    testWidgets('old result without facts asks to re-evaluate; outdated also does', (tester) async {
      _pixel6(tester);
      final dio = _fakeDio((o) => _view(evaluation: _evaluationJson(withFacts: false, freshness: 'outdated')));
      await tester.pumpWidget(_host(dio, const QualityPanel(targetKind: 'paper', targetId: 'p1', showRatings: false)));
      await tester.pumpAndSettle();
      expect(find.textContaining('đã cũ'), findsOneWidget);
      expect(find.text('Đánh giá lại'), findsOneWidget);
      expect(find.text('Thẻ đọc nhanh'), findsNothing);
    });

    testWidgets('a pending task from the view is resumed by polling', (tester) async {
      _pixel6(tester);
      final log = <String>[];
      final dio = _fakeDio(log: log, (o) {
        if (o.path.contains('evaluation-jobs')) return {'status': 'completed', 'jobId': 'j1'};
        final polled = log.any((l) => l.contains('evaluation-jobs'));
        return polled ? _view(evaluation: _evaluationJson()) : _view(task: {'status': 'running', 'jobId': 'j1'});
      });
      await tester.pumpWidget(_host(dio, const QualityPanel(targetKind: 'paper', targetId: 'p1', showRatings: false)));
      await tester.pumpAndSettle();
      expect(log.where((l) => l.startsWith('POST')), isEmpty);
      expect(log.any((l) => l.contains('evaluation-jobs/j1')), isTrue);
    });

    testWidgets('project mode with no projects explains and links to create one', (tester) async {
      _pixel6(tester);
      var created = false;
      final dio = _fakeDio((o) => _view());
      await tester.pumpWidget(_host(
        dio,
        QualityPanel(targetKind: 'paper', targetId: 'p1', showRatings: false, onCreateProject: () => created = true),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Theo dự án'));
      await tester.pumpAndSettle();
      expect(find.textContaining('chưa thuộc dự án nào'), findsOneWidget);
      await tester.tap(find.text('Tạo dự án'));
      expect(created, isTrue);
    });

    testWidgets('project mode renders verdict, plan links, tensions and screening', (tester) async {
      _pixel6(tester);
      final project = {
        'targetKind': 'paper',
        'targetId': 'p1',
        'projectId': 'pr1',
        'model': 'm',
        'evaluatedAt': '2026-10-19T00:00:00.000Z',
        'freshness': 'current',
        'assessment': {
          'version': 'quality-project-v1',
          'project': {'id': 'pr1', 'title': 'My project'},
          'verdict': 'core',
          'verdictReason': 'Trực tiếp trả lời câu hỏi 1',
          'questionLinks': [
            {
              'planItem': 'RQ1: ảnh hưởng của X?',
              'contribution': 'Cho số liệu',
              'evidence': [
                {'sourceId': 's1', 'quote': 'X raises Y'},
              ],
            },
          ],
          'reusable': [
            {'kind': 'method', 'description': 'Hồi quy đa biến', 'evidence': null},
          ],
          'tensions': [
            {'description': 'Mẫu khác bối cảnh', 'evidence': <dynamic>[]},
          ],
          'screening': {'suggestion': 'include', 'reason': 'Khớp tiêu chí', 'criteria': ['Peer-reviewed']},
          'actions': <dynamic>[],
          'limitations': <dynamic>[],
          'sources': [
            {'id': 's1', 'title': 'Paper One', 'kind': 'abstract', 'charactersRead': 1, 'truncated': false},
          ],
        },
      };
      final dio = _fakeDio((o) {
        if (o.path.startsWith('/projects/')) {
          return {'id': 'pr1', 'title': 'My project', 'papers': <dynamic>[]};
        }
        return _view(project: project);
      });
      await tester.pumpWidget(_host(
        dio,
        const QualityPanel(targetKind: 'paper', targetId: 'p1', showRatings: false),
        projects: const [ProjectView(id: 'pr1', title: 'My project')],
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Theo dự án'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('My project').last);
      await tester.pumpAndSettle();

      expect(find.text('Cốt lõi'), findsOneWidget);
      expect(find.text('RQ1: ảnh hưởng của X?'), findsOneWidget);
      expect(find.text('“X raises Y”'), findsOneWidget);
      expect(find.textContaining('Hồi quy đa biến'), findsOneWidget);
      expect(find.text('Mẫu khác bối cảnh'), findsOneWidget);
      expect(find.text('Nên đưa vào'), findsOneWidget);
      expect(find.text('• Peer-reviewed'), findsOneWidget);
      expect(find.text('Thêm vào dự án'), findsOneWidget);
    });

    testWidgets('report panel with legacy result has null-safe rows and no crash', (tester) async {
      _pixel6(tester);
      final dio = _fakeDio((o) => _view(evaluation: {'rationale': 'Cũ', 'freshness': 'legacy', 'overall': 3}));
      await tester.pumpWidget(_host(dio, const QualityPanel(targetKind: 'report', targetId: 'r1')));
      await tester.pumpAndSettle();
      expect(find.text('Cũ'), findsOneWidget);
      expect(find.text('Đánh giá lại'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('QA fixes', () {
    test('unverified fact keeps its value; error code and partialYear parse', () {
      final f = QualityFact.fromJson({'status': 'unverified', 'value': 'AMBOSS', 'evidence': null});
      expect(f.unverified, isTrue);
      expect(f.hasValue, isTrue);
      expect(f.reported, isFalse);
      expect(QualityFact.fromJson({'status': 'unverified', 'value': null}).hasValue, isFalse);
      final task = QualityEvaluationTask.tryParse({'status': 'failed', 'errorCode': 'AI_EVALUATION_BUSY'})!;
      expect(task.errorCode, 'AI_EVALUATION_BUSY');
      final ctx = PaperReadingContext.fromJson({
        'paperId': 'p',
        'trend': {'topic': 'T', 'source': 'requested', 'totalPapers': 1, 'cagr3yPct': null, 'yearlyBreakdown': <dynamic>[], 'partialYear': 2026},
      });
      expect(ctx.trend!.partialYear, 2026);
      expect(ctx.trend!.cagr3yPct, isNull);
    });

    test('HTTP error envelope code becomes the exception code', () async {
      final dio = Dio();
      dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
        h.reject(DioException(
          requestOptions: o,
          response: Response<dynamic>(requestOptions: o, statusCode: 503, data: {
            'success': false,
            'error': {'code': 'AI_EVALUATION_QUOTA', 'message': 'x'},
          }),
        ));
      }));
      expect(
        QualityApi(dio).evaluate('report', 'r1'),
        throwsA(isA<QualityTaskException>().having((e) => e.code, 'code', 'AI_EVALUATION_QUOTA')),
      );
      expect(const Qs('vi').errorMessage('AI_EVALUATION_QUOTA'), contains('Hạn mức'));
      expect(const Qs('vi').errorMessage(null), const Qs('vi').failed);
    });

    testWidgets('unverified fact shows value plus the muted note, never "not stated"; no overflow at 320dp', (tester) async {
      _narrow(tester);
      final json = _evaluationJson();
      ((json['details'] as Map)['facts'] as Map)['sampleOrData'] = {'status': 'unverified', 'value': 'AMBOSS, NBME', 'evidence': null};
      final dio = _fakeDio((o) => _view(evaluation: json));
      await tester.pumpWidget(_host(dio, const QualityPanel(targetKind: 'paper', targetId: 'p1')));
      await tester.pumpAndSettle();
      expect(find.text('AMBOSS, NBME'), findsOneWidget);
      expect(find.text('Chưa xác minh được trích dẫn'), findsOneWidget);
      expect(find.text('Đọc tham khảo'), findsOneWidget);
      expect(find.text('Theo dự án'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a failed job shows the localized message for its error code', (tester) async {
      _pixel6(tester);
      final dio = _fakeDio((o) {
        if (o.method == 'POST') return {'status': 'failed', 'errorCode': 'AI_EVALUATION_BUSY', 'error': 'English text'};
        return _view();
      });
      await tester.pumpWidget(_host(dio, const QualityPanel(targetKind: 'report', targetId: 'r1', showRatings: false)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Đánh giá'));
      await tester.pumpAndSettle();
      expect(find.textContaining('quá tải'), findsOneWidget);
      expect(find.textContaining('English text'), findsNothing);
    });

    testWidgets('reading context: partial-year note, CAGR hidden when null, 320dp', (tester) async {
      _narrow(tester);
      final dio = _fakeDio((o) => {
            'paperId': 'p1',
            'trend': {
              'topic': 'Machine learning',
              'source': 'requested',
              'totalPapers': 12,
              'growthRatePct': -3.2,
              'cagr3yPct': null,
              'momentum': null,
              'yearlyBreakdown': [
                {'year': 2024, 'count': 10},
                {'year': 2025, 'count': 20},
                {'year': 2026, 'count': 5},
              ],
              'paperYear': 2025,
              'partialYear': 2026,
            },
            'related': <dynamic>[],
          });
      await tester.pumpWidget(_host(dio, const QualityReadingContextCard(paperId: 'p1')));
      await tester.pumpAndSettle();
      expect(find.textContaining('2026 là năm chưa trọn vẹn'), findsOneWidget);
      expect(find.text('CAGR 3 năm'), findsNothing);
      expect(find.text('-3.2%'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('reading context card shows trend figures and read-next that navigates', (tester) async {
    _pixel6(tester);
    String? opened;
    final dio = _fakeDio((o) => {
          'paperId': 'p1',
          'requestedTopic': null,
          'trend': {
            'topic': 'Machine learning',
            'source': 'paper_topic',
            'totalPapers': 120,
            'growthRatePct': 12.5,
            'cagr3yPct': null,
            'momentum': null,
            'yearlyBreakdown': [
              {'year': 2019, 'count': 10},
              {'year': 2020, 'count': 20},
              {'year': 2021, 'count': 35},
            ],
            'paperYear': 2020,
          },
          'related': [
            {'id': 'p9', 'title': 'Newer paper', 'publicationYear': 2024, 'citationCount': 5, 'similarity': 0.9, 'sharedTopics': ['ML'], 'reason': 'same_topic_newer'},
          ],
          'computedAt': '2026-10-19T00:00:00.000Z',
        });
    await tester.pumpWidget(_host(dio, QualityReadingContextCard(paperId: 'p1', onOpenPaper: (id) => opened = id)));
    await tester.pumpAndSettle();
    expect(find.text('Machine learning'), findsOneWidget);
    expect(find.text('+12.5%'), findsOneWidget);
    expect(find.text('Đọc tiếp'), findsOneWidget);
    expect(find.textContaining('Cùng chủ đề, mới hơn'), findsOneWidget);
    await tester.tap(find.text('Newer paper'));
    expect(opened, 'p9');
  });
}
