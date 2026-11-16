import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/projects/data/invitations_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/invitation_link_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_invitations_section.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'support/community_fakes.dart';
import 'support/pump_screen.dart';

class _Api extends Fake implements InvitationsApi {
  final List<(String, bool)> answers = [];
  Object? error;
  Completer<void>? gate;
  int mineCalls = 0;

  @override
  Future<List<ProjectInvitation>> mine() async {
    mineCalls++;
    return [sampleInvitation()];
  }

  @override
  Future<void> respond(ProjectInvitation invitation, {required bool accept}) async {
    answers.add((invitation.id, accept));
    await gate?.future;
    // ignore: only_throw_errors, the test injects what the API may throw
    if (error != null) throw error!;
  }
}

/// Dio that answers `/projects/invitations/mine` page by page.
class _PagedAdapter implements HttpClientAdapter {
  final List<int> pages = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? _, Future<void>? _) async {
    final page = options.queryParameters['page'] as int;
    pages.add(page);
    final item = '{"id":"i$page","projectId":"p$page","projectTitle":"T$page"}';
    final hasNext = page < 2;
    return ResponseBody.fromString(
      '{"success":true,"data":[$item,{"id":"bad"}],"meta":{"page":$page,"hasNext":$hasNext}}',
      200,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('my invitations: every page is read, broken rows are skipped', () async {
    final adapter = _PagedAdapter();
    final dio = Dio()..httpClientAdapter = adapter;
    final items = await InvitationsApi(dio).mine();
    expect(adapter.pages, [1, 2]);
    expect(items.map((i) => i.id), ['i1', 'i2']);
  });

  test('the link page says what the web says, branch by branch', () {
    InvitationPreview p({bool matches = true, bool member = false, String status = 'PENDING'}) =>
        InvitationPreview(status: status, authenticated: true, emailMatches: matches, alreadyMember: member);
    expect(invitationLinkMessage(p(matches: false)), contains('another verified identity'));
    expect(invitationLinkMessage(p(member: true)), 'You are already a member of this project.');
    expect(invitationLinkMessage(p()), contains('Accept to join'));
    expect(invitationLinkMessage(p(status: 'EXPIRED')), contains('already been handled'));
  });

  group('invitations above the projects', () {
    Future<_Api> pump(WidgetTester tester) async {
      final api = _Api();
      await pumpScreen(
        tester,
        const Scaffold(body: SingleChildScrollView(child: ProjectInvitationsSection())),
        overrides: [
          invitationsApiProvider.overrideWithValue(api),
          projectsProvider.overrideWith((ref) async => const []),
        ],
      );
      return api;
    }

    testWidgets('accepting is sent once and opens the project', (tester) async {
      final api = await pump(tester);
      api.gate = Completer<void>();
      await tester.tap(find.text('Accept and open'));
      await tester.pump();
      // Both answers are locked while the first one is sent.
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Accepting...')).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Decline')).onPressed, isNull);
      api.gate!.complete();
      await tester.pumpAndSettle();
      expect(api.answers, [('inv1', true)]);
      expect(find.text('route:/project/p9'), findsOneWidget);
    });

    testWidgets('declining asks first; keeping it sends nothing', (tester) async {
      final api = await pump(tester);
      await tester.tap(find.text('Decline'));
      await tester.pumpAndSettle();
      expect(find.text('Decline project invitation?'), findsOneWidget);
      await tester.tap(find.text('Keep invitation'));
      await tester.pumpAndSettle();
      expect(api.answers, isEmpty);

      await tester.tap(find.text('Decline'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Decline invitation'));
      await tester.pumpAndSettle();
      expect(api.answers, [('inv1', false)]);
      expect(find.text('Invitation declined'), findsOneWidget);
    });

    testWidgets('an invitation gone meanwhile says so and reloads the list', (tester) async {
      final api = await pump(tester);
      final before = api.mineCalls;
      api.error = httpFailure(409);
      await tester.tap(find.text('Accept and open'));
      await tester.pumpAndSettle();
      expect(find.textContaining('This invitation is no longer available'), findsOneWidget);
      expect(api.mineCalls, greaterThan(before));
      expect(find.textContaining('route:'), findsNothing);
    });
  });

  testWidgets('a link for another account offers to switch, never to accept', (tester) async {
    await pumpScreen(
      tester,
      const InvitationLinkScreen(token: 'tok'),
      overrides: [
        apiClientProvider.overrideWith((ref) => throw UnimplementedError()),
        invitationPreviewProvider.overrideWith(
          (ref, t) async => const InvitationPreview(
            status: 'PENDING',
            authenticated: true,
            emailMatches: false,
            alreadyMember: false,
          ),
        ),
      ],
    );
    expect(find.text('Join a research project'), findsOneWidget);
    expect(find.text('Switch account'), findsOneWidget);
    expect(find.text('Accept invitation'), findsNothing);
  });
}
