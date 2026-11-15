import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/search/data/search_api.dart';
import 'package:flutter_mobile/features/search/presentation/search_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';

Paper _paper(
  String id, {
  String? venue,
  String? openAccessUrl,
  int citations = 1,
}) =>
    Paper(
      id: id,
      title: 'Paper $id',
      publicationYear: 2026,
      citationCount: citations,
      dataStatus: 'ready',
      dataQualityScore: 0.87,
      isAiAnalyzable: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      journalName: venue,
      openAccessUrl: openAccessUrl,
    );

/// Each call waits for the test to answer it, so answers can be given in any
/// order.
class _GatedSearchApi extends Fake implements SearchApi {
  final List<({String q, SearchParams params, Completer<PagedPapers> answer})>
      calls = [];

  @override
  Future<PagedPapers> semantic(SearchParams params) {
    final answer = Completer<PagedPapers>();
    calls.add((q: params.q, params: params, answer: answer));
    return answer.future;
  }
}

Future<_GatedSearchApi> _pump(
  WidgetTester tester, {
  String initialQuery = '',
  Size size = const Size(412, 900),
  double textScale = 1,
  Brightness brightness = Brightness.light,
  AppLocale locale = AppLocale.en,
  List<Bookmark> bookmarks = const [],
}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = _GatedSearchApi();
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        searchApiProvider.overrideWithValue(api),
        bookmarkStatusProvider.overrideWith(
          (ref, target) async => const BookmarkStatus(bookmarked: false),
        ),
        bookmarksProvider.overrideWith((ref) async => bookmarks),
      ],
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
        home: SearchScreen(initialQuery: initialQuery),
      ),
    ),
  );
  await tester.pump();
  return api;
}

Future<void> _search(WidgetTester tester, String query) async {
  await tester.enterText(find.byType(TextField), query);
  await tester.tap(find.widgetWithText(FilledButton, 'Search'));
  await tester.pump();
}

