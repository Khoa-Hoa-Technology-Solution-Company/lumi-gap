import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_members_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail_screen.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';
import 'support/readable_text.dart';
import 'team_chat_support.dart';

/// Characterization test for the project workspace screen, written before it
/// was split into `project_detail/` (Phase 5): it records what every tab
/// shows and how the chat sends, so the refactor can be proved behaviour-
/// neutral by running the same test before and after.

class _FakeProjectsApi extends Fake implements ProjectsApi {
  final List<({String text, String scope})> aiSends = [];
  final List<String> deleted = [];
  final List<String> removedPapers = [];

  @override
  Future<void> delete(String projectId) async => deleted.add(projectId);

  @override
  Future<void> removePaper(String projectId, String paperId) async =>
      removedPapers.add(paperId);

  @override
  Future<void> sendChat(
    String projectId,
    String content, {
    String scope = 'private',
  }) async {
    aiSends.add((text: content, scope: scope));
  }
}

/// Everything the screen talks to: the AI chat API, the live team chat API
/// and the timers of the team chat controller.
class _Fakes {
  final projects = _FakeProjectsApi();
  final chat = FakeTeamChatApi();
  final timers = ManualTimers();
  final _readied = <int>{};

  /// Texts sent to the team chat.
  List<String> get teamSends => chat.sendCalls.map((c) => c.content).toList();

  /// Messages sent to the AI: scope and text.
  List<({String text, String scope})> get aiSends => projects.aiSends;
}

_Fakes? _active;

/// The team chat opens its live connection when the Chat tab is shown; the
/// server then says `ready` and the history loads. Do that for every new
/// connection.
Future<void> _deliverReady(WidgetTester tester) async {
  final fakes = _active;
  if (fakes == null) return;
  for (var i = 0; i < fakes.chat.streams.length; i++) {
    if (fakes._readied.add(i) && fakes.chat.streams[i].hasListener) {
      fakes.chat.streams[i].add(chatEvent(TeamChatEventType.ready));
      await tester.pumpAndSettle();
    }
  }
}

/// Fixtures are built relative to today so the "Hôm nay" separator holds on
/// any day.
final _today = DateTime.now();

const _project = ProjectView(
  id: 'p1',
  title: 'Học liên kết trong y tế',
  description: 'Mô tả dự án',
  ownerId: 'u1',
  members: [
    ProjectMemberRef(id: 'u1', displayName: 'Minh Nguyen'),
    ProjectMemberRef(id: 'u2', displayName: 'Lan Tran'),
  ],
  papers: [
    ProjectPaperRef(
      id: 'pa1',
      title: 'Federated Learning Survey',
      publicationYear: 2024,
      citationCount: 12,
    ),
    ProjectPaperRef(id: 'pa2', title: 'Privacy in Medical FL'),
  ],
);

const _emptyProject = ProjectView(id: 'p2', title: 'Dự án trống');

