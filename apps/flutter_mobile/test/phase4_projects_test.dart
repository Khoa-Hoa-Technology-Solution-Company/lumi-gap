import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/members_settings_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/projects_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';

class _RemoveApi extends Fake implements ProjectsApi {
  final List<String> removed = [];
  Object? error;
  Completer<void>? gate;

  @override
  Future<void> removeMember(String projectId, String memberId) async {
    removed.add(memberId);
    await gate?.future;
    // ignore: only_throw_errors, the test injects whatever the API may throw
    if (error != null) throw error!;
  }
}

/// The detail payload the backend sends today (project.service.ts).
Map<String, dynamic> _detailJson({String accessRole = 'OWNER'}) => {
      '_id': 'p1',
      'title': 'Federated learning',
      'ownerId': 'u1',
      'accessRole': accessRole,
      'memberCount': 2,
      'paperCount': 5,
      'members': [
        {
          'targetKind': 'User',
          'targetId': {'_id': 'u1', 'fullName': 'Minh Nguyen'},
          'role': 'OWNER',
          'status': 'ACTIVE',
        },
        {
          'targetKind': 'User',
          'targetId': {'_id': 'u2', 'fullName': 'Lan Tran'},
          'role': 'MEMBER',
          'status': 'ACTIVE',
        },
      ],
      'papers': <Object>[],
    };

Future<void> _pumpMembers(
  WidgetTester tester,
  ProjectView project,
  _RemoveApi api,
) async {
  tester.view
    ..physicalSize = const Size(412, 1600)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [projectsApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        theme: AppTheme.lightTheme,
        home: Scaffold(
          body: Consumer(
            builder: (context, ref, _) =>
                ProjectMembersSettingsTab(project: project, ref: ref),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('project payloads', () {
    test('members in the current API shape are read, with their role', () {
      final project = ProjectView.fromJson(_detailJson());
      expect(project.members.map((m) => m.id), ['u1', 'u2']);
      expect(project.members.map((m) => m.displayName),
          ['Minh Nguyen', 'Lan Tran']);
      expect(project.members.first.isOwnerOf(project), isTrue);
      expect(project.members.last.isOwnerOf(project), isFalse);
    });

    test('older shapes still work: {userId: {...}} and a bare id', () {
      final project = ProjectView.fromJson({
        '_id': 'p1',
        'title': 'Old',
        'members': [
          {
            'userId': {'_id': 'u9', 'fullName': 'Old Shape'},
          },
          'u8',
          {'targetKind': 'User', 'targetId': 'u7'},
        ],
      });
      expect(project.members.map((m) => m.id), ['u9', 'u8', 'u7']);
    });

    test('the list payload counts come from memberCount / paperCount', () {
      // GET /projects sends `members: []` with the real number beside it.
      final listed = ProjectView.fromJson({
        '_id': 'p1',
        'title': 'Listed',
        'accessRole': 'MEMBER',
        'memberCount': 3,
        'paperCount': 7,
        'members': <Object>[],
      });
      expect(listed.memberCount, 3);
      expect(listed.paperCount, 7);
      expect(listed.viewerIsOwner, isFalse);

      // Without the counts, the lists are counted.
      final bare = ProjectView.fromJson({
        '_id': 'p2',
        'title': 'Bare',
        'members': ['u1'],
      });
      expect(bare.memberCount, 1);
      expect(bare.paperCount, 0);
      expect(bare.viewerIsOwner, isNull);
    });

    test('ownership: the server role wins over the owner id', () {
      const byRole = ProjectView(
        id: 'p',
        title: 't',
        ownerId: 'someone-else-id-format',
        accessRole: 'OWNER',
      );
      expect(ownsProject(byRole, 'u1'), isTrue);
      const byId = ProjectView(id: 'p', title: 't', ownerId: 'u1');
      expect(ownsProject(byId, 'u1'), isTrue);
      expect(ownsProject(byId, 'u2'), isFalse);
      expect(ownsProject(const ProjectView(id: 'p', title: 't'), 'u1'), isNull);
      expect(ownsProject(byId, null), isNull);
    });
  });

  group('members tab', () {
    testWidgets('a member cannot remove anyone', (tester) async {
      final api = _RemoveApi();
      await _pumpMembers(
        tester,
        ProjectView.fromJson(_detailJson(accessRole: 'MEMBER')),
        api,
      );
      expect(find.text('Lan Tran'), findsOneWidget);
      expect(find.byTooltip('Remove member'), findsNothing);
    });

    testWidgets('the owner removes a member only after confirming',
        (tester) async {
      final api = _RemoveApi();
      await _pumpMembers(tester, ProjectView.fromJson(_detailJson()), api);
      // One remove button: the owner's own row has none.
      expect(find.byTooltip('Remove member'), findsOneWidget);

      await tester.tap(find.byTooltip('Remove member'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Remove Lan Tran'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(api.removed, isEmpty);

      await tester.tap(find.byTooltip('Remove member'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
      await tester.pumpAndSettle();
      expect(api.removed, ['u2']);
      expect(find.text('Member removed.'), findsOneWidget);
    });

    testWidgets('a failed removal says why, never the raw exception',
        (tester) async {
      final api = _RemoveApi()..error = httpFailure(403);
      await _pumpMembers(tester, ProjectView.fromJson(_detailJson()), api);
      await tester.tap(find.byTooltip('Remove member'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
      await tester.pumpAndSettle();
      expect(
        find.text('You do not have permission to do this.'),
        findsOneWidget,
      );
      expect(find.textContaining('Exception'), findsNothing);
    });
  });

  test('medal colours only for the top three', () {
    expect(LumiMedal.forRank(1), LumiMedal.gold);
    expect(LumiMedal.forRank(2), LumiMedal.silver);
    expect(LumiMedal.forRank(3), LumiMedal.bronze);
    expect(LumiMedal.forRank(4), isNull);
    expect(LumiMedal.forRank(0), isNull);
  });
}
