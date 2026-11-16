import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/core/utils/json_read.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

/// Forum feeds the web offers (forum-navigation.ts), minus its personalised
/// "For you" feed: Home already has "Suggested for you".
enum ForumFeed { latest, unanswered, popular, following }

String forumFeedLabel(ForumFeed feed) => switch (feed) {
      ForumFeed.latest => tk('Latest'),
      ForumFeed.unanswered => tk('Unanswered'),
      ForumFeed.popular => tk('Popular'),
      ForumFeed.following => tk('Following'),
    };

/// Post types and their web labels (forum-post-type-badge.tsx).
const forumPostTypes = [
  'QUESTION',
  'DISCUSSION',
  'PAPER_DISCUSSION',
  'RESEARCH_GAP_DISCUSSION',
];

String forumTypeLabel(String type) => switch (type) {
      'QUESTION' => tk('Question'),
      'PAPER_DISCUSSION' => tk('Paper Discussion'),
      'RESEARCH_GAP_DISCUSSION' => tk('Research Gap Discussion'),
      _ => tk('Discussion'),
    };

/// Report reasons of the web report dialog (forum-detail.tsx), in order.
final List<(String, String)> forumReportReasons = [
  ('SPAM', tk('Spam')),
  ('OFF_TOPIC', tk('Off topic')),
  ('HARASSMENT', tk('Harassment')),
  ('PRIVACY', tk('Privacy')),
  ('PLAGIARISM_CONCERN', tk('Plagiarism concern')),
  ('COPYRIGHT_CONCERN', tk('Copyright concern')),
  ('INAPPROPRIATE_CONTENT', tk('Inappropriate content')),
  ('OTHER', tk('Other')),
];

/// Backend limit of a report's context (forum.routes.ts `reportSchema`).
const forumReportMax = 2000;

/// Discussion notification levels (web forum-notification-menu.tsx).
final List<(String, String, String)> forumNotificationLevels = [
  ('WATCHING', tk('Watching'), tk('Notify me about every new reply in this discussion.')),
  ('TRACKING', tk('Tracking'), tk('Keep this discussion in Following. Notify me when someone replies to me.')),
  ('NORMAL', tk('Normal'), tk('Notify me only when someone replies to me.')),
  ('MUTED', tk('Muted'), tk('Do not notify me about this discussion.')),
];

/// The ten reactions of the web (forum-reactions.ts), in its order.
final List<(String, String, String)> forumReactions = [
  ('LIKE', '❤️', tk('Like')),
  ('INSIGHTFUL', '💡', tk('Insightful')),
  ('CELEBRATE', '🎉', tk('Celebrate')),
  ('CURIOUS', '🤔', tk('Curious')),
  ('LOVE', '🥰', tk('Love')),
  ('LAUGH', '😂', tk('Laugh')),
  ('SURPRISED', '😮', tk('Surprised')),
  ('SAD', '😢', tk('Sad')),
  ('AGREE', '👍', tk('Agree')),
  ('DISAGREE', '👎', tk('Disagree')),
];
final Set<String> _reactionNames = {for (final r in forumReactions) r.$1};

Map<String, int> _reactionCounts(Object? value) {
  final row = jMap(value);
  return {
    for (final name in _reactionNames)
      if (jInt(row[name]) > 0) name: jInt(row[name]),
  };
}

Set<String> _viewerReactions(Object? value) =>
    {for (final r in jStrings(value)) if (_reactionNames.contains(r)) r};

/// Reaction state of a post or a reply, always as the server last sent it.
class ReactionState {
  const ReactionState({this.counts = const {}, this.mine = const {}});
  factory ReactionState.fromJson(Json j) => ReactionState(
        counts: _reactionCounts(j['counts'] ?? j['reactionCounts']),
        mine: _viewerReactions(j['viewerReactions']),
      );
  final Map<String, int> counts;
  final Set<String> mine;
}

class ForumAuthor {
  const ForumAuthor({required this.id, required this.fullName});
  factory ForumAuthor.fromJson(Json j) => ForumAuthor(
        id: jId(j),
        fullName: jStr(j['fullName']) ?? trNow('Unnamed researcher'),
      );
  final String id;
  final String fullName;
}

