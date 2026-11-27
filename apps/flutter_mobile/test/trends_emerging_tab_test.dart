import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/trends/components/trends_emerging_tab.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _response({
  String source = 'openalex',
  List<Map<String, dynamic>> keywords = const [],
}) => {
  'dataSource': source,
  'earlierPeriod': {'yearFrom': 2016, 'yearTo': 2022, 'papers': 3000000},
  'recentPeriod': {'yearFrom': 2023, 'yearTo': 2025, 'papers': 1900000},
  'lastCompleteYear': 2025,
  'criteria': {
    'minRecentPapers': 20,
    'noveltyShare': 0.7,
    'significanceLevel': 0.05,
  },
  'termsTested': 200,
  'matchedCount': keywords.length,
  'keywords': keywords,
};

final Map<String, dynamic> _llm = {
  'keyword': 'large language models',
  'earlierPapers': 1175,
  'recentPapers': 71020,
  'noveltyShare': 0.984,
  'shift': {
    'term': 'large language models',
    'papersA': 1175,
    'papersB': 71020,
    'logOddsRatio': 4.6,
    'z': 156.6,
    'pValue': 0,
    'qValue': 0,
  },
  'yearlyBreakdown': [
    {'year': 2024, 'count': 20000},
    {'year': 2025, 'count': 40000},
    {'year': 2026, 'count': 9000},
  ],
};

Future<void> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  AppLocale locale = AppLocale.en,
}) async {
  tester.view
    ..physicalSize = const Size(412 * 2, 2000 * 2)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        trendEmergingProvider.overrideWith(
          (ref, filters) async => TrendEmergingResponse.fromJson(json),
        ),
      ],
      child: MaterialApp(
        locale: locale.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: const Scaffold(
          body: TrendsEmergingTab(params: TrendsOverviewParams()),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  test('parses the emerging response', () {
    final data = TrendEmergingResponse.fromJson(_response(keywords: [_llm]));
    expect(data.recentPeriod.yearFrom, 2023);
    expect(data.noveltyShare, 0.7);
    expect(data.termsTested, 200);
    final keyword = data.keywords.single;
    expect(keyword.recentPapers, 71020);
    expect(keyword.logOddsRatio, 4.6);
    expect(keyword.yearlyBreakdown, hasLength(3));
  });

  testWidgets(
    'lists the signals with the early-signal caution and the criteria',
    (tester) async {
      await _pump(tester, _response(keywords: [_llm]));
      expect(find.text('Early signal, not a forecast'), findsOneWidget);
      expect(find.text('large language models'), findsOneWidget);
      expect(find.text('98%'), findsOneWidget);
      expect(find.text('1 signals among 200 keywords tested'), findsOneWidget);
      expect(
        find.textContaining('at least 20 papers in 2023–2025'),
        findsOneWidget,
      );
    },
  );

  testWidgets('the local corpus explains why there is no list', (tester) async {
    await _pump(tester, _response(source: 'local'));
    expect(
      find.text(
        'Emerging signals need OpenAlex keyword counts; the local corpus cannot compute them.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('no signal in the scope', (tester) async {
    await _pump(tester, _response(), locale: AppLocale.vi);
    expect(
      find.text('Không có từ khoá nào đạt đủ mọi tiêu chí trong phạm vi này.'),
      findsOneWidget,
    );
    expect(find.text('Tín hiệu sớm, không phải dự báo'), findsOneWidget);
  });

  testWidgets('a failed request reads as a reason with a retry, never the '
      'raw exception', (tester) async {
    var calls = 0;
    tester.view
      ..physicalSize = const Size(412 * 2, 2000 * 2)
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        // No automatic retries: the error state is what is checked.
        retry: (_, _) => null,
        overrides: [
          trendEmergingProvider.overrideWith((ref, filters) async {
            calls++;
            throw Exception('DioException [bad response]: null');
          }),
        ],
        child: MaterialApp(
          locale: AppLocale.en.locale,
          supportedLocales: AppLocale.supportedLocales,
          localizationsDelegates: appLocalizationsDelegates,
          theme: AppTheme.lightTheme,
          home: const Scaffold(
            body: TrendsEmergingTab(params: TrendsOverviewParams()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('DioException'), findsNothing);
    expect(find.text('Try again'), findsOneWidget);
    final before = calls;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(calls, before + 1);
  });
}
