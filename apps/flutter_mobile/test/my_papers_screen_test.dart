import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/presentation/my_papers_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

Paper _paper(
  String id,
  String status, {
  String dataStatus = 'draft',
  String? reason,
}) =>
    Paper(
      id: id,
      title: 'Paper $id',
      publicationYear: 2025,
      citationCount: 0,
      dataStatus: dataStatus,
      dataQualityScore: 0,
      isAiAnalyzable: false,
      createdAt: '',
      updatedAt: '',
      paperStatus: status,
      rejectionReason: reason,
    );

Future<void> _pump(
  WidgetTester tester,
  Future<List<Paper>> Function() load,
) async {
  tester.view
    ..physicalSize = const Size(412, 1400)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => const MyPapersScreen()),
      GoRoute(
        path: '/submit-paper',
        builder: (_, _) => const Scaffold(body: Text('submit-screen')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [myPapersProvider.overrideWith((ref) => load())],
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
}

void main() {
  testWidgets('each paper says where it really stands', (tester) async {
    await _pump(
      tester,
      () async => [
        _paper('a', 'not-downloaded'),
        _paper('b', 'not-downloaded', dataStatus: 'active'),
        _paper('c', 'pending-requester-acceptance'),
        _paper('d', 'rejected', reason: 'No DOI match'),
      ],
    );
    expect(find.text('Submitted, no PDF yet'), findsOneWidget);
    expect(find.text('Approved, waiting for a PDF'), findsOneWidget);
    expect(find.text('PDF waiting for your acceptance'), findsOneWidget);
    expect(find.text('Rejected'), findsOneWidget);
    expect(find.text('Reason: No DOI match'), findsOneWidget);
    expect(find.text('Downloaded'), findsNothing);
  });

  testWidgets('submitting starts here, with a list or without one',
      (tester) async {
    await _pump(tester, () async => [_paper('a', 'pending')]);
    await tester.tap(find.widgetWithText(FloatingActionButton, 'Submit paper'));
    await tester.pumpAndSettle();
    expect(find.text('submit-screen'), findsOneWidget);

    await _pump(tester, () async => const []);
    expect(find.byType(FloatingActionButton), findsNothing);
    await tester.tap(find.text('Submit paper'));
    await tester.pumpAndSettle();
    expect(find.text('submit-screen'), findsOneWidget);
  });

  testWidgets('a failed load says why and can be retried', (tester) async {
    var fail = true;
    await _pump(tester, () async {
      if (fail) throw httpFailure(500);
      return [_paper('a', 'pending')];
    });
    expect(find.text('Something went wrong. Please try again.'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Paper a'), findsOneWidget);
  });
}