Future<_Fakes> _pump(
  WidgetTester tester, {
  ProjectView project = _project,
  bool messages = true,
  double width = 412,
  Brightness brightness = Brightness.light,
  bool withRouter = false,
  bool withReport = true,
}) async {
  final fakes = _active = _Fakes();
  fakes.chat.onList = (_, _) async => messages
      ? [
          chatMessage(
            'm1',
            content: 'Chào cả nhóm',
            at: DateTime(_today.year, _today.month, _today.day, 9),
          ),
        ]
      : <TeamChatMessage>[];
  tester.view
    ..physicalSize = Size(width * 2, 892 * 2)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(
          () => FakeAuthController(testUser()),
        ),
        projectsApiProvider.overrideWithValue(fakes.projects),
        teamChatApiProvider.overrideWithValue(fakes.chat),
        teamChatEnvProvider.overrideWithValue(testEnv(fakes.timers)),
        projectProvider.overrideWith((ref, id) async => project),
        projectChatProvider.overrideWith(
          (ref, query) async => messages
              ? [
                  ProjectChatMessage(
                    id: 'a1',
                    role: 'assistant',
                    content: 'Đây là câu trả lời của AI',
                    createdAt: DateTime(2026, 11, 8, 10).toIso8601String(),
                  ),
                ]
              : <ProjectChatMessage>[],
        ),
        reportsProvider.overrideWith(
          (ref, params) async => withReport
              ? const ReportsList(
                  reports: [
                    ReportListItem(
                      id: 'r1',
                      query: 'federated learning',
                      status: 'ready',
                      topic: 'Báo cáo thử',
                    ),
                  ],
                  total: 1,
                )
              : const ReportsList(reports: [], total: 0),
        ),
        gapsProvider.overrideWith(
          (ref, params) async => const ListGapsResponse(data: [], total: 0),
        ),
      ],
      child: withRouter
          ? MaterialApp.router(
              locale: AppLocale.en.locale,
              supportedLocales: AppLocale.supportedLocales,
              localizationsDelegates: appLocalizationsDelegates,
              theme: AppTheme.lightTheme,
              routerConfig: GoRouter(
                initialLocation: '/project/p1',
                routes: [
                  GoRoute(
                    path: '/projects',
                    builder: (_, _) => const Scaffold(body: Text('projects list')),
                  ),
                  GoRoute(
                    path: '/project/:id',
                    builder: (_, _) => const ProjectDetailScreen(id: 'p1'),
                  ),
                ],
              ),
            )
          : MaterialApp(
              locale: AppLocale.en.locale,
              supportedLocales: AppLocale.supportedLocales,
              localizationsDelegates: appLocalizationsDelegates,
              // The app's own theme: the default Material one would test
              // colours the app never shows.
              theme: brightness == Brightness.dark
                  ? AppTheme.darkTheme
                  : AppTheme.lightTheme,
              home: const ProjectDetailScreen(id: 'p1'),
            ),
    ),
  );
  await tester.pumpAndSettle();
  return fakes;
}

/// `flutter test --dart-define=RECORD=true test/project_detail_screen_test.dart`
/// prints the current output as `REC|...` lines instead of asserting, to
/// refresh the expectations below after an intentional UI change.
const _record = bool.fromEnvironment('RECORD');

/// Everything readable on screen, sorted, so the check does not depend on
/// widget-tree shape.
List<String> _texts(WidgetTester tester) {
  final out = <String>[];
  for (final w in tester.widgetList<Text>(find.byType(Text))) {
    final data = w.data ?? w.textSpan?.toPlainText();
    if (data != null && data.trim().isNotEmpty) out.add(data);
  }
  return out..sort();
}

/// Layout errors raised while the test runs, collected instead of failing so
/// the tests can assert on them (the expectation is: none).
final _errors = <String>[];

String _summary(FlutterErrorDetails d) {
  final m = RegExp(
    r'overflowed by ([\d.]+) pixels',
  ).firstMatch(d.exceptionAsString());
  if (m != null) return 'overflow ${m.group(1)}px';
  return d.exceptionAsString().trim().split(' ').take(8).join(' ');
}

void _screenTest(String name, Future<void> Function(WidgetTester tester) body) {
  testWidgets(name, (tester) async {
    _errors.clear();
    final previous = FlutterError.onError;
    FlutterError.onError = (details) => _errors.add(_summary(details));
    try {
      await body(tester);
    } finally {
      FlutterError.onError = previous;
    }
  });
}

/// Opens one view of the workspace. Four are tabs; the AI assistant is the
/// second view of the Chat tab; Members is a screen pushed from the app-bar
/// overflow (it is closed again before another view opens).
Future<void> _openTab(WidgetTester tester, String name) async {
  if (find.byType(ProjectMembersScreen).evaluate().isNotEmpty) {
    await tester.pageBack();
    await tester.pumpAndSettle();
  }
  if (name == 'Members') {
    await tester.tap(find.byTooltip('More project actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Members').last);
    await tester.pumpAndSettle();
    return;
  }
  final tabName = name == 'AI assistant' ? 'Chat' : name;
  final tab = find.descendant(
    of: find.byType(TabBar),
    matching: find.text(tabName),
  );
  await tester.ensureVisible(tab);
  await tester.tap(tab);
  await tester.pumpAndSettle();
  if (tabName != 'Chat') return;
  await tester.tap(find.text(name == 'Chat' ? 'Team chat' : 'AI assistant'));
  await tester.pumpAndSettle();
  if (name == 'Chat') await _deliverReady(tester);
}

