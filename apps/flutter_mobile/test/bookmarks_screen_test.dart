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

  testWidgets('removing asks first and removes only the bookmark',
      (tester) async {
    final api = await _pump(tester);
    final remove = find.byTooltip('Remove bookmark');
    await tester.tap(remove.last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.deleted, isEmpty);

    await tester.tap(remove.last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove').last);
    await tester.pumpAndSettle();
    // The report's bookmark, never the report.
    expect(api.deleted, ['b2']);
    expect(find.text('LLM in education'), findsNothing);
  });

  testWidgets('a failed removal says why and keeps the item listed',
      (tester) async {
    final api = await _pump(tester)
      ..deleteError = httpFailure(500);
    await tester.tap(find.byTooltip('Remove bookmark').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove').last);
    await tester.pumpAndSettle();
    expect(api.deleted, ['b1']);
    expect(find.text('Something went wrong. Please try again.'), findsOneWidget);
    expect(find.text('Privacy budgets in federated learning'), findsOneWidget);
  });
}
