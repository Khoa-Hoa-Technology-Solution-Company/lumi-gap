import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_actions_panel.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeBookmarksApi extends Fake implements BookmarksApi {
  bool saved = false;
  int listCalls = 0;
  int createCalls = 0;

  /// When set, create waits for the test: the request outlives the screen.
  Completer<void>? createGate;

  @override
  Future<List<Bookmark>> list() async {
    listCalls++;
    return [
      if (saved) const Bookmark(id: 'b1', targetKind: 'paper', targetId: 'p1'),
    ];
  }

  @override
  Future<BookmarkStatus> checkStatus(String targetKind, String targetId) async =>
      BookmarkStatus(bookmarked: saved, bookmarkId: saved ? 'b1' : null);

  @override
  Future<Bookmark> create({
    required String targetKind,
    required String targetId,
  }) async {
    createCalls++;
    await createGate?.future;
    saved = true;
    return Bookmark(id: 'b1', targetKind: targetKind, targetId: targetId);
  }
}

const _paper = Paper(
  id: 'p1',
  title: 'A paper',
  publicationYear: 2024,
  citationCount: 0,
  dataStatus: 'ready',
  dataQualityScore: 0,
  isAiAnalyzable: false,
  createdAt: '',
  updatedAt: '',
);

/// A list screen that keeps [bookmarksProvider] alive (as Search does), with
/// a button that opens the paper's actions on a page of its own.
Future<void> _pump(WidgetTester tester, _FakeBookmarksApi api) async {
  tester.view
    ..physicalSize = const Size(412, 2000)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [bookmarksApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: Consumer(
          builder: (context, ref, _) {
            final saved = ref.watch(bookmarksProvider).value?.length ?? 0;
            return Scaffold(
              body: Column(
                children: [
                  Text('list saved: $saved'),
                  FilledButton(
                    onPressed: () => unawaited(
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => Scaffold(
                            appBar: AppBar(),
                            body: const SingleChildScrollView(
                              child: PaperActionsPanel(
                                paper: _paper,
                                paperId: 'p1',
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    child: const Text('open'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('saving here refreshes the saved list other screens show',
      (tester) async {
    final api = _FakeBookmarksApi();
    await _pump(tester, api);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Saved'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    // The list screen behind it no longer shows a stale "not saved".
    expect(find.text('list saved: 1'), findsOneWidget);
  });

  testWidgets('leaving before the save finishes throws nothing',
      (tester) async {
    final api = _FakeBookmarksApi()..createGate = Completer<void>();
    await _pump(tester, api);
    await tester.tap(find.text('Save'));
    await tester.pump();
    await tester.pageBack();
    await tester.pumpAndSettle();
    api.createGate!.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(api.createCalls, 1);
    expect(find.text('list saved: 1'), findsOneWidget);
  });
}
