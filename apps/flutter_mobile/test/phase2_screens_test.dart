import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_avatar.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/core/widgets/paper_card.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/home_screen.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/profile/presentation/profile_screen.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/create_project_sheet.dart';
import 'package:flutter_mobile/features/projects/presentation/projects_screen.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';
import 'i18n_support.dart';

// ---------------------------------------------------------------- fakes ----

class _FakeProjectsApi extends Fake implements ProjectsApi {
  _FakeProjectsApi({List<ProjectView>? projects})
      : projects = projects ?? <ProjectView>[];

  List<ProjectView> projects;
  Object? listError;
  Object? createError;
  Completer<void>? createGate;
  int listCalls = 0;
  final List<({String title, String? description, String? key})> creates = [];

  @override
  Future<List<ProjectView>> list() async {
    listCalls++;
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (listError != null) throw listError!;
    return projects;
  }

  @override
  Future<ProjectView> create(
    String title,
    String? description, {
    String? idempotencyKey,
  }) async {
    creates.add((title: title, description: description, key: idempotencyKey));
    await createGate?.future;
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (createError != null) throw createError!;
    final project = ProjectView(id: 'new', title: title, ownerId: 'u1');
    projects = [...projects, project];
    return project;
  }
}

class _FakeBookmarksApi extends Fake implements BookmarksApi {
  final statusGate = Completer<BookmarkStatus>();
  int statusCalls = 0;

  @override
  Future<BookmarkStatus> checkStatus(String targetKind, String targetId) {
    statusCalls++;
    return statusGate.future;
  }
}

class _LogoutSpy extends FakeAuthController {
  // ignore: use_super_parameters, the super parameter is private (_user)
  _LogoutSpy(User? user) : super(user);
  int logouts = 0;

  @override
  Future<void> logout() async {
    logouts++;
  }
}

ProjectView _project(String id, {String? owner, String? description}) =>
    ProjectView(
      id: id,
      title: 'Project $id',
      ownerId: owner,
      description: description,
    );

Widget _app(
  Widget home, {
  required List<Override> overrides,
  AppLocale locale = AppLocale.en,
  Brightness brightness = Brightness.light,
  double textScale = 1,
}) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => home),
      for (final path in [
        '/project/:id',
        '/projects',
        '/bookmarks',
        '/reports',
        '/rankings',
        '/submit-paper',
        '/my-papers',
        '/admin/sync',
        '/paper/:id',
        '/trends',
        '/notifications',
      ])
        GoRoute(
          path: path,
          builder: (_, s) => Scaffold(body: Text('route:${s.uri.path}')),
        ),
    ],
  );
  return ProviderScope(
    // A new scope for every pump: one test may show two screens in turn,
    // each with its own set of overrides.
    key: UniqueKey(),
    overrides: overrides,
    child: MaterialApp.router(
      routerConfig: router,
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
    ),
  );
}

