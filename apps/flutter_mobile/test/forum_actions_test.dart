import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/community_screen.dart';
import 'package:flutter_mobile/features/community/presentation/forum_post_actions.dart';
import 'package:flutter_mobile/features/community/presentation/forum_post_screen.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'support/community_fakes.dart';
import 'support/pump_screen.dart';

/// The signed-in test user is `u1`.
Future<FakeForumApi> _pump(
  WidgetTester tester, {
  ForumPost? post,
  List<ForumReply> replies = const [],
}) async {
  final api = FakeForumApi(feed: [post ?? samplePost('p1')], replyItems: replies);
  await pumpScreen(
    tester,
    const ForumPostScreen(idOrSlug: 'post-p1'),
    overrides: [forumApiProvider.overrideWithValue(api)],
  );
  return api;
}

Future<void> _menu(WidgetTester tester, String tooltip, String item) async {
  await tester.tap(find.byTooltip(tooltip).first);
  await tester.pumpAndSettle();
  await tester.tap(find.text(item).last);
  await tester.pumpAndSettle();
}

void main() {
  test('share links use the web address of the post or reply number', () {
    final post = samplePost('p1');
    expect(forumWebPath(post), '/forum/post-p1');
    expect(forumWebPath(post, postNumber: 4), '/forum/post-p1/4');
  });

  group('report', () {
    testWidgets('anyone can report a discussion, with a reason and context', (tester) async {
      final api = await _pump(tester);
      await _menu(tester, 'More discussion actions', 'Report content');
      expect(find.textContaining('not ordinary academic disagreement'), findsOneWidget);
      // Every reason is one tap away in the sheet.
      await tester.tap(find.text('Spam'));
      await tester.pumpAndSettle();
      await tester.enterText(find.descendant(of: find.byType(BottomSheet), matching: find.byType(TextField)), '  Same link posted ten times  ');
      await tester.tap(find.text('Submit report'));
      await tester.pumpAndSettle();
      expect(api.calls, ['report post p1 SPAM Same link posted ten times']);
      expect(find.text('Report submitted for moderator review.'), findsOneWidget);
    });

    testWidgets('a reply can be reported; a refused report says why', (tester) async {
      final api = await _pump(tester, replies: [sampleReply('r1')]);
      api.reportError = httpFailure(409);
      await _menu(tester, 'More response actions', 'Report response');
      await tester.tap(find.text('Submit report'));
      await tester.pumpAndSettle();
      expect(api.calls, ['report comment r1 OFF_TOPIC -']);
      expect(find.text('This content could not be reported, or you already reported it.'), findsOneWidget);
    });

    testWidgets('copyright concern points to the claim form; cancel sends nothing', (tester) async {
      final api = await _pump(tester);
      await _menu(tester, 'More discussion actions', 'Report content');
      await tester.tap(find.text('Off topic'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Copyright concern').last);
      await tester.pumpAndSettle();
      expect(find.text('Submit a copyright claim'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(api.calls, isEmpty);
    });
  });

  group("the author's own content", () {
    testWidgets("others see no edit or delete on someone else's discussion", (tester) async {
      await _pump(tester);
      await tester.tap(find.byTooltip('More discussion actions'));
      await tester.pumpAndSettle();
      expect(find.text('Edit discussion'), findsNothing);
      expect(find.text('Delete discussion'), findsNothing);
      expect(find.text('Share'), findsOneWidget);
    });

    testWidgets('removing a discussion asks first', (tester) async {
      final api = await _pump(tester, post: samplePost('p1', authorId: 'u1'));
      await _menu(tester, 'More discussion actions', 'Delete discussion');
      expect(find.text('Remove this discussion?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(api.calls, isEmpty);
      await _menu(tester, 'More discussion actions', 'Delete discussion');
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(api.calls, ['delete post p1']);
      expect(find.text('Discussion removed'), findsOneWidget);
    });

    testWidgets('a locked discussion cannot be edited or removed', (tester) async {
      await _pump(tester, post: samplePost('p1', authorId: 'u1', status: 'locked'));
      await tester.tap(find.byTooltip('More discussion actions'));
      await tester.pumpAndSettle();
      expect(find.text('Edit discussion'), findsNothing);
      expect(find.text('Delete discussion'), findsNothing);
      expect(find.text('Report content'), findsOneWidget);
    });

    testWidgets('an own reply is edited and removed in place', (tester) async {
      final api = await _pump(tester, replies: [sampleReply('r1', authorId: 'u1')]);
      await _menu(tester, 'More response actions', 'Edit response');
      await tester.enterText(find.byType(TextField).last, 'Corrected answer');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      expect(api.calls, ['edit reply r1 Corrected answer']);
      expect(find.text('Corrected answer'), findsOneWidget);

      await _menu(tester, 'More response actions', 'Delete response');
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(find.text('This response was removed by its author.'), findsOneWidget);
    });
  });

  group('accepted response', () {
    testWidgets('only the question author may accept, and may take it back', (tester) async {
      final api = await _pump(tester, post: samplePost('p1', authorId: 'u1'), replies: [sampleReply('r1')]);
      await tester.tap(find.text('Accept response'));
      await tester.pumpAndSettle();
      expect(api.calls, ['accept p1 r1']);
      expect(find.text('Accepted by question author'), findsOneWidget);
      await tester.tap(find.text('Unaccept response'));
      await tester.pumpAndSettle();
      expect(api.calls.last, 'accept p1 -');
      expect(find.text('Accepted by question author'), findsNothing);
    });

    testWidgets('no accept on a discussion, nor for someone else', (tester) async {
      await _pump(tester, post: samplePost('p1', authorId: 'u1', type: 'DISCUSSION'), replies: [sampleReply('r1')]);
      expect(find.text('Accept response'), findsNothing);
      await _pump(tester, replies: [sampleReply('r1')]);
      expect(find.text('Accept response'), findsNothing);
    });
  });

  testWidgets('replying to a reply names it and sends its id', (tester) async {
    final api = await _pump(tester, replies: [sampleReply('r1')]);
    await tester.tap(find.widgetWithText(TextButton, 'Reply'));
    await tester.pumpAndSettle();
    expect(find.text('Replying to Trần Minh Khoa'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Agreed');
    await tester.tap(find.byTooltip('Reply'));
    await tester.pumpAndSettle();
    expect(api.sentReplies, ['Agreed @r1']);
    expect(find.text('Replying to Trần Minh Khoa'), findsNothing);
  });

  testWidgets('notification level is chosen from the four web levels', (tester) async {
    final api = await _pump(tester);
    await tester.tap(find.byTooltip('Discussion notifications'));
    await tester.pumpAndSettle();
    expect(find.text('Do not notify me about this discussion.'), findsOneWidget);
    await tester.tap(find.text('Muted'));
    await tester.pumpAndSettle();
    expect(api.calls, ['level p1 MUTED']);
  });

  testWidgets('share copies the web link', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await _pump(tester);
    await _menu(tester, 'More discussion actions', 'Share');
    expect(copied, endsWith('/forum/post-p1'));
    expect(find.text('Copied link to clipboard'), findsOneWidget);
  });

  testWidgets("long-press on someone else's reply: share, copy, report only", (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final reply = sampleReply('r1');
    await _pump(tester, replies: [reply]);
    await tester.longPress(find.text(reply.content));
    await tester.pumpAndSettle();
    expect(find.text('Share response'), findsOneWidget);
    expect(find.text('Report response'), findsOneWidget);
    expect(find.text('Edit response'), findsNothing);
    expect(find.text('Delete response'), findsNothing);
    await tester.tap(find.text('Copy text'));
    await tester.pumpAndSettle();
    expect(copied, reply.content);
    expect(find.text('Copied to clipboard'), findsOneWidget);
  });

  testWidgets('tapping Reply on a response focuses the reply box', (tester) async {
    await _pump(tester, replies: [sampleReply('r1')]);
    await tester.tap(find.widgetWithText(TextButton, 'Reply'));
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.focusNode?.hasFocus, isTrue);
  });

  testWidgets('the feed filters by thread type and category together', (tester) async {
    final api = FakeForumApi(feed: [samplePost('p1')]);
    await pumpScreen(tester, const CommunityScreen(), overrides: [forumApiProvider.overrideWithValue(api)]);
    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Question').last);
    await tester.tap(find.text('Methods and evaluation').last);
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(api.postCalls.last.$1, const ForumQuery(categoryId: 'c1', type: 'QUESTION'));
    expect(find.byTooltip('Filters, 2 active'), findsOneWidget);
  });
}
