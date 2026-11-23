import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gaps_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

class _FakeGapsApi extends Fake implements GapsApi {
  final List<GapsListParams> listed = [];
  final List<String> analyzed = [];
  final List<(String, String)> patched = [];
  String jobStatus = 'running';
  Object? patchError;

  static const gap = ResearchGapItem(
    id: 'g1',
    topic: 'federated learning',
    title: 'Privacy budget in federated learning',
    description: 'Few studies compare privacy budgets.',
    rationale: '',
    confidence: 0.82,
    source: 'standalone',
    status: 'active',
    evidenceCount: 3,
    gapConfidence: 'MODERATE',
    evidenceConfidence: 0.82,
  );

  /// With [total] above 1 the list is served page by page, titled
  /// "Gap 1".."Gap n". [overlap] shifts later pages back by that many, as a
  /// list that changed between two page requests does.
  int total = 1;
  int overlap = 0;

  /// The total the server reports, when it says more than it has.
  int? claimedTotal;

  @override
  Future<ListGapsResponse> list(GapsListParams params) async {
    listed.add(params);
    if (total == 1) return const ListGapsResponse(data: [gap], total: 1);
    final start = ((params.page - 1) * params.pageSize - overlap * (params.page - 1))
        .clamp(0, total);
    final end = (start + params.pageSize).clamp(0, total);
    return ListGapsResponse(
      total: claimedTotal ?? total,
      data: [
        for (var i = start; i < end; i++)
          ResearchGapItem(
            id: 'g${i + 1}',
            topic: 'federated learning',
            title: 'Gap ${i + 1}',
            description: '',
            rationale: '',
            confidence: 0.5,
            source: 'standalone',
            status: 'active',
          ),
      ],
    );
  }

  @override
  Future<String> analyze(
    String topic, {
    String? projectId,
    int? yearFrom,
    int? yearTo,
  }) async {
    analyzed.add(topic);
    return 'job-1';
  }

  @override
  Future<GapAnalysisResult> status(String id) async =>
      GapAnalysisResult(id: id, topic: 't', status: jobStatus);

  @override
  Future<void> patchStatus(String id, String status) async {
    patched.add((id, status));
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (patchError != null) throw patchError!;
  }
}

