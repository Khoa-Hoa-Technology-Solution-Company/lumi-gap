import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/reports_screen.dart';
import 'package:flutter_mobile/features/trends/components/trends_ai_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_signals_tab.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';

TrendingTopic _topic(
  String name, {
  double growth = 10,
  double momentum = 5,
  int papers = 1234,
}) =>
    TrendingTopic(
      topic: name,
      momentum: momentum,
      growthRatePct: growth,
      totalPapers: papers,
      yearlyBreakdown: const [
        YearlyCount(year: 2024, count: 1),
        YearlyCount(year: 2025, count: 2),
      ],
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
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
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
    test('the banner topic is the first one that really grows', () {
      expect(strongestRisingTopic(const []), isNull);
      expect(
        strongestRisingTopic([_topic('a', growth: 0), _topic('b', growth: -3)]),
        isNull,
      );
      expect(
        strongestRisingTopic([
          _topic('down', growth: -20),
          _topic('flat', growth: 0),
          _topic('up', growth: 4),
          _topic('more', growth: 90),
        ])?.topic,
        'up',
      );
    });

    test('reliability tone follows the label', () {
      expect(reliabilityTone('High'), LumiChipTone.success);
      expect(reliabilityTone('Exploratory'), LumiChipTone.primary);
      expect(reliabilityTone('Small base'), LumiChipTone.warning);
    });

    testWidgets(
        'no "rising" claim when nothing grows; signs and thousands shown',
        (tester) async {
      await _pump(
        tester,
        TrendsSignalsTab(
          overview: TrendsOverview(
            topics: [_topic('Falling topic', growth: -12.5, papers: 109071)],
          ),
          params: const TrendsOverviewParams(),
          onExplainTopic: (_) {},
        ),
      );
      expect(find.textContaining('strongest rising'), findsNothing);
      expect(find.text('Growth: -12.5%'), findsOneWidget);
      expect(find.textContaining('+-'), findsNothing);
      expect(find.text('109,071 publications'), findsOneWidget);
      // Labelled actions, each at least 48dp tall.
      for (final label in ['Papers', 'Explain', 'Trend graph']) {
        final button = find.widgetWithText(TextButton, label);
        expect(button, findsOneWidget, reason: label);
        expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
      }
    });

    testWidgets('a growing topic gets the banner with a signed rate',
        (tester) async {
      await _pump(
        tester,
        TrendsSignalsTab(
          overview: TrendsOverview(
            topics: [_topic('Down', growth: -5), _topic('Up', growth: 110.8)],
          ),
          params: const TrendsOverviewParams(),
          onExplainTopic: (_) {},
        ),
      );
      expect(
        find.text(
          '"Up" is the strongest rising topic in this dataset scope with growth rate of +110.8%.',
        ),
        findsOneWidget,
      );
    });

    for (final locale in AppLocale.values) {
      testWidgets('signal cards fit 320dp at text scale 1.3 (${locale.name})',
          (tester) async {
        await _pump(
          tester,
          TrendsSignalsTab(
            overview: TrendsOverview(
              topics: [
                _topic(
                  'A Very Long Topic Name About Artificial Intelligence in Education',
                  growth: 110.8,
                  momentum: 6329.74,
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
      testWidgets('opens without error and fills the form in ${locale.name}',
          (tester) async {
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
        expect(
          find.text(translate('LLM in education', locale)),
          findsOneWidget,
        );
      });
    }
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
