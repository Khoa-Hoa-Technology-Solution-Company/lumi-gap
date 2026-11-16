import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/forum_feed.dart';
import 'package:flutter_mobile/features/community/presentation/forum_post_screen.dart';
import 'package:flutter_mobile/features/community/presentation/new_post_screen.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_test_support.dart';
import 'support/community_fakes.dart';
import 'support/pump_screen.dart';

List<ForumPost> _posts(int from, int count) =>
    [for (var i = from; i < from + count; i++) samplePost('p$i')];

/// A feed that serves [pages] in order; ids may repeat across pages.
class _PagedForum extends FakeForumApi {
  _PagedForum(this.pages);
  final List<List<ForumPost>> pages;

  @override
  Future<ForumPage<ForumPost>> posts(ForumQuery q, int page) async {
    postCalls.add((q, page));
    return ForumPage(page <= pages.length ? pages[page - 1] : const [], page: page, totalPages: pages.length);
  }
}

class _Host extends StatefulWidget {
  const _Host();
  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  ForumQuery query = const ForumQuery();
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            TextButton(
              onPressed: () => setState(() => query = const ForumQuery(feed: ForumFeed.popular)),
              child: const Text('switch'),
            ),
            Expanded(child: ForumFeedList(query: query)),
          ],
        ),
      );
}