void _setSize(WidgetTester tester, Size size) {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<_FakeProjectsApi> _pumpProjects(
  WidgetTester tester, {
  _FakeProjectsApi? api,
  User? user,
  AppLocale locale = AppLocale.en,
  Brightness brightness = Brightness.light,
  double textScale = 1,
}) async {
  final fake = api ?? _FakeProjectsApi();
  await tester.pumpWidget(
    _app(
      const ProjectsScreen(),
      locale: locale,
      brightness: brightness,
      textScale: textScale,
      overrides: [
        authControllerProvider
            .overrideWith(() => FakeAuthController(user ?? testUser())),
        projectsApiProvider.overrideWithValue(fake),
        notificationsProvider.overrideWith((ref) async => <AppNotification>[]),
      ],
    ),
  );
  await tester.pumpAndSettle();
  return fake;
}

Future<_LogoutSpy> _pumpProfile(
  WidgetTester tester,
  User user, {
  AppLocale locale = AppLocale.en,
  Brightness brightness = Brightness.light,
  double textScale = 1,
}) async {
  final auth = _LogoutSpy(user);
  await tester.pumpWidget(
    _app(
      const ProfileScreen(),
      locale: locale,
      brightness: brightness,
      textScale: textScale,
      overrides: [
        authControllerProvider.overrideWith(() => auth),
        bookmarksProvider.overrideWith((ref) async => <Bookmark>[]),
        reportsProvider.overrideWith(
          (ref, params) async => const ReportsList(reports: [], total: 3),
        ),
      ],
    ),
  );
  await tester.pumpAndSettle();
  return auth;
}

void main() {
  // ------------------------------------------------------------ helpers ----
  group('helpers', () {
    test('lumiInitials', () {
      expect(lumiInitials('Tran Thi B'), 'TB');
      expect(lumiInitials('  minh  '), 'M');
      expect(lumiInitials('Đỗ Ánh'), 'ĐÁ');
      expect(lumiInitials(''), '?');
      expect(lumiInitials('   '), '?');
      expect(lumiInitials(null), '?');
    });

    test('newIdempotencyKey is a version-4 UUID and never repeats', () {
      final pattern = RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      );
      final keys = {for (var i = 0; i < 200; i++) newIdempotencyKey()};
      expect(keys, hasLength(200));
      for (final key in keys) {
        expect(pattern.hasMatch(key), isTrue, reason: key);
      }
    });

    test('failureMessageKey never returns the server text', () {
      expect(
        failureMessageKey(networkFailure()),
        'Could not connect. Check your network and try again.',
      );
      expect(
        failureMessageKey(httpFailure(429)),
        'Too many attempts. Please try again later.',
      );
      expect(
        failureMessageKey(httpFailure(403)),
        'You do not have permission to do this.',
      );
      expect(failureMessageKey(httpFailure(404)), 'This item no longer exists.');
      expect(
        failureMessageKey(httpFailure(400)),
        'Some details were not accepted. Check them and try again.',
      );
      for (final error in <Object>[httpFailure(500), StateError('x')]) {
        expect(
          failureMessageKey(error),
          'Something went wrong. Please try again.',
        );
      }
      // Every message is translated.
      for (final error in <Object>[
        networkFailure(),
        httpFailure(429),
        httpFailure(403),
        httpFailure(404),
        httpFailure(400),
        httpFailure(500),
      ]) {
        final key = failureMessageKey(error);
        expect(vi(key), isNot(key), reason: key);
      }
    });

    test('project validators follow the backend createProjectSchema', () {
      expect(validateProjectTitle(null), 'Please enter a project title');
      expect(validateProjectTitle('   '), 'Please enter a project title');
      expect(validateProjectTitle(' a '), isNull);
      expect(validateProjectTitle('a' * 100), isNull);
      // Trimmed first, as the backend does.
      expect(validateProjectTitle('  ${'a' * 100}  '), isNull);
      expect(
        validateProjectTitle('a' * 101),
        'Project title must be at most 100 characters',
      );
      expect(validateProjectDescription(null), isNull);
      expect(validateProjectDescription(''), isNull);
      expect(validateProjectDescription('a' * 5000), isNull);
      expect(
        validateProjectDescription('a' * 5001),
        'Description must be at most 5000 characters',
      );
    });

    test('project filters use ownership from the API only', () {
      final mine = _project('a', owner: 'u1');
      final theirs = _project('b', owner: 'u2');
      final all = [mine, theirs];
      expect(filterProjects(all, ProjectFilter.all, 'u1'), all);
      expect(filterProjects(all, ProjectFilter.mine, 'u1'), [mine]);
      expect(filterProjects(all, ProjectFilter.joined, 'u1'), [theirs]);
      expect(filterProjects(const [], ProjectFilter.mine, 'u1'), isEmpty);

      expect(canFilterProjects(all, 'u1'), isTrue);
      expect(canFilterProjects(all, null), isFalse);
      expect(canFilterProjects([mine, _project('c')], 'u1'), isFalse);
      expect(canFilterProjects([_project('d', owner: '')], 'u1'), isFalse);
    });
  });

  // ----------------------------------------------------------- widgets ----
  group('PaperCard', () {
    Future<void> pump(WidgetTester tester, PaperCard card) => tester.pumpWidget(
          ProviderScope(
            overrides: [
              bookmarkStatusProvider.overrideWith(
                (ref, target) async => const BookmarkStatus(bookmarked: true),
              ),
            ],
            child: MaterialApp(
              theme: AppTheme.lightTheme,
              home: Scaffold(body: SingleChildScrollView(child: card)),
            ),
          ),
        );

    testWidgets('missing fields are left out, never "Unknown"', (tester) async {
      await pump(
        tester,
        PaperCard(id: 'p', title: 'Only a title', onTap: () {}, authors: '  '),
      );
      await tester.pumpAndSettle();
      expect(find.text('Only a title'), findsOneWidget);
      expect(find.byType(Text), findsOneWidget);
      expect(find.byType(IconButton), findsNothing);
      expect(find.byType(LumiChip), findsNothing);
    });

    testWidgets('bookmark is a 48dp target that reflects the saved state',
        (tester) async {
      var taps = 0;
      await pump(
        tester,
        PaperCard(
          id: 'p',
          title: 'A title',
          chip: 'Machine Learning',
          authors: 'A. Author',
          venueAndYear: 'Venue · 2026',
          score: '87',
          onTap: () {},
          onBookmarkTap: () => taps++,
        ),
      );
      await tester.pumpAndSettle();
      final size = tester.getSize(find.byType(IconButton));
      expect(size.width, greaterThanOrEqualTo(48));
      expect(size.height, greaterThanOrEqualTo(48));
      expect(find.byIcon(Icons.bookmark), findsOneWidget);
      expect(find.byTooltip('Remove bookmark'), findsOneWidget);
      await tester.tap(find.byType(IconButton));
      expect(taps, 1);
      expect(find.text('Machine Learning'), findsOneWidget);
      expect(find.text('87'), findsOneWidget);
    });
  });

  // ---------------------------------------------------------- projects ----
  group('projects screen', () {
    testWidgets('loading shows a skeleton, then the list', (tester) async {
      final api = _FakeProjectsApi(projects: [_project('a', owner: 'u1')]);
      await tester.pumpWidget(
        _app(
          const ProjectsScreen(),
          overrides: [
            authControllerProvider
                .overrideWith(() => FakeAuthController(testUser())),
            projectsApiProvider.overrideWithValue(api),
            notificationsProvider
                .overrideWith((ref) async => <AppNotification>[]),
          ],
        ),
      );
      expect(find.byType(LumiSkeleton), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.byType(LumiSkeleton), findsNothing);
      expect(find.text('Project a'), findsOneWidget);
    });

    testWidgets('no projects: explains and offers to create one',
        (tester) async {
      await _pumpProjects(tester);
      expect(find.byType(LumiEmptyState), findsOneWidget);
      expect(find.byType(SegmentedButton<ProjectFilter>), findsNothing);
      await tester.tap(find.widgetWithText(FilledButton, 'Create project'));
      await tester.pumpAndSettle();
      expect(find.text('Project title'), findsOneWidget);
    });

    testWidgets('filters: all / mine / joined, with their own empty text',
        (tester) async {
      await _pumpProjects(
        tester,
        api: _FakeProjectsApi(
          projects: [
            _project('a', owner: 'u1', description: 'About a'),
            _project('b', owner: 'u1'),
          ],
        ),
      );
      expect(find.text('Project a'), findsOneWidget);
      expect(find.text('About a'), findsOneWidget);
      expect(find.text('Owner'), findsNWidgets(2));
      // An empty description is left out, not replaced by a placeholder.
      expect(find.textContaining('No description'), findsNothing);

      await tester.tap(find.text('Joined'));
      await tester.pumpAndSettle();
      expect(find.text('Project a'), findsNothing);
      expect(find.text('You have not joined a project yet.'), findsOneWidget);
      // Nothing to create from the "joined" list.
      expect(find.widgetWithText(FilledButton, 'Create project'), findsNothing);

      await tester.tap(find.text('Mine'));
      await tester.pumpAndSettle();
      expect(find.text('Project a'), findsOneWidget);
      expect(find.text('Project b'), findsOneWidget);
    });

    testWidgets('a member sees "Member"; unknown ownership hides the filters',
        (tester) async {
      await _pumpProjects(
        tester,
        api: _FakeProjectsApi(projects: [_project('a', owner: 'other')]),
      );
      expect(find.text('Member'), findsOneWidget);
      expect(find.text('Owner'), findsNothing);

      await _pumpProjects(
        tester,
        api: _FakeProjectsApi(projects: [_project('z')]),
      );
      expect(find.text('Project z'), findsOneWidget);
      expect(find.byType(SegmentedButton<ProjectFilter>), findsNothing);
      expect(find.text('Owner'), findsNothing);
      expect(find.text('Member'), findsNothing);
    });

    testWidgets('load failure: translated message, retry reloads',
        (tester) async {
      final api = _FakeProjectsApi()..listError = networkFailure();
      await _pumpProjects(tester, api: api);
      expect(
        find.text('Could not connect. Check your network and try again.'),
        findsOneWidget,
      );
      expect(find.textContaining('Exception'), findsNothing);

      api
        ..listError = null
        ..projects = [_project('a', owner: 'u1')];
      // Riverpod also retries a failed provider on its own, so only the
      // effect of the tap is checked: one more request, and the list.
      final before = api.listCalls;
      await tester.tap(find.text('Try again'));
      await tester.pump();
      await tester.pump();
      expect(api.listCalls, before + 1);
      expect(find.text('Project a'), findsOneWidget);
    });

    testWidgets('tapping a project opens it', (tester) async {
      await _pumpProjects(
        tester,
        api: _FakeProjectsApi(projects: [_project('a', owner: 'u1')]),
      );
      await tester.tap(find.text('Project a'));
      await tester.pumpAndSettle();
      expect(find.text('route:/project/a'), findsOneWidget);
    });
  });

  group('create project sheet', () {
    Future<_FakeProjectsApi> open(
      WidgetTester tester, {
      _FakeProjectsApi? api,
    }) async {
      final fake = await _pumpProjects(tester, api: api);
      // The screen's one create action is its FAB.
      await tester.tap(find.widgetWithText(FloatingActionButton, 'Create project'));
      await tester.pumpAndSettle();
      return fake;
    }

    Finder field(String label) => find.descendant(
          of: find.byWidgetPredicate(
            (w) => w is LumiTextField && w.label == label,
          ),
          matching: find.byType(TextField),
        );

    testWidgets('empty title is refused under the field, nothing is sent',
        (tester) async {
      final api = await open(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Create'));
      await tester.pump();
      expect(find.text('Please enter a project title'), findsOneWidget);
      expect(api.creates, isEmpty);
    });

    testWidgets('success: trimmed values, sheet closes, list reloads, opens it',
        (tester) async {
      final api = await open(tester);
      await tester.enterText(field('Project title'), '  Federated learning ');
      await tester.enterText(field('Description'), '   ');
      await tester.tap(find.widgetWithText(FilledButton, 'Create'));
      await tester.pumpAndSettle();

      expect(api.creates.single.title, 'Federated learning');
      // A blank description is not sent at all.
      expect(api.creates.single.description, isNull);
      expect(api.creates.single.key, isNotNull);
      expect(api.listCalls, 2);
      expect(find.text('route:/project/new'), findsOneWidget);
    });

    testWidgets('two taps in one frame create one project', (tester) async {
      final gate = Completer<void>();
      final api = await open(tester, api: _FakeProjectsApi()..createGate = gate);
      await tester.enterText(field('Project title'), 'One');
      final create = find.widgetWithText(FilledButton, 'Create');
      await tester.tap(create);
      await tester.tap(create);
      await tester.pump();
      expect(find.text('Creating…'), findsOneWidget);
      expect(api.creates, hasLength(1));

      gate.complete();
      await tester.pumpAndSettle();
      expect(api.creates, hasLength(1));
    });

    testWidgets(
        'failure keeps the sheet and the text; retry reuses the key, '
        'changed details get a new one', (tester) async {
      final api =
          await open(tester, api: _FakeProjectsApi()..createError = networkFailure());
      await tester.enterText(field('Project title'), 'Draft');
      await tester.tap(find.widgetWithText(FilledButton, 'Create'));
      await tester.pumpAndSettle();
      expect(
        find.text('Could not connect. Check your network and try again.'),
        findsOneWidget,
      );
      expect(find.text('Draft'), findsOneWidget);
      // The list was not reloaded and nothing was opened.
      expect(api.listCalls, 1);

      // Same details again: same key, so the server cannot create twice.
      await tester.tap(find.widgetWithText(FilledButton, 'Create'));
      await tester.pumpAndSettle();
      expect(api.creates[1].key, api.creates[0].key);

      // Different details: a new key.
      await tester.enterText(field('Project title'), 'Draft 2');
      api.createError = null;
      await tester.tap(find.widgetWithText(FilledButton, 'Create'));
      await tester.pumpAndSettle();
      expect(api.creates[2].key, isNot(api.creates[0].key));
      expect(find.text('route:/project/new'), findsOneWidget);
    });

    testWidgets('cancel closes without creating', (tester) async {
      final api = await open(tester);
      await tester.enterText(field('Project title'), 'Never');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(api.creates, isEmpty);
      expect(find.text('Project title'), findsNothing);
      expect(api.listCalls, 1);
    });
  });

  // ----------------------------------------------------------- profile ----
  group('profile screen', () {
    testWidgets('shows what the account really is, nothing invented',
        (tester) async {
      _setSize(tester, const Size(412, 1600));
      await _pumpProfile(tester, testUser());
      expect(find.text('Minh Nguyen'), findsOneWidget);
      expect(find.text('minh@fpt.edu.vn'), findsOneWidget);
      // No academic profile, no institution, an ordinary account: no chip,
      // no made-up university, no raw role name.
      expect(find.byType(LumiChip), findsNothing);
      expect(find.textContaining('FPT University'), findsNothing);
      expect(find.text('USER'), findsNothing);
      expect(find.text('Reports'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
    });

    testWidgets('academic profile, staff role and institution when present',
        (tester) async {
      _setSize(tester, const Size(412, 1600));
      await _pumpProfile(
        tester,
        User(
          id: 'u1',
          email: 'a@b.vn',
          fullName: 'An Admin',
          createdAt: DateTime.utc(2026),
          role: UserRole.admin,
          academicProfileType: AcademicProfileType.lecturer,
          institution: 'LumiGap Research Lab',
        ),
      );
      expect(find.widgetWithText(LumiChip, 'Lecturer'), findsOneWidget);
      expect(find.widgetWithText(LumiChip, 'Admin'), findsOneWidget);
      expect(find.text('LumiGap Research Lab'), findsOneWidget);
      expect(find.widgetWithText(LumiListRow, 'Admin sync'), findsOneWidget);
    });

    testWidgets('a blank name falls back to the email, shown once',
        (tester) async {
      _setSize(tester, const Size(412, 1600));
      await _pumpProfile(
        tester,
        User(
          id: 'u1',
          email: 'only@mail.vn',
          fullName: '  ',
          createdAt: DateTime.utc(2026),
        ),
      );
      expect(find.text('only@mail.vn'), findsOneWidget);
    });

    testWidgets('menu has no rows that duplicate the navigation, no dead rows',
        (tester) async {
      _setSize(tester, const Size(412, 1600));
      await _pumpProfile(tester, testUser());
      // Projects has its own tab; Rankings and Submit paper have one entry
      // each (Home shortcut, My papers). Notifications is a row here: the
      // bell is on Home only.
      for (final label in [
        'Projects',
        'Font size',
        'Leaderboard',
        'Rankings',
        'Submit paper',
      ]) {
        expect(find.widgetWithText(LumiListRow, label), findsNothing);
      }
      expect(find.widgetWithText(LumiListRow, 'Admin sync'), findsNothing);
      // Every row does something.
      for (final row in tester.widgetList<LumiListRow>(find.byType(LumiListRow))) {
        expect(row.onTap, isNotNull, reason: row.title);
      }
      await tester.tap(find.widgetWithText(LumiListRow, 'My papers'));
      await tester.pumpAndSettle();
      expect(find.text('route:/my-papers'), findsOneWidget);
    });

    testWidgets('Notifications is one row, the bell being on Home only',
        (tester) async {
      _setSize(tester, const Size(412, 1600));
      await _pumpProfile(tester, testUser());
      expect(find.widgetWithText(LumiListRow, 'Notifications'), findsOneWidget);
      await tester.tap(find.widgetWithText(LumiListRow, 'Notifications'));
      await tester.pumpAndSettle();
      expect(find.text('route:/notifications'), findsOneWidget);
    });

    testWidgets('sign out asks first; cancel keeps the session', (tester) async {
      _setSize(tester, const Size(412, 1600));
      final auth = await _pumpProfile(tester, testUser());
      await tester.tap(find.widgetWithText(LumiListRow, 'Sign out'));
      await tester.pumpAndSettle();
      expect(find.text('Do you want to sign out of LumiGap?'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(auth.logouts, 0);

      // Two taps in one frame open one sheet and sign out once.
      final row = find.widgetWithText(LumiListRow, 'Sign out');
      await tester.tap(row);
      await tester.tap(row, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.byType(BottomSheet), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
      await tester.pumpAndSettle();
      expect(auth.logouts, 1);
    });
  });

  // -------------------------------------------------------------- home ----
  group('home screen', () {
    Future<_FakeBookmarksApi> pumpHome(
      WidgetTester tester, {
      required Map<String, dynamic> overview,
      List<Object> recommendations = const [],
    }) async {
      _setSize(tester, const Size(412, 3000));
      final bookmarks = _FakeBookmarksApi();
      await tester.pumpWidget(
        _app(
          const HomeScreen(),
          overrides: [
            authControllerProvider
                .overrideWith(() => FakeAuthController(testUser())),
            notificationsProvider
                .overrideWith((ref) async => <AppNotification>[]),
            bookmarkStatusProvider.overrideWith(
              (ref, target) async => const BookmarkStatus(bookmarked: false),
            ),
            bookmarksProvider.overrideWith((ref) async => <Bookmark>[]),
            bookmarksApiProvider.overrideWithValue(bookmarks),
            homeOverviewProvider
                .overrideWith((ref) async => HomeOverview.fromJson(overview)),
            homeResearchProvider.overrideWith(
              (ref) async => HomeResearchOverview.fromJson({
                'currentUser': {'id': 'u1', 'name': 'Minh Nguyen'},
                'workspace': {
                  'status': 'ready',
                  'data': {'continueResearch': <Object>[], 'attention': <Object>[]},
                },
                'recommendations': {'status': 'ready', 'data': recommendations},
              }),
            ),
          ],
        ),
      );
      await tester.pumpAndSettle();
      return bookmarks;
    }

    testWidgets('greeting; empty projects lead to the tab',
        (tester) async {
      await pumpHome(tester, overview: const {});
      expect(find.text('Hello, Minh Nguyen'), findsOneWidget);
      // A section with a way to fill it explains itself; "To do" with
      // nothing to do takes no room.
      expect(find.byType(LumiEmptyState), findsWidgets);
      expect(find.byIcon(Icons.task_alt), findsNothing);
      await tester.tap(find.text('Go to projects'));
      await tester.pumpAndSettle();
      expect(find.text('route:/projects'), findsOneWidget);
    });

    testWidgets(
        'bookmark: a second tap while the first is in flight is ignored, '
        'and a failure is reported', (tester) async {
      final api = await pumpHome(
        tester,
        overview: const {},
        recommendations: [
          {'id': 'p1', 'title': 'Paper one', 'reason': 'interest'},
        ],
      );
      expect(find.text('Paper one'), findsOneWidget);
      // Venue and authors are missing: nothing stands in for them.
      expect(find.textContaining('Unknown'), findsNothing);

      final bookmark = find.byTooltip('Bookmark');
      await tester.tap(bookmark);
      await tester.tap(bookmark);
      await tester.pump();
      expect(api.statusCalls, 1);

      api.statusGate.completeError(networkFailure());
      await tester.pump();
      await tester.pump();
      expect(
        find.text('Could not update the bookmark. Please try again.'),
        findsOneWidget,
      );

      // The guard is released: the next tap goes through again.
      await tester.tap(bookmark);
      await tester.pump();
      expect(api.statusCalls, 2);
    });
  });

  // ------------------------------------------------------------ layout ----
  group('layout', () {
    for (final locale in AppLocale.values) {
      for (final brightness in Brightness.values) {
        testWidgets(
          'projects + profile fit 320dp at text scale 1.3 '
          '(${locale.name}, ${brightness.name})',
          (tester) async {
            _setSize(tester, const Size(320, 640));
            await _pumpProjects(
              tester,
              locale: locale,
              brightness: brightness,
              textScale: 1.3,
              api: _FakeProjectsApi(
                projects: [
                  _project(
                    'a',
                    owner: 'u1',
                    description: 'A long description ' * 6,
                  ),
                  _project('b', owner: 'other'),
                ],
              ),
            );
            expect(tester.takeException(), isNull);
            await tester.tap(
              find.widgetWithText(
                FloatingActionButton,
                translate('Create project', locale),
              ),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);

            await _pumpProfile(
              tester,
              User(
                id: 'u1',
                email: 'a.very.long.address@university.example.edu.vn',
                fullName: 'Nguyễn Thị Minh Anh Hoàng',
                createdAt: DateTime.utc(2026),
                role: UserRole.admin,
                academicProfileType: AcademicProfileType.researcher,
                institution: 'A University With A Very Long Official Name',
              ),
              locale: locale,
              brightness: brightness,
              textScale: 1.3,
            );
            expect(tester.takeException(), isNull);
            for (final e in find.byType(LumiListRow).evaluate()) {
              expect(e.size!.height, greaterThanOrEqualTo(56));
            }
          },
        );
      }
    }
  });
}
