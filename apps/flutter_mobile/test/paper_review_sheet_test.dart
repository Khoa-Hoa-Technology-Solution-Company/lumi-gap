import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_insights_section.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeQualityApi extends Fake implements QualityApi {
  final List<(int, String?)> rated = [];

  @override
  Future<void> rate(String kind, String id, int stars, String? comment) async {
    rated.add((stars, comment));
  }
}

Future<_FakeQualityApi> _pump(WidgetTester tester, QualityView view) async {
  tester.view
    ..physicalSize = const Size(412, 1200)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = _FakeQualityApi();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [qualityApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: PaperReviewForm(paperId: 'p1', view: view),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

void main() {
  testWidgets('the page shows a summary; the form is in a sheet', (tester) async {
    final api = await _pump(
      tester,
      const QualityView(ratingAvg: 0, ratingCount: 0, ratings: []),
    );
    expect(find.text('No ratings yet'), findsOneWidget);
    // No inline form on the page.
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('Rate this paper'));
    await tester.pumpAndSettle();
    final submit = find.widgetWithText(FilledButton, 'Submit review');
    // A rating is needed first.
    expect(tester.widget<FilledButton>(submit).onPressed, isNull);
    await tester.tap(find.byTooltip('4 stars'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), '  Clear method  ');
    await tester.tap(submit);
    await tester.pumpAndSettle();
    expect(api.rated, [(4, 'Clear method')]);
    // Saved: the sheet closes and says so.
    expect(find.byType(BottomSheet), findsNothing);
    expect(find.text('Review submitted successfully.'), findsOneWidget);
  });

  testWidgets('an existing review opens with its stars and note', (tester) async {
    await _pump(
      tester,
      const QualityView(
        ratingAvg: 4,
        ratingCount: 2,
        ratings: [],
        myStars: 3,
        myComment: 'Good sample',
      ),
    );
    expect(find.text('2 ratings · 4.0 avg'), findsOneWidget);
    await tester.tap(find.text('Edit your review'));
    await tester.pumpAndSettle();
    expect(find.text('Good sample'), findsOneWidget);
    final third = tester.widget<IconButton>(
      find.widgetWithIcon(IconButton, Icons.star).at(2),
    );
    expect(third.isSelected, isTrue);
  });
}