void main() {
  group('rules of the backend schemas', () {
    test('tags: trimmed, spaces collapsed, no duplicates', () {
      expect(parseForumTags(' NLP , nlp,  deep   learning ,, '), ['NLP', 'deep learning']);
    });

    test('a new discussion needs a category, a 3–240 title and a body', () {
      final ok = newPostErrors(categoryId: 'c1', title: 'Why?', body: 'Because.', tags: 'a, b');
      expect([ok.category, ok.title, ok.body, ok.tags], everyElement(isNull));
      final bad = newPostErrors(categoryId: null, title: ' ab ', body: '   ', tags: 'a,b,c,d,e,f');
      expect(bad.category, isNotNull);
      expect(bad.title, isNotNull);
      expect(bad.body, isNotNull);
      expect(bad.tags, 'Use up to 5 tags');
      expect(newPostErrors(categoryId: 'c', title: 'x' * 241, body: 'b', tags: '').title, isNotNull);
      expect(newPostErrors(categoryId: 'c', title: 'abc', body: 'b', tags: 'x' * 81).tags, isNotNull);
    });

    test('a reply has 1 to 10000 characters', () {
      expect(replyError('  '), isNotNull);
      expect(replyError('ok'), isNull);
      expect(replyError('x' * 10001), isNotNull);
    });

    test('the feed query sends only what is set', () {
      expect(const ForumQuery().params(1), {'page': 1, 'pageSize': forumPageSize, 'feed': 'latest'});
      expect(
        const ForumQuery(feed: ForumFeed.following, categoryId: 'c1', search: '  llm ').params(2),
        {'page': 2, 'pageSize': forumPageSize, 'feed': 'following', 'category': 'c1', 'query': 'llm'},
      );
    });

    test('a feed row reads its author and category the way lists send them', () {
      final post = ForumPost.fromJson({
        'id': 'p1',
        'title': 'T',
        'authorId': {'id': 'u7', 'fullName': 'Lê Văn An'},
        'communityId': {'id': 'c1', 'name': 'Methods', 'slug': 'methods'},
        'createdAt': '2026-11-10T08:00:00Z',
      });
      expect(post.author.fullName, 'Lê Văn An');
      expect(post.category?.name, 'Methods');
      final reply = ForumReply.fromJson({'id': 'r1', 'authorId': {'id': 'u8', 'fullName': 'Hà'}});
      expect(reply.author.fullName, 'Hà');
    });

    test('reactions keep only known names and positive counts', () {
      final r = ReactionState.fromJson({
        'reactionCounts': {'LIKE': 2, 'SAD': 0, 'HACK': 5},
        'viewerReactions': ['LIKE', 'HACK'],
      });
      expect(r.counts, {'LIKE': 2});
      expect(r.mine, {'LIKE'});
    });
  });

  testWidgets('the feed pages without repeats, stops on a short page and restarts on a new query', (tester) async {
    final api = _PagedForum([_posts(0, forumPageSize), [..._posts(forumPageSize - 2, 2), ..._posts(forumPageSize, 3)]]);
    await pumpScreen(tester, const _Host(), overrides: [forumApiProvider.overrideWithValue(api)], size: const Size(412, 900));
    await tester.drag(find.byType(ListView), const Offset(0, -6000));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -6000));
    await tester.pumpAndSettle();
    expect(api.postCalls.map((c) => c.$2), [1, 2], reason: 'page 2 was short: no page 3');
    final state = tester.state<ForumFeedListState>(find.byType(ForumFeedList));
    expect(state.mounted, isTrue);

    await tester.tap(find.text('switch'));
    await tester.pumpAndSettle();
    expect(api.postCalls.last, (const ForumQuery(feed: ForumFeed.popular), 1));
  });

  testWidgets('feed rows line up on the left whatever their title length', (tester) async {
    final short = ForumPost.fromJson({'id': 's', 'title': 'Short', 'createdAt': '2026-11-10T08:00:00Z'});
    await pumpScreen(
      tester,
      const Scaffold(body: ForumFeedList(query: ForumQuery())),
      overrides: [forumApiProvider.overrideWithValue(FakeForumApi(feed: [samplePost('p1'), short]))],
    );
    final longLeft = tester.getTopLeft(find.text(longTitle)).dx;
    expect(tester.getTopLeft(find.text('Short')).dx, longLeft);
  });

  group('a discussion', () {
    Future<FakeForumApi> pump(WidgetTester tester, {String status = 'active'}) async {
      final api = FakeForumApi(feed: [samplePost('p1', status: status)], replyItems: [sampleReply('r1')]);
      await pumpScreen(tester, const ForumPostScreen(idOrSlug: 'post-p1'), overrides: [forumApiProvider.overrideWithValue(api)]);
      return api;
    }

    testWidgets('a reply is sent once, trimmed, and shown', (tester) async {
      final api = await pump(tester);
      api.replyGate = Completer<void>();
      await tester.enterText(find.byType(TextField), '  Thanks, very useful.  ');
      await tester.tap(find.byTooltip('Reply'));
      await tester.tap(find.byTooltip('Reply'), warnIfMissed: false);
      await tester.pump();
      api.replyGate!.complete();
      await tester.pumpAndSettle();
      expect(api.sentReplies, ['Thanks, very useful.']);
      expect(find.text('Response posted'), findsOneWidget);
    });

    testWidgets('a discussion locked meanwhile says the reply was not posted', (tester) async {
      final api = await pump(tester);
      api.replyError = httpFailure(409);
      await tester.enterText(find.byType(TextField), 'Late reply');
      await tester.tap(find.byTooltip('Reply'));
      await tester.pumpAndSettle();
      expect(find.text('This discussion is locked. Your reply was not posted'), findsOneWidget);
    });

    testWidgets('a locked discussion shows its replies but takes no new one', (tester) async {
      await pump(tester, status: 'locked');
      expect(find.textContaining('This discussion is locked.'), findsOneWidget);
      expect(find.byTooltip('Reply'), findsNothing);
      expect(find.textContaining('inter-annotator'), findsOneWidget);
    });

    testWidgets('locked or not repliable, as the detail flags say', (tester) async {
      final locked = ForumPost.fromJson({'id': 'p', 'status': 'active', 'isLocked': true, 'canReply': false});
      expect(locked.isLocked, isTrue);
      final readOnly = ForumPost.fromJson({'id': 'p', 'status': 'active', 'canReply': false});
      expect((readOnly.isLocked, readOnly.canReply), (false, false));
      expect(ForumPost.fromJson({'id': 'p'}).canReply, isTrue, reason: 'list rows leave it out');
    });

    testWidgets('a hidden discussion shows nothing of it', (tester) async {
      await pump(tester, status: 'hidden');
      expect(find.text('This post is unavailable.'), findsOneWidget);
      expect(find.text(longTitle), findsNothing);
    });

    testWidgets('a reaction shows the count the server sends back', (tester) async {
      await pump(tester);
      // The post's own "❤️ 3" (mine) is turned off: the fake answers 0.
      await tester.tap(find.text('❤️ 3'));
      await tester.pumpAndSettle();
      expect(find.text('❤️ 3'), findsNothing);
      await tester.tap(find.byTooltip('Add reaction').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('🤔 Curious'));
      await tester.pumpAndSettle();
      expect(find.text('🤔 9'), findsOneWidget);
    });
  });

  group('a new discussion', () {
    Future<FakeForumApi> pump(WidgetTester tester, {String? communityId, bool verified = true}) async {
      final api = FakeForumApi();
      await pumpScreen(
        tester,
        NewPostScreen(communityId: communityId, communityName: communityId == null ? null : 'NLP'),
        overrides: [forumApiProvider.overrideWithValue(api)],
        user: testUser(verifiedAt: verified ? DateTime.utc(2026) : null),
      );
      return api;
    }

    Finder field(String label) => find.descendant(
          of: find.ancestor(of: find.text(label), matching: find.byType(Column)).first,
          matching: find.byType(TextFormField),
        );

    testWidgets('errors show under the fields; nothing is sent', (tester) async {
      final api = await pump(tester);
      await tester.tap(find.text('Start discussion'));
      await tester.pumpAndSettle();
      expect(find.text('Use at least 3 characters.'), findsOneWidget);
      expect(find.text('Write the discussion first.'), findsOneWidget);
      expect(api.created, isEmpty);
    });

    testWidgets('sends trimmed fields, the only category, and the community', (tester) async {
      final api = await pump(tester, communityId: 'rc1');
      await tester.enterText(field('Title'), '  How to split data?  ');
      await tester.enterText(field('Body'), ' By site. ');
      await tester.enterText(field('Tags'), 'data, Data, splits');
      await tester.tap(find.text('Start discussion'));
      await tester.pumpAndSettle();
      expect(api.created.single, {
        'type': 'QUESTION',
        'categoryId': 'c1',
        'title': 'How to split data?',
        'content': 'By site.',
        'tags': ['data', 'splits'],
        'researchCommunityId': 'rc1',
      });
    });

    testWidgets('posting in a community needs a verified email first', (tester) async {
      final api = await pump(tester, communityId: 'rc1', verified: false);
      expect(find.text('Verify your email to start discussions in communities'), findsOneWidget);
      final button = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Start discussion'));
      expect(button.onPressed, isNull);
      expect(api.created, isEmpty);
    });

    testWidgets('the same text posted twice is refused with a clear message', (tester) async {
      final api = await pump(tester);
      api.createError = httpFailure(409);
      await tester.enterText(field('Title'), 'How to split data?');
      await tester.enterText(field('Body'), 'By site.');
      await tester.tap(find.text('Start discussion'));
      await tester.pumpAndSettle();
      expect(find.text('You already posted this discussion recently'), findsOneWidget);
    });
  });
}
