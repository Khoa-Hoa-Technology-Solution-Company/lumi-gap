import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/bookmarks/presentation/bookmarks_screen.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';

class _FakeBookmarksApi extends Fake implements BookmarksApi {
  _FakeBookmarksApi(this.items);

  List<Bookmark> items;
  final List<String> deleted = [];
  Object? deleteError;
  Completer<void>? deleteGate;

  @override
  Future<List<Bookmark>> list() async => items;

  @override
  Future<void> delete(String id) async {
    deleted.add(id);
    await deleteGate?.future;
    // ignore: only_throw_errors, the test injects what the API may throw
    if (deleteError != null) throw deleteError!;
    items = items.where((b) => b.id != id).toList();
  }

  @override
  Future<BookmarkStatus> checkStatus(String targetKind, String targetId) async =>
      const BookmarkStatus(bookmarked: false);
}

const _paper = Paper(
  id: 'p1',
  title: 'Privacy budgets in federated learning',
  publicationYear: 2025,
  citationCount: 0,
  dataStatus: 'active',
  dataQualityScore: 0,
  isAiAnalyzable: false,
  createdAt: '',
  updatedAt: '',
);

final _items = [
  const Bookmark(id: 'b1', targetKind: 'paper', targetId: 'p1', paperDetail: _paper),
  const Bookmark(
    id: 'b2',
    targetKind: 'report',
    targetId: 'r1',
    reportTitle: 'LLM in education',
    reportStatus: 'ready',
  ),
  // Its paper was deleted: not listed.
  const Bookmark(id: 'b3', targetKind: 'paper', targetId: 'gone'),
];

Future<_FakeBookmarksApi> _pump(WidgetTester tester) async {
  tester.view
    ..physicalSize = const Size(412, 1400)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = _FakeBookmarksApi(List.of(_items));
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [bookmarksApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: const BookmarksScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

/// The Undo snackbar has slid in; its timer starts on the next frame.
Future<void> _snackIn(WidgetTester tester) async {
  // The first frame starts the entrance animation; the next ones run it.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump();
}

/// The Undo window passes and the snackbar has gone.
Future<void> _undoWindowEnds(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 6));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('saved papers and reports, without bookmarks left behind',
      (tester) async {
    await _pump(tester);
    expect(find.text('All (2)'), findsOneWidget);
    expect(find.text('Privacy budgets in federated learning'), findsOneWidget);
    expect(find.text('LLM in education'), findsOneWidget);
    await tester.tap(find.text('Reports (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Privacy budgets in federated learning'), findsNothing);
    expect(find.text('LLM in education'), findsOneWidget);
  });

  testWidgets('remove hides at once; Undo keeps the bookmark, no request',
      (tester) async {
    final api = await _pump(tester);
    await tester.tap(find.byTooltip('Remove bookmark').last);
    await _snackIn(tester);
    expect(find.text('LLM in education'), findsNothing);
    expect(find.text('Removed from bookmarks'), findsOneWidget);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(api.deleted, isEmpty);
    expect(find.text('LLM in education'), findsOneWidget);
  });

  testWidgets('without Undo exactly one delete is sent when the window ends',
      (tester) async {
    final api = await _pump(tester);
    await tester.tap(find.byTooltip('Remove bookmark').last);
    await _snackIn(tester);
    // Nothing is sent while Undo is still possible.
    await tester.pump(const Duration(seconds: 3));
    // Still inside the window: nothing sent yet.
    expect(api.deleted, isEmpty);
    await _undoWindowEnds(tester);
    // The report's bookmark, never the report.
    expect(api.deleted, ['b2']);
    expect(find.text('LLM in education'), findsNothing);
  });

  testWidgets('swiping a row removes it with the same Undo window',
      (tester) async {
    final api = await _pump(tester);
    await tester.drag(
      find.text('Privacy budgets in federated learning'),
      const Offset(-400, 0),
    );
    await tester.pumpAndSettle();
    expect(find.text('Privacy budgets in federated learning'), findsNothing);
    expect(api.deleted, isEmpty);
    await _undoWindowEnds(tester);
    await tester.pumpAndSettle();
    expect(api.deleted, ['b1']);
  });

  testWidgets('a second removal commits the first at once; none is lost',
      (tester) async {
    final api = await _pump(tester);
    await tester.tap(find.byTooltip('Remove bookmark').first);
    await _snackIn(tester);
    await tester.tap(find.byTooltip('Remove bookmark').first);
    await _snackIn(tester);
    expect(api.deleted, ['b1']);
    await _undoWindowEnds(tester);
    await tester.pumpAndSettle();
    expect(api.deleted, ['b1', 'b2']);
    expect(find.text('All (0)'), findsOneWidget);
  });

  testWidgets('a failed delete says why and brings the row back',
      (tester) async {
    final api = await _pump(tester)
      ..deleteError = httpFailure(500);
    await tester.tap(find.byTooltip('Remove bookmark').first);
    await _snackIn(tester);
    await _undoWindowEnds(tester);
    await tester.pumpAndSettle();
    expect(api.deleted, ['b1']);
    expect(find.text('Something went wrong. Please try again.'), findsOneWidget);
    expect(find.text('Privacy budgets in federated learning'), findsOneWidget);
  });

  testWidgets('long-press opens the actions; Remove uses the Undo flow',
      (tester) async {
    final api = await _pump(tester);
    await tester.longPress(find.text('LLM in education'));
    await tester.pumpAndSettle();
    expect(find.text('Open'), findsOneWidget);
    await tester.tap(find.text('Remove bookmark'));
    await _snackIn(tester);
    expect(find.text('LLM in education'), findsNothing);
    expect(api.deleted, isEmpty);
    await _undoWindowEnds(tester);
    expect(api.deleted, ['b2']);
  });

  testWidgets('leaving the screen commits a pending removal', (tester) async {
    tester.view
      ..physicalSize = const Size(412, 1400)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _FakeBookmarksApi(List.of(_items));
    final show = ValueNotifier(true);
    addTearDown(show.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [bookmarksApiProvider.overrideWithValue(api)],
        child: MaterialApp(
          locale: AppLocale.en.locale,
          supportedLocales: AppLocale.supportedLocales,
          localizationsDelegates: appLocalizationsDelegates,
          theme: AppTheme.lightTheme,
          home: ValueListenableBuilder<bool>(
            valueListenable: show,
            builder: (_, visible, _) => visible
                ? const BookmarksScreen()
                : const Scaffold(body: SizedBox()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Remove bookmark').first);
    await _snackIn(tester);
    show.value = false;
    await tester.pump();
    await tester.pumpAndSettle();
    expect(api.deleted, ['b1']);
  });
}