Future<_FakeGapsApi> _pump(
  WidgetTester tester, {
  String? initialTopic,
  int total = 1,
  int overlap = 0,
  int? claimedTotal,
}) async {
  tester.view
    ..physicalSize = const Size(412, 2000)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => GapsScreen(initialTopic: initialTopic),
      ),
    ],
  );
  addTearDown(router.dispose);
  final api = _FakeGapsApi()
    ..total = total
    ..overlap = overlap
    ..claimedTotal = claimedTotal;
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [gapsApiProvider.overrideWithValue(api)],
      child: MaterialApp.router(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

void main() {
  test('topic rules are the API rules', () {
    expect(gapTopicError('ab'), isNotNull);
    expect(gapTopicError(' abc '), isNull);
    expect(gapTopicError('x' * 200), isNull);
    expect(gapTopicError('x' * 201), isNotNull);
  });

  testWidgets('sorting is asked of the server, newest first by default',
      (tester) async {
    final api = await _pump(tester);
    expect(api.listed.last.sortBy, 'newest');
  });

  testWidgets('typing in the filter sends one request once it settles',
      (tester) async {
    final api = await _pump(tester);
    final before = api.listed.length;
    final field = find.ancestor(
      of: find.text('Filter by topic'),
      matching: find.byType(TextField),
    );
    for (final text in ['p', 'pr', 'pri', 'priv']) {
      await tester.enterText(field, text);
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(api.listed.length, before, reason: 'nothing while typing');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(api.listed.length, before + 1);
    // A topic filter, as on the web, not free text over titles.
    expect(api.listed.last.topic, 'priv');
    expect(api.listed.last.search, isNull);
  });

  testWidgets('a topic from a link filters by topic', (tester) async {
    final api = await _pump(tester, initialTopic: 'federated learning');
    expect(api.listed.first.topic, 'federated learning');
    expect(api.listed.first.search, isNull);
  });

  Future<void> scrollToEnd(WidgetTester tester) async {
    for (var i = 0; i < 40; i++) {
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -3000));
      await tester.pumpAndSettle();
    }
  }

  testWidgets('scrolling down loads the next page once, until all are shown',
      (tester) async {
    final api = await _pump(tester, total: 45);
    expect(find.text('Gap 30'), findsOneWidget);
    expect(find.text('Gap 31'), findsNothing);
    await scrollToEnd(tester);
    expect(api.listed.where((p) => p.page == 2), hasLength(1));
    expect(api.listed.where((p) => p.page > 2), isEmpty);
    for (final n in [1, 30, 31, 45]) {
      expect(find.text('Gap $n'), findsOneWidget);
    }
    expect(find.text('45 research gaps found'), findsOneWidget);
  });

  testWidgets('a gap repeated on the next page is shown once',
      (tester) async {
    await _pump(tester, total: 45, overlap: 1);
    await scrollToEnd(tester);
    expect(find.text('Gap 30'), findsOneWidget);
    expect(find.text('Gap 45'), findsOneWidget);
  });

  testWidgets('a page with nothing new ends the loading, whatever the total '
      'says', (tester) async {
    final api = await _pump(tester, total: 30, claimedTotal: 100);
    await scrollToEnd(tester);
    // Page 2 comes back empty: asked once, and nothing after it.
    expect(api.listed.where((p) => p.page == 2), hasLength(1));
    expect(api.listed.where((p) => p.page > 2), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('changing a filter starts again from page 1', (tester) async {
    final api = await _pump(tester, total: 45);
    await scrollToEnd(tester);
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 100000));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Resolved'));
    await tester.pumpAndSettle();
    expect(api.listed.last.status, 'resolved');
    expect(api.listed.last.page, 1);
    expect(api.listed.where((p) => p.status == 'resolved' && p.page > 1), isEmpty);
  });

  test('gap confidence: the label always, a score only when there is one', () {
    ResearchGapItem parse(Map<String, dynamic> extra) => ResearchGapItem.fromJson({
          'id': 'g',
          'title': 't',
          ...extra,
        });
    // Missing or unknown level: the column default, LOW.
    expect(parse({}).gapConfidence, 'LOW');
    expect(parse({'gapConfidence': 'odd'}).gapConfidence, 'LOW');
    expect(parse({'gapConfidence': 'high'}).gapConfidence, 'HIGH');
    // Never scored: no score, not "0%".
    expect(parse({}).evidenceConfidence, isNull);
    expect(parse({'evidenceConfidence': 0.4}).evidenceConfidence, 0.4);
    // A project gap stores 0 on purpose: not a score either.
    expect(
      parse({'evidenceConfidence': 0, 'projectId': 'p1'}).evidenceConfidence,
      isNull,
    );
  });

  testWidgets('a card shows real data only: no invented severity',
      (tester) async {
    await _pump(tester);
    expect(find.text('Privacy budget in federated learning'), findsOneWidget);
    // The web's assessment label, not a percentage on the card.
    expect(find.text('Gap confidence: Moderate'), findsOneWidget);
    expect(find.text('82% confidence'), findsNothing);
    expect(find.text('3 evidence papers'), findsOneWidget);
    expect(find.textContaining('Severity'), findsNothing);
    // The state uses the tab's word.
    expect(find.widgetWithText(Container, 'Active'), findsWidgets);
  });

  Future<void> openAnalyze(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(FloatingActionButton, 'Analyze'));
    await tester.pumpAndSettle();
  }

  Finder topicField() => find.descendant(
        of: find.byType(LumiTextField),
        matching: find.byType(TextFormField),
      );

  testWidgets('a short topic is refused under the field, nothing sent',
      (tester) async {
    final api = await _pump(tester);
    await openAnalyze(tester);
    await tester.enterText(topicField(), 'ab');
    await tester.tap(find.widgetWithText(FilledButton, 'Analyze'));
    await tester.pumpAndSettle();
    expect(find.text('Topic must be at least 3 characters long.'), findsOneWidget);
    expect(api.analyzed, isEmpty);
  });

  testWidgets('with no gaps the empty list offers the analysis itself',
      (tester) async {
    final api = await _pump(tester, total: 0);
    expect(find.text('No research gaps found'), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsNothing);
    await tester.tap(find.text('Analyze a topic'));
    await tester.pumpAndSettle();
    await tester.enterText(topicField(), '  federated learning  ');
    await tester.tap(find.widgetWithText(FilledButton, 'Analyze'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.analyzed, ['federated learning']);
  });

  testWidgets('the filter sheet edits a copy: only "Apply" reloads',
      (tester) async {
    final api = await _pump(tester);
    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('High (≥70%)'));
    await tester.pumpAndSettle();
    // Dismissed by tapping outside: nothing changes.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(api.listed.where((p) => p.minConfidence == 0.7), isEmpty);
    expect(find.byTooltip('Filters'), findsOneWidget);

    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('High (≥70%)'));
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(api.listed.last.minConfidence, 0.7);
    expect(api.listed.last.page, 1);
    expect(find.byTooltip('Filters, 1 active'), findsOneWidget);
  });

  testWidgets('a finished analysis reloads the list on "View gaps"',
      (tester) async {
    final api = await _pump(tester);
    await openAnalyze(tester);
    await tester.enterText(topicField(), 'federated learning');
    await tester.tap(find.widgetWithText(FilledButton, 'Analyze'));
    // The progress bar runs while the job runs: pump, do not settle.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.analyzed, ['federated learning']);
    expect(find.text('Analyzing gaps with AI'), findsOneWidget);

    api.jobStatus = 'ready';
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(find.text('Analysis complete'), findsOneWidget);

    final before = api.listed.length;
    await tester.tap(find.text('View gaps'));
    await tester.pumpAndSettle();
    expect(find.text('Analysis complete'), findsNothing);
    expect(api.listed.length, greaterThan(before), reason: 'list reloaded');
    // Polling stopped: no timer is left running when the test ends.
  });

  testWidgets('a failed status change says why, never the raw exception',
      (tester) async {
    final api = await _pump(tester);
    api.patchError = httpFailure(403);
    // The review actions are in the gap's sheet, not on every card.
    expect(find.text('Validate gap'), findsNothing);
    await tester.tap(find.text('Privacy budget in federated learning'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Validate gap'));
    await tester.pumpAndSettle();
    expect(api.patched, [('g1', 'resolved')]);
    expect(find.text('You do not have permission to do this.'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });
}