class ForumPlace {
  const ForumPlace({required this.id, required this.name, required this.slug});
  static ForumPlace? fromJson(Object? value) {
    final j = jMap(value);
    final name = jStr(j['name']);
    if (name == null) return null;
    return ForumPlace(id: jId(j), name: name, slug: jStr(j['slug']) ?? jId(j));
  }

  final String id;
  final String name;
  final String slug;
}

class ForumPost {
  const ForumPost({
    required this.id,
    required this.type,
    required this.title,
    required this.content,
    required this.author,
    required this.status,
    required this.createdAt,
    this.publicSlug,
    this.category,
    this.researchCommunity,
    this.tags = const [],
    this.replyCount = 0,
    this.helpfulCount = 0,
    this.viewCount = 0,
    this.isPinned = false,
    this.isFollowing = false,
    this.locked = false,
    this.canReply = true,
    this.notificationLevel,
    this.acceptedCommentId,
    this.lastActivityAt,
    this.reactions = const ReactionState(),
  });

  factory ForumPost.fromJson(Json j) => ForumPost(
        id: jId(j),
        publicSlug: jStr(j['publicSlug']),
        type: jStr(j['type']) ?? 'DISCUSSION',
        title: jStr(j['title']) ?? '',
        content: jStr(j['content']) ?? jStr(j['body']) ?? '',
        // Lists send the author and category as `authorId` / `communityId`
        // objects (web forum.api.ts reads both names).
        author: ForumAuthor.fromJson(jMap(j['author'] ?? j['authorId'])),
        category: ForumPlace.fromJson(j['community'] ?? j['communityId'] ?? j['category']),
        researchCommunity: ForumPlace.fromJson(j['researchCommunity']),
        tags: jStrings(j['tags']),
        status: jStr(j['status']) ?? 'active',
        replyCount: jInt(j['replyCount'] ?? j['commentCount']),
        helpfulCount: jInt(j['helpfulCount']),
        viewCount: jInt(j['viewCount']),
        isPinned: jBool(j['isPinned']),
        isFollowing: jBool(j['isFollowing']),
        locked: jBool(j['isLocked']),
        // Only the detail says it; a list row leaves it out.
        canReply: j['canReply'] != false,
        notificationLevel: jStr(j['notificationLevel']),
        acceptedCommentId: jStr(j['acceptedCommentId']),
        lastActivityAt: jDate(j['lastActivityAt']),
        createdAt: jDate(j['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        reactions: ReactionState.fromJson(j),
      );

  final String id;
  final String? publicSlug;
  final String type;
  final String title;
  final String content;
  final ForumAuthor author;
  final ForumPlace? category;
  final ForumPlace? researchCommunity;
  final List<String> tags;

  /// active, hidden, locked or deleted.
  final String status;
  final int replyCount;
  final int helpfulCount;
  final int viewCount;
  final bool isPinned;
  final bool isFollowing;
  final bool locked;

  /// False when the viewer may not reply here: an archived category, a
  /// community restriction (backend `canReply`).
  final bool canReply;

  /// WATCHING, TRACKING, NORMAL or MUTED; null when the viewer never set it.
  final String? notificationLevel;
  final String? acceptedCommentId;
  final DateTime? lastActivityAt;
  final DateTime createdAt;
  final ReactionState reactions;

  bool get isLocked => locked || status == 'locked';
  bool get isUnavailable => status == 'hidden' || status == 'deleted';

  /// The level the web shows when none was chosen (forum-detail.tsx).
  String get effectiveNotificationLevel =>
      notificationLevel ?? (isFollowing ? 'WATCHING' : 'NORMAL');

  /// No reply, edit or reaction on a locked or removed discussion
  /// (web `readOnly`).
  bool get readOnly => isLocked || isUnavailable;
}

class ForumReply {
  const ForumReply({
    required this.id,
    required this.author,
    required this.content,
    required this.status,
    required this.createdAt,
    this.isAccepted = false,
    this.editedAt,
    this.parentCommentId,
    this.postNumber,
    this.reactions = const ReactionState(),
  });
  factory ForumReply.fromJson(Json j) => ForumReply(
        id: jId(j),
        author: ForumAuthor.fromJson(jMap(j['author'] ?? j['authorId'])),
        content: jStr(j['content']) ?? jStr(j['body']) ?? '',
        status: jStr(j['status']) ?? 'active',
        isAccepted: jBool(j['isAccepted']),
        editedAt: jDate(j['editedAt']),
        parentCommentId: jStr(j['parentCommentId']),
        postNumber: j['postNumber'] == null ? null : jInt(j['postNumber']),
        createdAt: jDate(j['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        reactions: ReactionState.fromJson(j),
      );
  final String id;
  final String? parentCommentId;

  /// Place in the thread (the opening post is 1), used in its web link.
  final int? postNumber;
  final ForumAuthor author;
  final String content;
  final String status;
  final bool isAccepted;
  final DateTime? editedAt;
  final DateTime createdAt;
  final ReactionState reactions;
}

class ForumCategory {
  const ForumCategory({required this.id, required this.name, this.active = true});
  factory ForumCategory.fromJson(Json j) => ForumCategory(
        id: jId(j),
        name: jStr(j['name']) ?? '',
        active: (jStr(j['status']) ?? 'ACTIVE') == 'ACTIVE',
      );
  final String id;
  final String name;
  final bool active;
}

class ForumPage<T> {
  const ForumPage(this.items, {required this.page, required this.totalPages});
  final List<T> items;
  final int page;
  final int totalPages;
  bool get hasMore => page < totalPages;
}

/// What the feed asks for. Equal queries share one cached page set.
@immutable
class ForumQuery {
  const ForumQuery({
    this.feed = ForumFeed.latest,
    this.categoryId,
    this.researchCommunityId,
    this.search,
    this.type,
    this.topic,
  });
  final ForumFeed feed;
  final String? categoryId;
  final String? researchCommunityId;
  final String? search;

  /// One of [forumPostTypes], or null for all.
  final String? type;

  /// A community research topic (community discussions only).
  final String? topic;

  bool get hasFilters =>
      categoryId != null || type != null || topic != null || (search ?? '').isNotEmpty;

  Map<String, Object> params(int page) => {
        'page': page,
        'pageSize': forumPageSize,
        'feed': feed.name,
        'category': ?categoryId,
        'researchCommunityId': ?researchCommunityId,
        'type': ?type,
        'topic': ?topic,
        if ((search ?? '').trim().isNotEmpty) 'query': search!.trim(),
      };

  @override
  bool operator ==(Object other) =>
      other is ForumQuery &&
      other.feed == feed &&
      other.categoryId == categoryId &&
      other.researchCommunityId == researchCommunityId &&
      other.search == search &&
      other.type == type &&
      other.topic == topic;

  @override
  int get hashCode =>
      Object.hash(feed, categoryId, researchCommunityId, search, type, topic);
}

const forumPageSize = 20;
const forumReplyPageSize = 25;

/// Limits of the backend post and comment schemas (forum.routes.ts).
const forumTitleMin = 3;
const forumTitleMax = 240;
const forumBodyMax = 20000;
const forumReplyMax = 10000;
const forumTagsMax = 5;
const forumTagMax = 80;

class ForumApi {
  const ForumApi(this._dio);
  final Dio _dio;

  ForumPage<T> _page<T>(Object? body, T Function(Json) parse, int page) {
    final b = jMap(body);
    final meta = jMap(b['meta']);
    return ForumPage(
      jMaps(b['data']).map(parse).toList(),
      page: jInt(meta['page'], page),
      totalPages: jInt(meta['totalPages'], page),
    );
  }

  Future<ForumPage<ForumPost>> posts(ForumQuery q, int page) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.forumPosts,
      queryParameters: q.params(page),
    );
    return _page(res.data, ForumPost.fromJson, page);
  }

  Future<ForumPost> post(String idOrSlug) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.forumPost(idOrSlug));
    return ForumPost.fromJson(jMap(jMap(res.data)['data']));
  }