/// The send button of either chat (the team chat and the AI tab use
/// different icons).
Finder _sendIcon() => find.byWidgetPredicate(
  (w) => w is Icon && (w.icon == Icons.send || w.icon == Icons.send_rounded),
);

Future<void> _dispose(WidgetTester tester) async {
  // Stops the 5s chat poller.
  await tester.pumpWidget(const SizedBox());
}

void _check(String key, Object actual, Object? expected) {
  if (_record) {
    // ignore: avoid_print (only in RECORD mode, to refresh the expectations)
    print('REC|$key|${jsonEncode(actual)}');
  } else {
    expect(actual, expected, reason: key);
  }
}

/// Every view of the workspace, in the order the tests walk them.
const _tabs = [
  'Overview',
  'Papers',
  'Chat',
  'AI assistant',
  'Outputs',
  'Members',
];

void main() {
  _screenTest('has the four tabs in order', (tester) async {
    await _pump(tester);
    final labels = tester
        .widgetList<Tab>(find.byType(Tab))
        .map((t) => t.text)
        .toList();
    expect(labels, ['Overview', 'Papers', 'Chat', 'Outputs']);
    expect(find.text('Học liên kết trong y tế'), findsWidgets);
    await _dispose(tester);
  });

  for (final tab in _tabs) {
    _screenTest('$tab tab content is unchanged', (tester) async {
      await _pump(tester);
      await _openTab(tester, tab);
      _check('full|$tab', _texts(tester), _expected[tab]);
      expect(_errors, isEmpty, reason: '$tab: layout errors');
      await _dispose(tester);
    });
  }

  _screenTest('empty project: tabs render their empty states', (tester) async {
    await _pump(tester, project: _emptyProject, messages: false);
    for (final tab in _tabs) {
      await _openTab(tester, tab);
      _check('empty|$tab', _texts(tester), _expectedEmpty[tab]);
    }
    expect(_errors, isEmpty, reason: 'empty project: layout errors');
    await _dispose(tester);
  });

  _screenTest('Overview: papers but no report, the next step is a report',
      (tester) async {
    await _pump(tester, messages: false, withReport: false);
    expect(find.text('Generate your first report'), findsOneWidget);
    expect(find.text('Ask about your papers'), findsNothing);
    await tester.tap(find.widgetWithText(FilledButton, 'Generate report'));
    await tester.pumpAndSettle();
    expect(DefaultTabController.of(tester.element(find.byType(TabBarView))).index, 3);
    await _dispose(tester);
  });

  _screenTest('"Add paper" shows on the Papers tab only and opens search',
      (tester) async {
    await _pump(tester, messages: false);
    expect(find.text('Add paper'), findsNothing);
    await _openTab(tester, 'Papers');
    expect(find.text('Add paper'), findsOneWidget);
    await _openTab(tester, 'Outputs');
    expect(find.text('Add paper'), findsNothing);
    await _dispose(tester);
  });

  group('removing a paper', () {
    Finder row(String title) => find.widgetWithText(LumiListRow, title);

    _screenTest('Undo keeps it: nothing is sent', (tester) async {
      final api = await _pump(tester, messages: false);
      await _openTab(tester, 'Papers');
      await tester.drag(row('Privacy in Medical FL'), const Offset(-500, 0));
      await tester.pumpAndSettle();
      expect(row('Privacy in Medical FL'), findsNothing);
      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();
      expect(row('Privacy in Medical FL'), findsOneWidget);
      expect(api.projects.removedPapers, isEmpty);
      await _dispose(tester);
    });

    _screenTest('the request goes out once the Undo window closes',
        (tester) async {
      final api = await _pump(tester, messages: false);
      await _openTab(tester, 'Papers');
      await tester.drag(row('Privacy in Medical FL'), const Offset(-500, 0));
      await tester.pumpAndSettle();
      expect(api.projects.removedPapers, isEmpty);
      await tester.pump();
      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();
      expect(api.projects.removedPapers, ['pa2']);
      await _dispose(tester);
    });
  });

  for (final brightness in Brightness.values) {
    for (final width in [412.0, 320.0]) {
      for (final empty in [false, true]) {
        _screenTest(
          'every tab fits and reads at ${width.toInt()}dp, '
          '${brightness.name} (${empty ? 'empty' : 'full'} project)',
          (tester) async {
            await _pump(
              tester,
              project: empty ? _emptyProject : _project,
              messages: !empty,
              width: width,
              brightness: brightness,
            );
            final page = brightness == Brightness.dark
                ? LumiColors.dark.background
                : LumiColors.light.background;
            for (final tab in _tabs) {
              await _openTab(tester, tab);
              expect(_errors, isEmpty, reason: '$tab @ ${width}dp');
              expect(
                unreadableText(tester, page: page),
                isEmpty,
                reason: '$tab, ${brightness.name}',
              );
            }
            await _dispose(tester);
          },
        );
      }
    }
  }

  _screenTest('team chat sends the trimmed text once and clears the box', (
    tester,
  ) async {
    final api = await _pump(tester);
    await _openTab(tester, 'Chat');

    await tester.enterText(find.byType(TextField), '  xin chào  ');

    await tester.pump();
    await tester.tap(_sendIcon());
    await tester.pumpAndSettle();

    expect(api.teamSends, ['xin chào']);
    expect(api.aiSends, isEmpty);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      isEmpty,
    );
    await _dispose(tester);
  });

  _screenTest('blank message is not sent', (tester) async {
    final api = await _pump(tester);
    await _openTab(tester, 'Chat');

    await tester.enterText(find.byType(TextField), '   ');

    await tester.pump();
    await tester.tap(_sendIcon());
    await tester.pumpAndSettle();

    expect(api.teamSends, isEmpty);
    expect(api.aiSends, isEmpty);
    await _dispose(tester);
  });

  group('chat channels', () {
    Finder input() => find.byType(TextField).hitTestable();
    Finder sendButton() => _sendIcon().hitTestable();

    Future<void> send(WidgetTester tester, String text) async {
      await tester.enterText(input(), text);
      await tester.pump();
      await tester.tap(sendButton());
      await tester.pumpAndSettle();
    }

    List<String> ai(_Fakes api) =>
        api.aiSends.map((e) => '${e.scope}:${e.text}').toList();

    _screenTest(
      'AI tab: the default channel is the private AI, never the team chat',
      (
        tester,
      ) async {
        final api = await _pump(tester, messages: false);
        await _openTab(tester, 'AI assistant');
        await send(tester, 'hỏi AI');

        expect(api.teamSends, isEmpty);
        expect(ai(api), ['private:hỏi AI']);
        await _dispose(tester);
      },
    );

    _screenTest('Chat tab: always the team chat', (tester) async {
      final api = await _pump(tester, messages: false);
      await _openTab(tester, 'Chat');
      await send(tester, 'chào nhóm');

      expect(api.teamSends, ['chào nhóm']);
      expect(api.aiSends, isEmpty);
      await _dispose(tester);
    });

    _screenTest(
      'picking Team AI in the AI tab does not change the Chat tab, and back',
      (
        tester,
      ) async {
        final api = await _pump(tester, messages: false);
        await _openTab(tester, 'AI assistant');
        await tester.tap(find.text('Team AI'));
        await tester.pumpAndSettle();

        await _openTab(tester, 'Chat');
        expect(find.text('Message the team…'), findsOneWidget);
        await send(tester, 'tin cho nhóm');
        expect(api.teamSends, ['tin cho nhóm']);
        expect(api.aiSends, isEmpty);

        await _openTab(tester, 'AI assistant');
        expect(
          find.text('AI answers are visible to every project member'),
          findsOneWidget,
          reason: 'AI channel kept',
        );
        await send(tester, 'hỏi cả nhóm');
        expect(api.teamSends, ['tin cho nhóm'], reason: 'team chat untouched');
        expect(ai(api), ['team:hỏi cả nhóm']);
        await _dispose(tester);
      },
    );

    _screenTest(
      'AI tab without papers: error shown, no API call, any channel',
      (
        tester,
      ) async {
        final api = await _pump(
          tester,
          project: _emptyProject,
          messages: false,
        );
        await _openTab(tester, 'AI assistant');

        // The empty AI chat already shows this sentence as a hint (1); the
        // error banner adds a second one.
        expect(find.text('Add papers before asking AI.'), findsOneWidget);
        await send(tester, 'hỏi AI');
        expect(find.text('Add papers before asking AI.'), findsNWidgets(2));
        expect(api.aiSends, isEmpty);
        expect(api.teamSends, isEmpty);

        await tester.tap(find.text('Team AI'));
        await tester.pumpAndSettle();
        expect(
          find.text('Add papers before asking AI.'),
          findsOneWidget,
          reason: 'error cleared on channel change (only the hint is left)',
        );
        await send(tester, 'hỏi nhóm AI');
        expect(find.text('Add papers before asking AI.'), findsNWidgets(2));
        expect(api.aiSends, isEmpty);
        expect(api.teamSends, isEmpty);
        await _dispose(tester);
      },
    );

    _screenTest('team chat still works in a project without papers', (
      tester,
    ) async {
      final api = await _pump(tester, project: _emptyProject, messages: false);
      await _openTab(tester, 'Chat');
      await send(tester, 'dự án mới');

      expect(api.teamSends, ['dự án mới']);
      expect(find.text('Add papers before asking AI.'), findsNothing);
      await _dispose(tester);
    });

    _screenTest('each tab keeps its own draft and error', (tester) async {
      await _pump(tester, messages: false);
      await _openTab(tester, 'Chat');
      await tester.enterText(input(), 'bản nháp nhóm');
      await tester.pump();
      await _openTab(tester, 'AI assistant');
      expect(tester.widget<TextField>(input()).controller!.text, isEmpty);

      await tester.enterText(input(), 'bản nháp AI');

      await tester.pump();
      await _openTab(tester, 'Chat');
      expect(
        tester.widget<TextField>(input()).controller!.text,
        'bản nháp nhóm',
      );
      await _dispose(tester);
    });
  });

  group('project actions', () {
    const owned = ProjectView(
      id: 'p1',
      title: 'Học liên kết trong y tế',
      ownerId: 'u1',
      accessRole: 'OWNER',
      members: [ProjectMemberRef(id: 'u1', displayName: 'Minh Nguyen')],
    );
    const joined = ProjectView(
      id: 'p1',
      title: 'Học liên kết trong y tế',
      ownerId: 'u9',
      accessRole: 'MEMBER',
    );

    Future<void> openActions(WidgetTester tester) async {
      await tester.tap(find.byTooltip('More project actions'));
      await tester.pumpAndSettle();
    }

    _screenTest('a member sees Members only: no settings, no Trash', (tester) async {
      await _pump(tester, project: joined, messages: false);
      await openActions(tester);
      expect(find.text('Members'), findsWidgets);
      expect(find.text('Project settings'), findsNothing);
      expect(find.text('Move project to Trash'), findsNothing);
      await _dispose(tester);
    });

    _screenTest('Trash needs the exact title, then moves once and leaves', (tester) async {
      final api = await _pump(tester, project: owned, messages: false, withRouter: true);
      await openActions(tester);
      await tester.tap(find.text('Move project to Trash'));
      await tester.pumpAndSettle();
      final confirm = find.widgetWithText(FilledButton, 'Move to Trash');
      expect(tester.widget<FilledButton>(confirm).onPressed, isNull);
      await tester.enterText(find.byType(TextField).last, 'Học liên kết');
      await tester.pump();
      expect(tester.widget<FilledButton>(confirm).onPressed, isNull);
      await tester.enterText(find.byType(TextField).last, 'Học liên kết trong y tế');
      await tester.pump();
      await tester.tap(confirm);
      await tester.pumpAndSettle();
      expect(api.projects.deleted, ['p1']);
      expect(find.text('projects list'), findsOneWidget);
      expect(find.text('Project moved to Trash'), findsOneWidget);
      await _dispose(tester);
    });

    _screenTest('cancelling the Trash sheet sends nothing', (tester) async {
      final api = await _pump(tester, project: owned, messages: false);
      await openActions(tester);
      await tester.tap(find.text('Move project to Trash'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(api.projects.deleted, isEmpty);
      await _dispose(tester);
    });
  });
}

// What every tab shows. Recorded from the single-file implementation before
// the split (Phase 5); the Chat tab was re-recorded when the live team chat
// replaced it. Refresh with:
//   flutter test --dart-define=RECORD=true test/project_detail_screen_test.dart
const Map<String, List<String>> _expected = {
  'Overview': [
    '0',
    '1',
    '2',
    '2',
    'Ask about your papers',
    'Chat',
    'Federated Learning Survey',
    'Gaps',
    'Học liên kết trong y tế',
    'Members',
    'Mô tả dự án',
    'Next step',
    'Open chat',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Privacy in Medical FL',
    'Recent papers',
    'Reports',
    'The AI assistant answers from the papers in this project.',
    'Year: 2024 · Citations: 12',
    'Year: N/A · Citations: 0',
  ],
  'Papers': [
    '0',
    '1',
    '2',
    '2',
    'Add paper',
    'Chat',
    'Federated Learning Survey',
    'Gaps',
    'Học liên kết trong y tế',
    'Members',
    'Mô tả dự án',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Privacy in Medical FL',
    'Reports',
    'Year: 2024 · Citations: 12',
    'Year: N/A · Citations: 0',
  ],
  'Chat': [
    '0',
    '09:00',
    '1',
    '2',
    '2',
    'AI assistant',
    'Chat',
    'Chào cả nhóm',
    'Gaps',
    'Học liên kết trong y tế',
    'L',
    'Lan Tran',
    'Members',
    'Message the team…',
    'Mô tả dự án',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Team chat',
    'Today',
  ],
  'AI assistant': [
    '0',
    '1',
    '10:00',
    '2',
    '2',
    'AI assistant',
    'AI assistant',
    'Ask AI Assistant about project publications...',
    'Chat',
    'Copy',
    'Gaps',
    'Học liên kết trong y tế',
    'Members',
    'My AI',
    'Mô tả dự án',
    'Only you can see this AI conversation',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Team AI',
    'Team chat',
    'Đây là câu trả lời của AI',
  ],
  'Outputs': [
    '0',
    '1',
    '2',
    '2',
    'Báo cáo thử',
    'Chat',
    'Discovered research gaps',
    'Gaps',
    'Generate report',
    'Học liên kết trong y tế',
    'Members',
    'Mô tả dự án',
    'No research gaps found for this workspace.',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Ready',
    'Reports',
    'Reports',
    'federated learning',
  ],
  'Members': [
    'LT',
    'Lan Tran',
    'MN',
    'Member',
    'Members',
    'Minh Nguyen',
    'Owner',
  ],
};
const Map<String, List<String>> _expectedEmpty = {
  'Overview': [
    '0',
    '0',
    '0',
    '1',
    'Add publications to power grounding reports, chat, and gap detection.',
    'Chat',
    'Dự án trống',
    'Gaps',
    'Ground your research',
    'Members',
    'Next step',
    'No description yet.',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Search publications',
  ],
  'Papers': [
    '0',
    '0',
    '0',
    '1',
    'Chat',
    'Dự án trống',
    'Gaps',
    'Members',
    'No description yet.',
    'No papers inside this project workspace yet.',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Search publications',
  ],
  'Chat': [
    '0',
    '0',
    '0',
    '1',
    'AI assistant',
    'Chat',
    'Dự án trống',
    'Gaps',
    'Members',
    'Message the team…',
    'No description yet.',
    'No messages yet. Start the conversation.',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Team chat',
  ],
  'AI assistant': [
    '0',
    '0',
    '0',
    '1',
    'AI assistant',
    'Add papers before asking AI.',
    'Ask AI Assistant about project publications...',
    'Chat',
    'Dự án trống',
    'Gaps',
    'Members',
    'My AI',
    'No AI messages yet',
    'No description yet.',
    'Only you can see this AI conversation',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Team AI',
    'Team chat',
  ],
  'Outputs': [
    '0',
    '0',
    '0',
    '1',
    'Báo cáo thử',
    'Chat',
    'Discovered research gaps',
    'Dự án trống',
    'Gaps',
    'Generate report',
    'Members',
    'No description yet.',
    'No research gaps found for this workspace.',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Ready',
    'Reports',
    'Reports',
    'federated learning',
  ],
  'Members': [
    'Members',
  ],
};
