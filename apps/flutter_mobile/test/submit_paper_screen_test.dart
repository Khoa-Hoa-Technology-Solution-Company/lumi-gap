import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/presentation/submit_paper_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

class _FakePapersApi extends Fake implements PapersApi {
  final List<SubmitPaperInput> created = [];
  Completer<void>? gate;
  Object? error;

  @override
  Future<Paper> create(SubmitPaperInput input) async {
    created.add(input);
    await gate?.future;
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (error != null) throw error!;
    return const Paper(
      id: 'p1',
      title: 't',
      publicationYear: 2024,
      citationCount: 0,
      dataStatus: 'pending',
      dataQualityScore: 0,
      isAiAnalyzable: false,
      createdAt: '',
      updatedAt: '',
    );
  }
}

Future<_FakePapersApi> _pump(WidgetTester tester) async {
  tester.view
    ..physicalSize = const Size(412, 4000)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = _FakePapersApi();
  final router = GoRouter(
    initialLocation: '/profile',
    routes: [
      GoRoute(
        path: '/profile',
        builder: (context, _) => Scaffold(
          body: TextButton(
            onPressed: () => context.push('/submit-paper'),
            child: const Text('profile'),
          ),
        ),
      ),
      GoRoute(
        path: '/submit-paper',
        builder: (_, _) => const SubmitPaperScreen(),
      ),
      GoRoute(
        path: '/my-papers',
        builder: (_, _) => const Scaffold(body: Text('my papers')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        papersApiProvider.overrideWithValue(api),
        myPapersProvider.overrideWith((ref) async => const <Paper>[]),
      ],
      child: MaterialApp.router(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.tap(find.text('profile'));
  await tester.pumpAndSettle();
  return api;
}

Finder _field(String label) => find.ancestor(
      of: find.text(label),
      matching: find.byType(TextField),
    );

Future<void> _fillValid(WidgetTester tester) async {
  await tester.enterText(_field('Paper title'), 'Federated learning in health');
  await tester.enterText(_field('DOI'), '10.1234/abc.def');
  await tester.enterText(_field('Paper link'), 'https://example.org/paper');
  await tester.enterText(
    _field('Abstract'),
    List.filled(60, 'word').join(' '),
  );
  await tester.enterText(_field('Authors'), 'Minh Nguyen');
  await tester.enterText(_field('Keywords'), 'federated learning');
  await tester.pump();
}

void main() {
  testWidgets('errors show under their own fields; nothing is sent',
      (tester) async {
    final api = await _pump(tester);
    await tester.tap(find.text('Submit for review'));
    await tester.pumpAndSettle();
    expect(api.created, isEmpty);
    expect(
      find.text('Title must be at least 8 characters and 3 words.'),
      findsOneWidget,
    );
    expect(find.text('Please enter a valid DOI.'), findsOneWidget);
    expect(find.text('At least one author is required.'), findsOneWidget);

    // Fixing a field clears its error right away.
    await tester.enterText(_field('DOI'), '10.1234/abc.def');
    await tester.pump();
    expect(find.text('Please enter a valid DOI.'), findsNothing);
  });

  testWidgets('two taps send once; then Back skips the sent form',
      (tester) async {
    final api = await _pump(tester);
    await _fillValid(tester);
    api.gate = Completer<void>();
    await tester.tap(find.text('Submit for review'));
    await tester.pump();
    await tester.tap(find.text('Submit for review'));
    await tester.pump();
    expect(api.created, hasLength(1));

    api.gate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('my papers'), findsOneWidget);
    // Back returns to Profile, not to the form that was just sent.
    GoRouter.of(tester.element(find.text('my papers'))).pop();
    await tester.pumpAndSettle();
    expect(find.text('profile'), findsOneWidget);
  });

  testWidgets('a failed send says why, never the raw exception',
      (tester) async {
    final api = await _pump(tester);
    await _fillValid(tester);
    api.error = httpFailure(409);
    await tester.tap(find.text('Submit for review'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Exception'), findsNothing);
    expect(find.text('my papers'), findsNothing);
  });
}
