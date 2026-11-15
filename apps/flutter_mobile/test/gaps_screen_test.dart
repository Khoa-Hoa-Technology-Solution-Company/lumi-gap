import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gaps_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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
  );

  @override
  Future<ListGapsResponse> list(GapsListParams params) async {
    listed.add(params);
    return const ListGapsResponse(data: [gap], total: 1);
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

Future<_FakeGapsApi> _pump(WidgetTester tester) async {
  tester.view
    ..physicalSize = const Size(412, 2000)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = _FakeGapsApi();
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [gapsApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: const GapsScreen(),
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
      of: find.text('Filter gaps by topic name...'),
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
    expect(api.listed.last.search, 'priv');
    expect(api.listed.last.topic, isNull, reason: 'search, not a topic filter');
  });

  testWidgets('a card shows real data only: no invented severity',
      (tester) async {
    await _pump(tester);
    expect(find.text('Privacy budget in federated learning'), findsOneWidget);
    expect(find.text('82% confidence'), findsOneWidget);
    expect(find.text('3 evidence papers'), findsOneWidget);
    expect(find.textContaining('Severity'), findsNothing);
    // The state uses the tab's word.
    expect(find.widgetWithText(Container, 'Active'), findsWidgets);
  });

  testWidgets('a short topic is refused under the field, nothing sent',
      (tester) async {
    final api = await _pump(tester);
    await tester.enterText(
      find.descendant(
        of: find.byType(LumiTextField),
        matching: find.byType(TextFormField),
      ),
      'ab',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Analyze'));
    await tester.pumpAndSettle();
    expect(find.text('Topic must be at least 3 characters long.'), findsOneWidget);
    expect(api.analyzed, isEmpty);
  });

  testWidgets('a finished analysis reloads the list on "View gaps"',
      (tester) async {
    final api = await _pump(tester);
    await tester.enterText(
      find.descendant(
        of: find.byType(LumiTextField),
        matching: find.byType(TextFormField),
      ),
      'federated learning',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Analyze'));
    // The progress bar runs while the job runs: pump, do not settle.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.analyzed, ['federated learning']);
    expect(find.text('Analyzing Gaps with AI'), findsOneWidget);

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
    await tester.tap(find.text('Validate Gap'));
    await tester.pumpAndSettle();
    expect(api.patched, [('g1', 'resolved')]);
    expect(find.text('You do not have permission to do this.'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });
}
