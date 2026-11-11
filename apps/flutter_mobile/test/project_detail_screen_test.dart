import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_api.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail_screen.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'team_chat_support.dart';

/// Characterization test for the project workspace screen, written before it
/// was split into `project_detail/` (Phase 5): it records what every tab
/// shows and how the chat sends, so the refactor can be proved behaviour-
/// neutral by running the same test before and after.

class _FakeProjectsApi extends Fake implements ProjectsApi {
  final List<({String text, String scope})> aiSends = [];

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
          (ref, params) async => const ReportsList(
            reports: [
              ReportListItem(
                id: 'r1',
                query: 'federated learning',
                status: 'ready',
                topic: 'Báo cáo thử',
              ),
            ],
            total: 1,
          ),
        ),
        gapsProvider.overrideWith(
          (ref, params) async => const ListGapsResponse(data: [], total: 0),
        ),
      ],
      child: MaterialApp(
        locale: AppLocale.en.locale,
        supportedLocales: AppLocale.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
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

Future<void> _openTab(WidgetTester tester, String name) async {
  final tab = find.descendant(
    of: find.byType(TabBar),
    matching: find.text(name),
  );
  await tester.ensureVisible(tab);
  await tester.tap(tab);
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

const _tabs = [
  'Overview',
  'Papers',
  'Chat',
  'AI Assistant',
  'Outputs',
  'Members',
];

void main() {
  _screenTest('has the six tabs in order', (tester) async {
    await _pump(tester);
    final labels = tester
        .widgetList<Tab>(find.byType(Tab))
        .map((t) => t.text)
        .toList();
    expect(labels, _tabs);
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

  for (final width in [412.0, 320.0]) {
    for (final empty in [false, true]) {
      _screenTest(
        'no layout overflow on any tab at ${width.toInt()}dp '
        '(${empty ? 'empty' : 'full'} project)',
        (tester) async {
          await _pump(
            tester,
            project: empty ? _emptyProject : _project,
            messages: !empty,
            width: width,
          );
          for (final tab in _tabs) {
            await _openTab(tester, tab);
            expect(_errors, isEmpty, reason: '$tab @ ${width}dp');
          }
          await _dispose(tester);
        },
      );
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
        await _openTab(tester, 'AI Assistant');
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
        await _openTab(tester, 'AI Assistant');
        await tester.tap(find.text('Team AI (Shared)'));
        await tester.pumpAndSettle();

        await _openTab(tester, 'Chat');
        expect(find.text('Message the team…'), findsOneWidget);
        await send(tester, 'tin cho nhóm');
        expect(api.teamSends, ['tin cho nhóm']);
        expect(api.aiSends, isEmpty);

        await _openTab(tester, 'AI Assistant');
        expect(
          find.text('Team AI Room - Shared'),
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
        await _openTab(tester, 'AI Assistant');

        // The empty AI chat already shows this sentence as a hint (1); the
        // error banner adds a second one.
        expect(find.text('Add papers before asking AI.'), findsOneWidget);
        await send(tester, 'hỏi AI');
        expect(find.text('Add papers before asking AI.'), findsNWidgets(2));
        expect(api.aiSends, isEmpty);
        expect(api.teamSends, isEmpty);

        await tester.tap(find.text('Team AI (Shared)'));
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
      await _openTab(tester, 'AI Assistant');
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
    'AI Assistant',
    'Add',
    'Add publications to power grounding reports, chat, and gap detection.',
    'Chat',
    'Gaps Detected',
    'Ground Your Research',
    'Học liên kết trong y tế',
    'Học liên kết trong y tế',
    'Members',
    'Mô tả dự án',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Team Members',
    'Workspace Activity Log',
    'Workspace initialized and ready for research.',
  ],
  'Papers': [
    'AI Assistant',
    'Chat',
    'Federated Learning Survey',
    'Học liên kết trong y tế',
    'Members',
    'Outputs',
    'Overview',
    'Papers',
    'Privacy in Medical FL',
    'Year: 2024 · Citations: 12',
    'Year: N/A · Citations: 0',
  ],
  'Chat': [
    '09:00',
    'AI Assistant',
    'Chat',
    'Chào cả nhóm',
    'Học liên kết trong y tế',
    'L',
    'Lan Tran',
    'Members',
    'Message the team…',
    'Outputs',
    'Overview',
    'Papers',
    'Today',
  ],
  'AI Assistant': [
    '10:00',
    'AI Assistant',
    'AI assistant',
    'Ask AI Assistant about project publications...',
    'Chat',
    'Copy',
    'Học liên kết trong y tế',
    'Members',
    'My AI (Private)',
    'My AI - Private',
    'Only you can see this AI conversation',
    'Outputs',
    'Overview',
    'Papers',
    'Private',
    'Team AI (Shared)',
    'Đây là câu trả lời của AI',
  ],
  'Outputs': [
    'AI Assistant',
    'Báo cáo thử',
    'Chat',
    'Discovered Research Gaps',
    'Generate RAG Report',
    'Học liên kết trong y tế',
    'Members',
    'No research gaps found for this workspace.',
    'Outputs',
    'Overview',
    'Papers',
    'RAG Analytical Reports',
    'Status: READY · federated learning',
  ],
  'Members': [
    'AI Assistant',
    'Add',
    'Chat',
    'Enter User ID or Email',
    'Học liên kết trong y tế',
    'Lan Tran',
    'Member',
    'Members',
    'Minh Nguyen',
    'Outputs',
    'Overview',
    'Owner',
    'Papers',
    'Workspace Members',
    'Workspace Settings',
  ],
};
const Map<String, List<String>> _expectedEmpty = {
  'Overview': [
    '0',
    '0',
    '0',
    '1',
    'AI Assistant',
    'Add',
    'Add publications to power grounding reports, chat, and gap detection.',
    'Chat',
    'Dự án trống',
    'Dự án trống',
    'Gaps Detected',
    'Ground Your Research',
    'Members',
    'Outputs',
    'Overview',
    'Papers',
    'Papers',
    'Reports',
    'Team Members',
    'Workspace Activity Log',
    'Workspace initialized and ready for research.',
  ],
  'Papers': [
    'AI Assistant',
    'Chat',
    'Dự án trống',
    'Members',
    'No papers inside this project workspace yet.',
    'Outputs',
    'Overview',
    'Papers',
    'Search for publications outside and tap "Add" button to associate them here.',
    'Search publications',
  ],
  'Chat': [
    'AI Assistant',
    'Chat',
    'Dự án trống',
    'Members',
    'Message the team…',
    'No messages yet. Start the conversation.',
    'Outputs',
    'Overview',
    'Papers',
  ],
  'AI Assistant': [
    'AI Assistant',
    'Add papers before asking AI.',
    'Ask AI Assistant about project publications...',
    'Chat',
    'Dự án trống',
    'Members',
    'My AI (Private)',
    'My AI - Private',
    'No AI messages yet',
    'Only you can see this AI conversation',
    'Outputs',
    'Overview',
    'Papers',
    'Private',
    'Team AI (Shared)',
  ],
  'Outputs': [
    'AI Assistant',
    'Báo cáo thử',
    'Chat',
    'Discovered Research Gaps',
    'Dự án trống',
    'Generate RAG Report',
    'Members',
    'No research gaps found for this workspace.',
    'Outputs',
    'Overview',
    'Papers',
    'RAG Analytical Reports',
    'Status: READY · federated learning',
  ],
  'Members': [
    'AI Assistant',
    'Add',
    'Chat',
    'Dự án trống',
    'Enter User ID or Email',
    'Members',
    'Outputs',
    'Overview',
    'Papers',
    'Workspace Members',
    'Workspace Settings',
  ],
};
