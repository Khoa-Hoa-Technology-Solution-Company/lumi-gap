import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_mobile/features/trends/presentation/trends_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Future<List<TrendsOverviewParams>> _pump(WidgetTester tester) async {
  tester.view
    ..physicalSize = const Size(412, 1400)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final asked = <TrendsOverviewParams>[];
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        trendsOverviewProvider.overrideWith((ref, p) async {
          asked.add(p);
          return const TrendsOverview(topics: []);
        }),
      ],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: const TrendsScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return asked;
}

Future<void> _pickFromYear(WidgetTester tester, int year) async {
  await tester.tap(find.text('2020').first);
  await tester.pumpAndSettle();
  await tester.tap(find.text('$year').last);
  await tester.pumpAndSettle();
}

void main() {
  test('the scope badge counts what differs from the default', () {
    expect(
      trendScopeActiveCount(
        const TrendsOverviewParams(yearFrom: 2020, yearTo: 2026, minPapers: 1),
      ),
      0,
    );
    expect(
      trendScopeActiveCount(
        const TrendsOverviewParams(
          yearFrom: 2022,
          yearTo: 2026,
          minPapers: 1,
          scopeFilters: TrendScopeFilters(paperKinds: ['article']),
        ),
      ),
      2,
    );
  });

  testWidgets('the scope sheet edits a draft: closing it changes nothing', (
    tester,
  ) async {
    final asked = await _pump(tester);
    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    await _pickFromYear(tester, 2022);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(asked.map((p) => p.yearFrom), isNot(contains(2022)));
    expect(find.byTooltip('Filters'), findsOneWidget, reason: 'no badge');
  });

  testWidgets('"Apply" reloads with the new scope and counts it', (
    tester,
  ) async {
    final asked = await _pump(tester);
    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    await _pickFromYear(tester, 2022);
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(asked.last.yearFrom, 2022);
    expect(find.byTooltip('Filters, 1 active'), findsOneWidget);
  });

  testWidgets('a "from" year after "to" moves "to" with it: never backwards',
      (tester) async {
    final asked = await _pump(tester);
    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    await _pickFromYear(tester, 2027);
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(asked.last.yearFrom, 2027);
    expect(asked.last.yearTo, 2027);
  });

  testWidgets('the three views switch without losing the screen', (
    tester,
  ) async {
    await _pump(tester);
    for (final tab in ['Compare', 'Explain', 'Signals']) {
      await tester.tap(find.text(tab).first);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: tab);
    }
  });
}
