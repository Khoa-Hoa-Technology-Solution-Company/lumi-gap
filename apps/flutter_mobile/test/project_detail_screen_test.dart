import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail_screen.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';

/// Characterization test for the project workspace screen, written before it
/// was split into `project_detail/` (Phase 5): it records what every tab
/// shows and how the chat sends, so the refactor can be proved behaviour-
/// neutral by running the same test before and after.

class _FakeProjectsApi extends Fake implements ProjectsApi {
  final List<String> teamSends = [];
  final List<({String text, String scope})> aiSends = [];
  final List<String> markedRead = [];

  @override
  Future<void> markTeamChatRead(String projectId, String messageId) async {
    markedRead.add(messageId);
  }

  @override
  Future<void> sendTeamChat(String projectId, String content) async {
    teamSends.add(content);
  }

  @override
  Future<void> sendChat(
    String projectId,
    String content, {
    String scope = 'private',
  }) async {
    aiSends.add((text: content, scope: scope));
  }
}

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

Future<_FakeProjectsApi> _pump(
  WidgetTester tester, {
  ProjectView project = _project,
  bool messages = true,
  double width = 412,
}) async {
  final api = _FakeProjectsApi();
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
        projectsApiProvider.overrideWithValue(api),
        projectProvider.overrideWith((ref, id) async => project),
        projectTeamChatProvider.overrideWith(
          (ref, id) async => messages
              ? [
                  ProjectTeamChatMessage(
                    id: 'm1',
                    sender: const ChatSender(id: 'u2', fullName: 'Lan Tran'),
                    content: 'Chào cả nhóm',
                    createdAt: DateTime.utc(2026, 11, 8, 9).toIso8601String(),
                  ),
                ]
              : <ProjectTeamChatMessage>[],
        ),
        projectChatProvider.overrideWith(
          (ref, query) async => messages
              ? [
                  ProjectChatMessage(
                    id: 'a1',
                    role: 'assistant',
                    content: 'Đây là câu trả lời của AI',
                    createdAt: DateTime.utc(2026, 11, 8, 10).toIso8601String(),
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
      child: const MaterialApp(home: ProjectDetailScreen(id: 'p1')),
    ),
  );
  await tester.pumpAndSettle();
  return api;
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
}

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
    await tester.tap(find.byIcon(Icons.send_rounded));
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
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();

    expect(api.teamSends, isEmpty);
    expect(api.aiSends, isEmpty);
    await _dispose(tester);
  });

  _screenTest('sending from the AI tab: what goes where (recorded behaviour)', (
    tester,
  ) async {
    final api = await _pump(tester, project: _emptyProject, messages: false);
    await _openTab(tester, 'AI Assistant');
    await tester.enterText(find.byType(TextField), 'hỏi AI');
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();

    _check('aiTabSend', {
      'team': api.teamSends,
      'ai': api.aiSends.map((e) => '${e.scope}:${e.text}').toList(),
    }, _expectedAiTabSend);
    await _dispose(tester);
  });
}

// Recorded from the original single-file implementation (before Phase 5).
// Refresh with: flutter test --dart-define=RECORD=true test/project_detail_screen_test.dart
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
    '16:00',
    'AI Assistant',
    'Chat',
    'Chào cả nhóm',
    'Discuss with project members',
    'Học liên kết trong y tế',
    'Lan Tran',
    'Live',
    'Members',
    'Message your project team...',
    'My AI',
    'Outputs',
    'Overview',
    'Papers',
    'Team',
    'Team AI',
    'Team Chat',
  ],
  'AI Assistant': [
    '17:00',
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
    'Discuss with project members',
    'Dự án trống',
    'Live',
    'Members',
    'Message your project team...',
    'My AI',
    'No team messages yet',
    'Outputs',
    'Overview',
    'Papers',
    'Start the discussion with your project members.',
    'Team',
    'Team AI',
    'Team Chat',
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

/// KNOWN ISSUE (kept as-is in Phase 5): typing in the "AI Assistant" tab
/// without first tapping a channel posts to the TEAM chat, because the
/// screen state starts in team mode while the AI tab only *displays*
/// private-AI mode.
const Map<String, List<String>> _expectedAiTabSend = {
  'team': [
    'hỏi AI',
  ],
  'ai': <String>[],
};