void main() {
  testWidgets('before any search: explains what to do, no request',
      (tester) async {
    final api = await _pump(tester);
    expect(find.byType(LumiEmptyState), findsOneWidget);
    expect(api.calls, isEmpty);
    // A blank query is not sent either.
    await _search(tester, '   ');
    expect(api.calls, isEmpty);
  });

  testWidgets('loading shows a skeleton, then the results', (tester) async {
    final api = await _pump(tester, initialQuery: 'llm');
    await tester.pump();
    expect(api.calls.single.q, 'llm');
    expect(find.byType(LumiSkeleton), findsOneWidget);

    api.calls.single.answer.complete(
      PagedPapers(
        papers: [
          _paper('a', venue: 'Nature', openAccessUrl: 'https://x', citations: 3),
          _paper('b'),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(LumiSkeleton), findsNothing);
    expect(find.text('Paper a'), findsOneWidget);
    expect(find.text('2026 · Nature · 3 citations'), findsOneWidget);
    expect(find.text('Open Access'), findsOneWidget);
    // No venue and no authors: left out, and "1 citation" is singular.
    expect(find.text('2026 · 1 citation'), findsOneWidget);
    expect(find.textContaining('Unknown'), findsNothing);
    expect(find.textContaining('No authors'), findsNothing);
  });

  testWidgets(
      'a slow answer to an earlier query never lands in the newer results',
      (tester) async {
    final api = await _pump(tester);
    await _search(tester, 'first');
    await _search(tester, 'second');
    expect(api.calls.map((c) => c.q), ['first', 'second']);

    // The newer query answers first...
    api.calls[1].answer.complete(PagedPapers(papers: [_paper('new')]));
    await tester.pumpAndSettle();
    expect(find.text('Paper new'), findsOneWidget);

    // ...then the older one arrives late and must be dropped.
    api.calls[0].answer.complete(PagedPapers(papers: [_paper('old')]));
    await tester.pumpAndSettle();
    expect(find.text('Paper old'), findsNothing);
    expect(find.text('Paper new'), findsOneWidget);
  });

  testWidgets('a late failure of an earlier query shows no error',
      (tester) async {
    final api = await _pump(tester);
    await _search(tester, 'first');
    await _search(tester, 'second');
    api.calls[1].answer.complete(PagedPapers(papers: [_paper('new')]));
    await tester.pumpAndSettle();

    api.calls[0].answer.completeError(networkFailure());
    await tester.pumpAndSettle();
    expect(find.byType(SnackBar), findsNothing);
    expect(find.text('Paper new'), findsOneWidget);
  });

  testWidgets('failure: translated message, never the raw exception',
      (tester) async {
    final api = await _pump(tester);
    await _search(tester, 'llm');
    api.calls.single.answer.completeError(networkFailure());
    await tester.pump();
    await tester.pump();
    expect(
      find.text('Could not connect. Check your network and try again.'),
      findsOneWidget,
    );
    expect(find.textContaining('Exception'), findsNothing);
    expect(find.byType(LumiSkeleton), findsNothing);
  });

  testWidgets('an answer after the screen is closed does not throw',
      (tester) async {
    final api = await _pump(tester, initialQuery: 'llm');
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    api.calls.single.answer.complete(PagedPapers(papers: [_paper('a')]));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  for (final locale in AppLocale.values) {
    for (final brightness in Brightness.values) {
      testWidgets(
        'results fit 320dp at text scale 1.3 (${locale.name}, ${brightness.name})',
        (tester) async {
          final api = await _pump(
            tester,
            initialQuery: 'llm',
            size: const Size(320, 640),
            textScale: 1.3,
            brightness: brightness,
            locale: locale,
          );
          await tester.pump();
          api.calls.single.answer.complete(
            PagedPapers(
              papers: [
                _paper(
                  'a',
                  venue: 'A Journal With A Very Long Official Name Indeed',
                  openAccessUrl: 'https://x',
                  citations: 12345,
                ),
              ],
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          for (final e in find.byType(IconButton).evaluate()) {
            expect(e.size!.height, greaterThanOrEqualTo(48));
            expect(e.size!.width, greaterThanOrEqualTo(48));
          }
        },
      );
    }
  }

  group('filters', () {
    Future<_GatedSearchApi> withResults(WidgetTester tester) async {
      final api = await _pump(tester, initialQuery: 'llm');
      await tester.pump();
      api.calls.single.answer.complete(PagedPapers(papers: [_paper('a')]));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Filters'));
      await tester.pumpAndSettle();
      return api;
    }

    Finder yearField(String hint) => find.ancestor(
          of: find.text(hint),
          matching: find.byType(TextField),
        );

    FilledButton applyButton(WidgetTester tester) =>
        tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Apply Filters'),
        );

    testWidgets('closing without "Apply" changes nothing', (tester) async {
      final api = await withResults(tester);
      await tester.enterText(yearField('From Year'), '2020');
      await tester.tap(find.text('Open Access Only'));
      await tester.pump();
      // Dismiss by tapping outside the sheet.
      await tester.tapAt(const Offset(200, 40));
      await tester.pumpAndSettle();
      expect(api.calls, hasLength(1), reason: 'no new search');
      expect(find.byType(InputChip), findsNothing);
      // Opening again shows the old values, not the abandoned edits.
      await tester.tap(find.byTooltip('Filters'));
      await tester.pumpAndSettle();
      expect(find.text('2020'), findsNothing);
    });

    testWidgets('a bad or backwards year is refused under the field',
        (tester) async {
      await withResults(tester);
      await tester.enterText(yearField('From Year'), '1800');
      await tester.pump();
      expect(find.text('Enter a year between 1900 and 2100.'), findsOneWidget);
      expect(applyButton(tester).onPressed, isNull);

      await tester.enterText(yearField('From Year'), '2024');
      await tester.enterText(yearField('To Year'), '2020');
      await tester.pump();
      expect(find.text('"From" must not be after "To".'), findsOneWidget);
      expect(applyButton(tester).onPressed, isNull);
    });

    testWidgets('"Apply" sends the filters and shows readable chips',
        (tester) async {
      final api = await withResults(tester);
      await tester.enterText(yearField('From Year'), '2020');
      await tester.enterText(yearField('To Year'), '2024');
      await tester.tap(find.text('Open Access Only'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Apply Filters'));
      await tester.pumpAndSettle();

      final sent = api.calls.last.params;
      expect(sent.yearFrom, 2020);
      expect(sent.yearTo, 2024);
      expect(sent.openAccess, isTrue);
      expect(find.widgetWithText(InputChip, '2020–2024'), findsOneWidget);
      expect(find.widgetWithText(InputChip, 'Open Access'), findsOneWidget);

      // Removing a chip searches again without it.
      api.calls.last.answer.complete(PagedPapers(papers: [_paper('b')]));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.widgetWithText(InputChip, '2020–2024'),
          matching: find.byTooltip('Delete'),
        ),
      );
      await tester.pumpAndSettle();
      expect(api.calls.last.params.yearFrom, isNull);
      expect(api.calls.last.params.openAccess, isTrue);
    });
  });

  testWidgets('a saved paper says so; the others offer to save',
      (tester) async {
    final api = await _pump(
      tester,
      initialQuery: 'llm',
      bookmarks: const [
        Bookmark(id: 'bm1', targetKind: 'paper', targetId: 'a'),
      ],
    );
    await tester.pump();
    api.calls.single.answer
        .complete(PagedPapers(papers: [_paper('a'), _paper('b')]));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Remove bookmark'), findsOneWidget);
    expect(find.byTooltip('Save Paper'), findsOneWidget);
  });
}
