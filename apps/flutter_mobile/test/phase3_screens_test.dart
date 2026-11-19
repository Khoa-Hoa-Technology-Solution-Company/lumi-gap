import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/reports_screen.dart';
import 'package:flutter_mobile/features/trends/components/trend_compare_results.dart';
import 'package:flutter_mobile/features/trends/components/trends_ai_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_signals_tab.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

TrendingTopic _topic(
  String name, {
  TrendVerdict verdict = TrendVerdict.insufficient,
  double? change,
  TrendConfidence? confidence,
  double growth = 10,
  int papers = 1234,
}) => TrendingTopic(
  topic: name,
  totalPapers: papers,
  yearlyBreakdown: const [
    YearlyCount(year: 2024, count: 1),
    YearlyCount(year: 2025, count: 2),
  ],
  classification: TrendClassification(
    verdict: verdict,
    confidence: confidence,
    relativeChangePct: change,
  ),
);

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  List<Override> overrides = const [],
  Size size = const Size(412, 900),
  double textScale = 1,
  AppLocale locale = AppLocale.en,
  Brightness brightness = Brightness.light,
  bool scaffold = true,
}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: overrides,
      child: MaterialApp(
        locale: locale.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: brightness == Brightness.dark
            ? AppTheme.darkTheme
            : AppTheme.lightTheme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: scaffold ? Scaffold(body: child) : child,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('trend signals', () {
    test('classification is read from the API, never guessed', () {
      final rising = TrendClassification.fromJson({
        'verdict': 'rising',
        'confidence': 'high',
        'relativeChangePct': 4.25,
      });
      expect(rising.verdict, TrendVerdict.rising);
      expect(rising.confidence, TrendConfidence.high);
      expect(rising.shownChangePct, 4.25);
      // Unknown verdict, missing object: insufficient, no direction.
      expect(
        TrendClassification.fromJson({'verdict': 'skyrocketing'}).verdict,
        TrendVerdict.insufficient,
      );
      expect(
        TrendClassification.fromJson(null).verdict,
        TrendVerdict.insufficient,
      );
      // No confidence and no change figure without a direction.
      final none = TrendClassification.fromJson({
        'verdict': 'insufficient',
        'confidence': 'high',
        'relativeChangePct': 9,
      });
      expect(none.confidence, isNull);
      expect(none.shownChangePct, isNull);
    });

    test('order follows the web: rising by change, stable, declining, '
        'insufficient; ties by papers then name', () {
      final sorted = sortTopicsByTrend([
        _topic('insuff', papers: 9999),
        _topic('dec-small', verdict: TrendVerdict.declining, change: -1),
        _topic('stable', verdict: TrendVerdict.stable),
        _topic('rise-small', verdict: TrendVerdict.rising, change: 2),
        _topic('dec-big', verdict: TrendVerdict.declining, change: -8),
        _topic('rise-big', verdict: TrendVerdict.rising, change: 9),
        _topic(
          'rise-tie-b',
          verdict: TrendVerdict.rising,
          change: 2,
          papers: 10,
        ),
        _topic(
          'rise-tie-a',
          verdict: TrendVerdict.rising,
          change: 2,
          papers: 10,
        ),
      ]).map((t) => t.topic);
      expect(sorted, [
        'rise-big',
        'rise-small',
        'rise-tie-a',
        'rise-tie-b',
        'stable',
        'dec-big',
        'dec-small',
        'insuff',
      ]);
    });

    test('the featured topic must be rising: raw growth never counts', () {
      expect(topRisingTopic(const <TrendingTopic>[]), isNull);
      // +300% raw-count growth, but the API could not test it.
      expect(
        topRisingTopic([
          _topic('hot raw', growth: 300),
          _topic('stable', verdict: TrendVerdict.stable, growth: 50),
        ]),
        isNull,
      );
      expect(
        topRisingTopic([
          _topic('small', verdict: TrendVerdict.rising, change: 1),
          _topic('big', verdict: TrendVerdict.rising, change: 6),
        ])?.topic,
        'big',
      );
    });

    testWidgets('nothing tested: said once, no verdicts, no % per year', (
      tester,
    ) async {
      await _pump(
        tester,
        TrendsSignalsTab(
          overview: TrendsOverview(
            topics: [_topic('Local topic', growth: 110.8, papers: 109071)],
          ),
          params: const TrendsOverviewParams(),
          onExplainTopic: (_) {},
        ),
      );
      // Nothing is featured: raw growth never makes a topic "rising".
      expect(find.text('Fastest rising topic'), findsNothing);
      expect(
        find.text(
          'Not enough yearly data yet to tell whether these topics are rising or falling.',
        ),
        findsOneWidget,
      );
      expect(find.text('Insufficient data'), findsNothing);
      expect(find.textContaining('per year'), findsNothing);
      expect(find.textContaining('110.8'), findsNothing);
      expect(find.textContaining('109,071 papers'), findsOneWidget);
      // One tap per row, at least 48dp tall; the actions are in the sheet
      // it opens, not repeated on every row.
      final row = find.ancestor(
        of: find.text('Local topic'),
        matching: find.byType(InkWell),
      );
      expect(tester.getSize(row.first).height, greaterThanOrEqualTo(48));
      expect(find.byType(TextButton), findsNothing);
    });

    testWidgets('a row opens the topic sheet with its actions', (tester) async {
      final explained = <String>[];
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => Scaffold(
              body: TrendsSignalsTab(
                overview: TrendsOverview(topics: [_topic('Local topic')]),
                params: const TrendsOverviewParams(),
                onExplainTopic: explained.add,
              ),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
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
      await tester.tap(find.text('Local topic'));
      await tester.pumpAndSettle();
      expect(find.text('Search Papers'), findsOneWidget);
      expect(find.text('Generate Report'), findsOneWidget);
      await tester.tap(find.text('Explain Trend with AI'));
      await tester.pumpAndSettle();
      expect(explained, ['Local topic']);
    });

    testWidgets('a rising topic is featured with its verdict and change', (
      tester,
    ) async {
      await _pump(
        tester,
        TrendsSignalsTab(
          overview: TrendsOverview(
            topics: [
              _topic('Down', verdict: TrendVerdict.declining, change: -3.2),
              _topic(
                'Up',
                verdict: TrendVerdict.rising,
                change: 4.25,
                confidence: TrendConfidence.high,
              ),
            ],
          ),
          params: const TrendsOverviewParams(),
          onExplainTopic: (_) {},
        ),
      );
      // Featured: the rising topic, its % per year and how sure the API is.
      expect(find.text('Fastest rising topic'), findsOneWidget);
      expect(find.text('+4.3%'), findsNWidgets(2), reason: 'hero and its row');
      expect(find.textContaining('High confidence'), findsOneWidget);
      // Each row says its verdict in words next to the figure.
      expect(find.text('Rising'), findsOneWidget);
      expect(find.text('Declining'), findsOneWidget);
      expect(find.text('-3.2%'), findsOneWidget);
      // Rising first in the list, even though the API listed it second.
      expect(
        tester.getTopLeft(find.text('Up').last).dy,
        lessThan(tester.getTopLeft(find.text('Down')).dy),
      );
    });

    for (final locale in AppLocale.values) {
      testWidgets('signal cards fit 320dp at text scale 1.3 (${locale.name})', (
        tester,
      ) async {
        await _pump(
          tester,
          TrendsSignalsTab(
            overview: TrendsOverview(
              topics: [
                _topic(
                  'A Very Long Topic Name About Artificial Intelligence in Education',
                  verdict: TrendVerdict.rising,
                  change: 110.8,
                  confidence: TrendConfidence.medium,
                  papers: 109071,
                ),
              ],
            ),
            params: const TrendsOverviewParams(),
            onExplainTopic: (_) {},
          ),
          size: const Size(320, 900),
          textScale: 1.3,
          locale: locale,
        );
        expect(tester.takeException(), isNull);
      });
    }
  });

  testWidgets('compare: verdicts come from the overview, none is assumed', (
    tester,
  ) async {
    TopicComparisonItem item(String name) => TopicComparisonItem(
      topic: name,
      totalPapers: 10,
      yearlyBreakdown: const [
        YearlyCount(year: 2024, count: 1),
        YearlyCount(year: 2025, count: 2),
      ],
    );
    await _pump(
      tester,
      SingleChildScrollView(
        child: TrendCompareResults(
          result: TrendCompareResponse(
            topics: [item('Listed'), item('Not listed')],
          ),
          classificationOf: (t) => t == 'Listed'
              ? const TrendClassification(
                  verdict: TrendVerdict.rising,
                  relativeChangePct: 3,
                )
              : null,
          onSearch: (_) {},
          onExplain: (_) {},
        ),
      ),
      size: const Size(412, 2000),
    );
    expect(find.text('Rising'), findsOneWidget);
    expect(find.text('+3.0% per year'), findsOneWidget);
    expect(
      find.text('No verdict: this topic is not in the overview list'),
      findsOneWidget,
    );
    expect(find.text('Insufficient data'), findsNothing);
  });

  group('explain tab', () {
    for (final width in [320.0, 412.0]) {
      testWidgets('a long topic name does not overflow the picker '
          '(${width.toInt()}dp)', (tester) async {
        await _pump(
          tester,
          TrendsAiTab(
            overview: TrendsOverview(
              topics: [
                _topic(
                  'Artificial Intelligence in Healthcare and Education Systems Worldwide',
                ),
              ],
            ),
            params: const TrendsOverviewParams(),
          ),
          overrides: [
            explainHistoryProvider.overrideWith(
              (ref) async => <TrendExplanationHistoryItem>[],
            ),
          ],
          size: Size(width, 900),
        );
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('reports screen', () {
    for (final locale in AppLocale.values) {
      testWidgets('opens without error and fills the form in ${locale.name}', (
        tester,
      ) async {
        // The app keeps this equal to the language on screen (see App);
        // a bare MaterialApp does not, so the test sets it.
        final previous = currentAppLocale;
        currentAppLocale = locale;
        addTearDown(() => currentAppLocale = previous);
        await _pump(
          tester,
          const ReportsScreen(),
          scaffold: false,
          locale: locale,
          overrides: [
            reportsProvider.overrideWith(
              (ref, params) async => const ReportsList(reports: [], total: 0),
            ),
          ],
        );
        // Reading context.t in initState threw here before.
        expect(tester.takeException(), isNull);
        // The list comes first; with no reports it offers to start one.
        await tester.tap(find.text(translate('New report', locale)).last);
        await tester.pumpAndSettle();
        // No sample topic is typed in for the reader, only suggested.
        expect(
          find.text(translate('e.g. LLM in education...', locale)),
          findsOneWidget,
        );
        expect(find.text(translate('LLM in education', locale)), findsNothing);
      });
    }

    testWidgets('an empty question is refused under the field, nothing sent', (
      tester,
    ) async {
      await _pump(
        tester,
        const ReportsScreen(),
        scaffold: false,
        overrides: [
          reportsProvider.overrideWith(
            (ref, params) async => const ReportsList(reports: [], total: 0),
          ),
        ],
      );
      await tester.tap(find.text('New report').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Preview Evidence Pack'));
      await tester.pumpAndSettle();
      // A real API call would fail without a server; none is made.
      expect(tester.takeException(), isNull);
      expect(find.text('Enter a research question.'), findsOneWidget);

      await tester.enterText(
        find.ancestor(
          of: find.text('What should the report answer?'),
          matching: find.byType(TextField),
        ),
        'ab',
      );
      await tester.pump();
      expect(find.text('Use at least 3 characters.'), findsOneWidget);
    });
  });

  group('reports screen layout', () {
    const someReports = ReportsList(
      reports: [
        ReportListItem(id: 'r1', query: 'q', status: 'ready', topic: 'Topic A'),
      ],
      total: 1,
    );

    testWidgets('the reports come first; "New report" opens the steps and '
        'closing keeps what was typed', (tester) async {
      await _pump(
        tester,
        const ReportsScreen(),
        scaffold: false,
        overrides: [
          reportsProvider.overrideWith((ref, params) async => someReports),
        ],
      );
      expect(find.text('Topic A'), findsOneWidget);
      expect(find.text('Preview Evidence Pack'), findsNothing);

      await tester.tap(find.widgetWithText(FloatingActionButton, 'New report'));
      await tester.pumpAndSettle();
      expect(find.text('Preview Evidence Pack'), findsOneWidget);
      await tester.enterText(
        find.ancestor(
          of: find.text('What should the report answer?'),
          matching: find.byType(TextField),
        ),
        'How do LLMs grade essays?',
      );

      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.text('Topic A'), findsOneWidget);
      await tester.tap(find.widgetWithText(FloatingActionButton, 'New report'));
      await tester.pumpAndSettle();
      expect(find.text('How do LLMs grade essays?'), findsOneWidget);
    });

    testWidgets('a link with a topic opens the steps, filled in', (
      tester,
    ) async {
      await _pump(
        tester,
        const ReportsScreen(
          initialTopic: 'Federated learning',
          startBuilding: true,
        ),
        scaffold: false,
        overrides: [
          reportsProvider.overrideWith((ref, params) async => someReports),
        ],
      );
      expect(find.text('Preview Evidence Pack'), findsOneWidget);
      expect(find.text('Federated learning'), findsOneWidget);
      // Back goes to where the link was, so no "Close" of its own.
      expect(find.byTooltip('Close'), findsNothing);
    });
  });

  group('bare input decoration', () {
    testWidgets('draws no box of its own inside a themed app', (tester) async {
      await _pump(
        tester,
        TextField(decoration: bareInputDecoration(hintText: 'Search')),
      );
      final decoration = tester
          .widget<InputDecorator>(find.byType(InputDecorator))
          .decoration;
      expect(decoration.filled, isFalse);
      for (final border in [
        decoration.border,
        decoration.enabledBorder,
        decoration.focusedBorder,
        decoration.disabledBorder,
      ]) {
        expect(border, InputBorder.none);
      }
    });
  });

  test('chart series: enough distinct colours, wrapping after the last', () {
    expect(LumiChart.series.toSet(), hasLength(LumiChart.series.length));
    expect(LumiChart.seriesAt(0), LumiChart.series.first);
    expect(LumiChart.seriesAt(LumiChart.series.length), LumiChart.series.first);
  });
}
