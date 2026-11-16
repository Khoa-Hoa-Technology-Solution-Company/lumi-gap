import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_detail_sections.dart';
import 'package:flutter_test/flutter_test.dart';

Paper _paper(String? abstractText) => Paper(
      id: 'p',
      title: 't',
      publicationYear: 2025,
      citationCount: 0,
      dataStatus: 'active',
      dataQualityScore: 0,
      isAiAnalyzable: true,
      createdAt: '',
      updatedAt: '',
      abstractText: abstractText,
    );

Future<void> _pump(WidgetTester tester, Paper paper) async {
  tester.view
    ..physicalSize = const Size(412, 2400)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      locale: AppLocale.en.locale,
      supportedLocales: AppLocale.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: SingleChildScrollView(child: PaperAbstractSection(paper: paper)),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a long abstract starts short and opens on "Show more"',
      (tester) async {
    await _pump(tester, _paper(List.filled(80, 'privacy budgets').join(' ')));
    final text = find.textContaining('privacy budgets');
    final shortHeight = tester.getSize(text).height;
    await tester.tap(find.text('Show more'));
    await tester.pumpAndSettle();
    expect(tester.getSize(text).height, greaterThan(shortHeight));
    expect(find.text('Show less'), findsOneWidget);
  });

  testWidgets('a short abstract has no "Show more"', (tester) async {
    await _pump(tester, _paper('One short sentence.'));
    expect(find.text('Show more'), findsNothing);
  });

  testWidgets('no abstract says so', (tester) async {
    await _pump(tester, _paper(null));
    expect(
      find.text('No abstract description available for this publication.'),
      findsOneWidget,
    );
  });
}
