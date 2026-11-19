import 'dart:async';

import 'package:flutter_mobile/features/community/data/communities_api.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/projects/data/invitations_api.dart';
import 'package:flutter_mobile/features/reviews/data/review_requests_api.dart';
import 'package:flutter_test/flutter_test.dart';

/// Long on purpose: layouts must wrap, not overflow.
const longTitle =
    'Federated learning for privacy-preserving medical imaging across '
    'multiple Vietnamese hospitals with heterogeneous data';

ForumPost samplePost(
  String id, {
  String status = 'active',
  bool pinned = false,
  String authorId = 'u2',
  String type = 'QUESTION',
}) =>
    ForumPost.fromJson({
      'id': id,
      'publicSlug': 'post-$id',
      'type': type,
      'title': longTitle,
      'content': 'How do you evaluate a medical imaging dataset before training? '
          'We compared three hospitals and the label quality differed a lot.',
      'author': {'id': authorId, 'fullName': 'Nguyễn Thị Thanh Hương'},
      'community': {'id': 'c1', 'name': 'Methods and evaluation', 'slug': 'methods'},
      'tags': ['medical-imaging', 'datasets'],
      'status': status,
      'replyCount': 12,
      'helpfulCount': 4,
      'isPinned': pinned,
      'createdAt': '2026-11-10T08:00:00Z',
      'lastActivityAt': '2026-11-15T08:00:00Z',
      'reactionCounts': {'LIKE': 3, 'INSIGHTFUL': 1},
      'viewerReactions': ['LIKE'],
    });

ForumReply sampleReply(String id, {String authorId = 'u3', String? parent}) => ForumReply.fromJson({
      'id': id,
      'postNumber': 2,
      'parentCommentId': ?parent,
      'author': {'id': authorId, 'fullName': 'Trần Minh Khoa'},
      'content': 'Check inter-annotator agreement first, then the class balance per site.',
      'status': 'active',
      'createdAt': '2026-11-11T08:00:00Z',
      'reactionCounts': {'AGREE': 2},
    });

/// Forum API that answers from memory and records what was sent.
class FakeForumApi extends Fake implements ForumApi {
  FakeForumApi({
    this.feed = const [],
    this.replyItems = const [],
    this.totalPages = 1,
    this.categoryList = const [ForumCategory(id: 'c1', name: 'Methods and evaluation')],
  });

  final List<ForumPost> feed;
  final List<ForumReply> replyItems;
  final int totalPages;
  final List<ForumCategory> categoryList;
  final List<(ForumQuery, int)> postCalls = [];
  final List<String> sentReplies = [];
  final List<Map<String, Object?>> created = [];
  Object? replyError;
  Object? createError;
  Completer<void>? replyGate;

  @override
  Future<ForumPage<ForumPost>> posts(ForumQuery q, int page) async {
    postCalls.add((q, page));
    return ForumPage(page <= totalPages ? feed : const [], page: page, totalPages: totalPages);
  }

  @override
  Future<ForumPost> post(String idOrSlug) async =>
      feed.isEmpty ? samplePost('p1') : feed.first;

  @override
  Future<ForumPage<ForumReply>> replies(String postId, int page) async =>
      ForumPage(page == 1 ? replyItems : const [], page: page, totalPages: 1);

  @override
  Future<ForumReply> reply(String postId, String content, {String? parentCommentId}) async {
    sentReplies.add(parentCommentId == null ? content : '$content @$parentCommentId');
    await replyGate?.future;
    // ignore: only_throw_errors, the test injects what the API may throw
    if (replyError != null) throw replyError!;
    return sampleReply('new-${sentReplies.length}');
  }

  @override
  Future<List<ForumCategory>> categories() async => categoryList;

  @override
  Future<ForumPost> create({
    required String type,
    required String categoryId,
    required String title,
    required String content,
    List<String> tags = const [],
    String? researchCommunityId,
  }) async {
    created.add({
      'type': type,
      'categoryId': categoryId,
      'title': title,
      'content': content,
      'tags': tags,
      'researchCommunityId': researchCommunityId,
    });
    // ignore: only_throw_errors, the test injects what the API may throw
    if (createError != null) throw createError!;
    return samplePost('created');
  }

  @override
  Future<ReactionState> react({
    required bool comment,
    required String id,
    required String reaction,
    required bool active,
  }) async =>
      ReactionState(counts: {reaction: active ? 9 : 0}, mine: active ? {reaction} : {});

  final List<String> calls = [];

  @override
  Future<void> report({required bool comment, required String id, required String reason, String? description}) async {
    calls.add('report ${comment ? 'comment' : 'post'} $id $reason ${description ?? '-'}');
    // ignore: only_throw_errors, the test injects what the API may throw
    if (reportError != null) throw reportError!;
  }

  Object? reportError;

  @override
  Future<void> deletePost(String postId) async => calls.add('delete post $postId');

  @override
  Future<void> deleteReply(String replyId) async => calls.add('delete reply $replyId');

  @override
  Future<ForumReply> updateReply(String replyId, String content) async {
    calls.add('edit reply $replyId $content');
    return ForumReply.fromJson({'id': replyId, 'content': content, 'author': {'id': 'u1', 'fullName': 'Minh Nguyen'}});
  }

  @override
  Future<void> accept(String postId, String? replyId) async => calls.add('accept $postId ${replyId ?? '-'}');

  @override
  Future<void> setNotificationLevel(String postId, String level) async => calls.add('level $postId $level');
}

Community sampleCommunity({
  String status = 'ACTIVE',
  String? membership,
  bool owner = false,
}) =>
    Community.fromJson({
      'id': 'rc1',
      'name': 'Vietnamese natural language processing research group',
      'slug': 'nlp-vn',
      'status': status,
      'description': 'Corpora, tokenisers and evaluation for Vietnamese text, '
          'from word segmentation to large language models.',
      'researchField': 'Computer science',
      'researchTopics': ['tokenisation', 'evaluation'],
      'rules': ['Cite your sources.'],
      'memberCount': 128,
      'threadCount': 1,
      'moderators': [
        {'id': 'u9', 'fullName': 'Lê Văn An'},
      ],
      if (membership != null) 'viewerMembership': {'role': owner ? 'owner' : 'member', 'status': membership},
      'isOwner': owner,
    });

ReviewRequest sampleReview({
  String status = 'REQUESTED',
  String requester = 'u2',
  String reviewer = 'u1',
  DateTime? dueAt,
  Map<String, Object?>? latest,
  List<Map<String, Object?>> rounds = const [],
}) =>
    ReviewRequest.fromJson({
      'id': 'rr-$status',
      'status': status,
      'message': 'Could you look at the methodology section before Friday?',
      'dueAt': dueAt?.toIso8601String(),
      'createdAt': '2026-11-01T08:00:00Z',
      'requester': {'id': requester, 'fullName': 'Phạm Quốc Bảo'},
      'reviewer': {'id': reviewer, 'fullName': 'Đỗ Thị Mai Anh'},
      'assignment': {'id': 'as1', 'status': 'assigned'},
      'artifact': {'title': longTitle, 'type': 'RESEARCH_PROPOSAL', 'revisionNumber': 2},
      'latestReview': ?latest,
      'reviews': rounds,
    });

ProjectInvitation sampleInvitation() => ProjectInvitation.fromJson({
      'id': 'inv1',
      'projectId': 'p9',
      'projectTitle': longTitle,
      'invitedEmail': 'minh@fpt.edu.vn',
      'inviterName': 'Nguyễn Thị Thanh Hương',
      'expiresAt': '2026-11-30T08:00:00Z',
    })!;
