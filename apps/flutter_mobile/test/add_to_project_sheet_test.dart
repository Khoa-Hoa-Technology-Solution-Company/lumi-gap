import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/add_to_project_sheet.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

class _FakeProjectsApi extends Fake implements ProjectsApi {
  _FakeProjectsApi(this.projects);

  final List<ProjectView> projects;
  final List<(String, String)> added = [];
  Object? addError;
  Object? listError;

  /// When set, addPaper waits for the test to complete it: the request
  /// then outlives the sheet, as a real one does.
  Completer<void>? addGate;
  int listCalls = 0;

  @override
  Future<List<ProjectView>> list() async {
    listCalls++;
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (listError != null) throw listError!;
    return projects;
  }

  @override
  Future<void> addPaper(String projectId, String paperId) async {
    added.add((projectId, paperId));
    if (addGate != null) await addGate!.future;
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (addError != null) throw addError!;
  }
}

/// The list endpoint sends `papers: []` and the real count beside it.
const _listed = ProjectView(
  id: 'p1',
  title: 'Federated learning',
  paperCountFromApi: 7,
);

Future<void> _pump(WidgetTester tester, _FakeProjectsApi api) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, _) => Scaffold(
          body: Center(
            child: FilledButton(
              onPressed: () => unawaited(
                showAddToProjectSheet(context, paperId: 'paper-1'),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
      GoRoute(
        path: '/projects',
        builder: (_, _) => const Scaffold(body: Text('projects tab')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [projectsApiProvider.overrideWithValue(api)],
      child: MaterialApp.router(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        routerConfig: router,
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the paper count comes from the list payload, not papers[]',
      (tester) async {
    await _pump(tester, _FakeProjectsApi([_listed]));
    expect(find.text('7 papers'), findsOneWidget);
    expect(find.text('0 papers'), findsNothing);
  });

  testWidgets('adding closes the sheet and then says it worked',
      (tester) async {
    final api = _FakeProjectsApi([_listed]);
    await _pump(tester, api);
    await tester.tap(find.text('Federated learning'));
    await tester.pumpAndSettle();
    expect(api.added, [('p1', 'paper-1')]);
    expect(find.text('Add to project'), findsNothing);
    // The old sheet showed this through its own, already closed context:
    // the message never appeared.
    expect(find.text('Added paper to project'), findsOneWidget);
  });

  testWidgets('a failed add says why, never the raw exception',
      (tester) async {
    final api = _FakeProjectsApi([_listed])..addError = httpFailure(403);
    await _pump(tester, api);
    await tester.tap(find.text('Federated learning'));
    await tester.pumpAndSettle();
    expect(find.text('You do not have permission to do this.'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });

  testWidgets('no projects: offers to create one on the Projects tab',
      (tester) async {
    await _pump(tester, _FakeProjectsApi(const []));
    await tester.tap(find.text('Create project'));
    await tester.pumpAndSettle();
    expect(find.text('projects tab'), findsOneWidget);
  });

  testWidgets('a failed list can be retried', (tester) async {
    final api = _FakeProjectsApi([_listed])..listError = httpFailure(500);
    await _pump(tester, api);
    expect(find.textContaining('Exception'), findsNothing);
    api.listError = null;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Federated learning'), findsOneWidget);
  });

  testWidgets(
      'a request that outlives the sheet still reports success and '
      'refreshes the projects', (tester) async {
    final api = _FakeProjectsApi([_listed])..addGate = Completer<void>();
    await _pump(tester, api);
    final listsBefore = api.listCalls;
    await tester.tap(find.text('Federated learning'));
    // The sheet is gone and disposed before the server answers.
    await tester.pumpAndSettle();
    expect(find.text('Add to project'), findsNothing);
    api.addGate!.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Added paper to project'), findsOneWidget);
    expect(find.text('Something went wrong. Please try again.'), findsNothing);
    // Reopening reads the list again: the invalidate reached the app's
    // container, not the closed sheet's.
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(api.listCalls, greaterThan(listsBefore));
  });

  testWidgets('a paper already in the project says so (409)', (tester) async {
    final api = _FakeProjectsApi([_listed])..addError = httpFailure(409);
    await _pump(tester, api);
    await tester.tap(find.text('Federated learning'));
    await tester.pumpAndSettle();
    expect(
      find.text('This item already exists or was changed. Refresh and try again.'),
      findsOneWidget,
    );
  });
}