  Future<ForumPage<ForumReply>> replies(String postId, int page) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.forumComments(postId),
      queryParameters: {'page': page, 'pageSize': forumReplyPageSize},
    );
    return _page(res.data, ForumReply.fromJson, page);
  }

  Future<ForumReply> reply(String postId, String content, {String? parentCommentId}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.forumComments(postId),
      data: {'content': content, 'parentCommentId': ?parentCommentId},
    );
    return ForumReply.fromJson(jMap(jMap(res.data)['data']));
  }

  /// Sets or clears one reaction; returns the server's new counts.
  Future<ReactionState> react({
    required bool comment,
    required String id,
    required String reaction,
    required bool active,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.forumReactions(comment: comment, id: id),
      data: {'reaction': reaction, 'active': active},
    );
    return ReactionState.fromJson(jMap(jMap(res.data)['data']));
  }

  /// Reports a post or a reply to the moderators.
  Future<void> report({
    required bool comment,
    required String id,
    required String reason,
    String? description,
  }) =>
      _dio.post<void>(ApiRoutes.forumReports, data: {
        'targetType': comment ? 'comment' : 'post',
        'targetId': id,
        'reason': reason,
        'description': ?description,
      });

  Future<ForumPost> updatePost(
    String postId, {
    required String title,
    required String content,
    required List<String> tags,
  }) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      ApiRoutes.forumPost(postId),
      data: {'title': title, 'content': content, 'tags': tags},
    );
    return ForumPost.fromJson(jMap(jMap(res.data)['data']));
  }

  Future<ForumReply> updateReply(String replyId, String content) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      ApiRoutes.forumComment(replyId),
      data: {'content': content},
    );
    return ForumReply.fromJson(jMap(jMap(res.data)['data']));
  }

  Future<void> deletePost(String postId) => _dio.delete<void>(ApiRoutes.forumPost(postId));

  Future<void> deleteReply(String replyId) => _dio.delete<void>(ApiRoutes.forumComment(replyId));

  /// Marks [replyId] as the accepted response, or clears it when null.
  Future<void> accept(String postId, String? replyId) => replyId == null
      ? _dio.delete<void>(ApiRoutes.forumAcceptedAnswer(postId))
      : _dio.post<void>(ApiRoutes.forumAcceptedAnswer(postId, replyId));

  Future<void> setNotificationLevel(String postId, String level) => _dio.patch<void>(
        ApiRoutes.forumNotificationLevel(postId),
        data: {'level': level},
      );


  Future<List<ForumCategory>> categories() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.forumCategories);
    return jMaps(jMap(res.data)['data'])
        .map(ForumCategory.fromJson)
        .where((c) => c.id.isNotEmpty && c.name.isNotEmpty)
        .toList();
  }

  Future<ForumPost> create({
    required String type,
    required String categoryId,
    required String title,
    required String content,
    List<String> tags = const [],
    String? researchCommunityId,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.forumPosts,
      data: {
        'type': type,
        'categoryId': categoryId,
        'title': title,
        'content': content,
        'tags': tags,
        'researchCommunityId': ?researchCommunityId,
      },
    );
    return ForumPost.fromJson(jMap(jMap(res.data)['data']));
  }
}

final forumApiProvider = Provider<ForumApi>(
  (ref) => ForumApi(ref.watch(apiClientProvider).dio),
);

final FutureProvider<List<ForumCategory>> forumCategoriesProvider =
    FutureProvider.autoDispose<List<ForumCategory>>(
  (ref) => ref.watch(forumApiProvider).categories(),
);

final FutureProviderFamily<ForumPost, String> forumPostProvider =
    FutureProvider.autoDispose.family<ForumPost, String>(
  (ref, idOrSlug) => ref.watch(forumApiProvider).post(idOrSlug),
);

/// Tag text as the backend keeps it: trimmed, inner spaces collapsed, no
/// duplicates (case-insensitive), at most [forumTagsMax].
List<String> parseForumTags(String raw) {
  final seen = <String>{};
  return [
    for (final part in raw.split(','))
      if (part.trim().replaceAll(RegExp(r'\s+'), ' ') case final tag
          when tag.isNotEmpty && seen.add(tag.toLowerCase()))
        tag,
  ];
}
