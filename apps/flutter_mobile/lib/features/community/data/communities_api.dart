import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/core/utils/json_read.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

/// Sorts of the web community directory (community-list.tsx), minus "name".
enum CommunitySort { recent, newest, members, discussions }

String communitySortLabel(CommunitySort sort) => switch (sort) {
      CommunitySort.recent => tk('Recently active'),
      CommunitySort.newest => tk('Newest'),
      CommunitySort.members => tk('Most members'),
      CommunitySort.discussions => tk('Most discussions'),
    };

class Community {
  const Community({
    required this.id,
    required this.name,
    required this.slug,
    required this.status,
    this.description,
    this.researchField,
    this.researchTopics = const [],
    this.rules = const [],
    this.memberCount = 0,
    this.threadCount = 0,
    this.moderators = const [],
    this.membershipRole,
    this.membershipStatus,
    this.canManage = false,
    this.isOwner = false,
    this.isAdmin = false,
  });

  factory Community.fromJson(Json j) {
    final membership = jMap(j['viewerMembership']);
    return Community(
      id: jId(j),
      name: jStr(j['name']) ?? '',
      slug: jStr(j['slug']) ?? jId(j),
      status: jStr(j['status']) ?? 'ACTIVE',
      description: jStr(j['description']),
      researchField: jStr(j['researchField']),
      researchTopics: jStrings(j['researchTopics']),
      rules: jStrings(j['rules']),
      memberCount: jInt(j['memberCount']),
      threadCount: jInt(j['threadCount']),
      moderators: [
        for (final m in jMaps(j['moderators'])) ?jStr(m['fullName']),
      ],
      membershipRole: jStr(membership['role']),
      membershipStatus: jStr(membership['status']),
      canManage: jBool(j['canManage']),
      isOwner: jBool(j['isOwner']),
      isAdmin: jBool(j['isAdmin']),
    );
  }

  final String id;
  final String name;
  final String slug;

  /// ACTIVE, ARCHIVED, PENDING_APPROVAL or REJECTED.
  final String status;
  final String? description;
  final String? researchField;
  final List<String> researchTopics;
  final List<String> rules;
  final int memberCount;
  final int threadCount;
  final List<String> moderators;

  /// owner, moderator or member; null when not a member.
  final String? membershipRole;

  /// active or banned.
  final String? membershipStatus;
  final bool canManage;
  final bool isOwner;
  final bool isAdmin;

  bool get isArchived => status == 'ARCHIVED';
  bool get isMember => membershipStatus == 'active';
  bool get isBanned => membershipStatus == 'banned';

  /// Join and posting are open only in an active community the viewer is
  /// not banned from (community.service `join`, forum `createPost`).
  bool get canJoin => status == 'ACTIVE' && membershipStatus == null;

  /// Members (and admins) of an active community may ask for the summary of
  /// recent discussions (web community-discussions-tab `canSummarize`).
  bool get canSummarize => (isMember || isAdmin) && status == 'ACTIVE';

  Community withMembership(String? role, String? status, {int memberDelta = 0}) =>
      Community(
        id: id,
        name: name,
        slug: slug,
        status: this.status,
        description: description,
        researchField: researchField,
        researchTopics: researchTopics,
        rules: rules,
        memberCount: (memberCount + memberDelta).clamp(0, 1 << 31),
        threadCount: threadCount,
        moderators: moderators,
        membershipRole: role,
        membershipStatus: status,
        canManage: canManage,
        isOwner: isOwner,
        isAdmin: isAdmin,
      );
}

/// One active member as the public roster shows it (no email).
class CommunityMember {
  const CommunityMember({required this.id, required this.fullName, required this.role, this.institution});
  factory CommunityMember.fromJson(Json j) => CommunityMember(
        id: jId(j),
        fullName: jStr(j['fullName']) ?? trNow('Unnamed researcher'),
        role: jStr(j['role']) ?? 'member',
        institution: jStr(j['institution']),
      );
  final String id;
  final String fullName;

  /// owner, moderator or member.
  final String role;
  final String? institution;
}

String communityRoleLabel(String role) => switch (role) {
      'owner' => tk('Owner'),
      'moderator' => tk('Moderator'),
      _ => tk('Member'),
    };

class MembersPage {
  const MembersPage(this.items, {required this.page, required this.totalPages});
  final List<CommunityMember> items;
  final int page;
  final int totalPages;
  bool get hasMore => page < totalPages;
}

class RelatedPaper {
  const RelatedPaper({required this.id, required this.title, this.year, this.citations = 0});
  factory RelatedPaper.fromJson(Json j) => RelatedPaper(
        id: jId(j),
        title: jStr(j['title']) ?? '',
        year: j['publicationYear'] == null ? null : jInt(j['publicationYear']),
        citations: jInt(j['citationCount']),
      );
  final String id;
  final String title;
  final int? year;
  final int citations;
}

class RelatedGap {
  const RelatedGap({required this.id, required this.title, this.topic});
  factory RelatedGap.fromJson(Json j) =>
      RelatedGap(id: jId(j), title: jStr(j['title']) ?? '', topic: jStr(j['topic']));
  final String id;
  final String title;
  final String? topic;
}

/// `GET /communities/:id/summary`: none, pending, completed or failed.
class CommunitySummary {
  const CommunitySummary({required this.status, this.summary, this.sources = const []});
  factory CommunitySummary.fromJson(Json j) => CommunitySummary(
        status: jStr(j['status']) ?? 'none',
        summary: jStr(j['summary']),
        sources: [
          for (final src in jMaps(j['sources']))
            if (jStr(src['title']) != null)
              (jInt(src['n']), jStr(src['title'])!, jStr(src['publicSlug']) ?? jId(src)),
        ],
      );
  final String status;
  final String? summary;

  /// Number, title and the post to open.
  final List<(int, String, String)> sources;
}

@immutable
class CommunityQuery {
  const CommunityQuery({
    this.sort = CommunitySort.recent,
    this.joinedOnly = false,
    this.search,
  });
  final CommunitySort sort;
  final bool joinedOnly;
  final String? search;

  @override
  bool operator ==(Object other) =>
      other is CommunityQuery &&
      other.sort == sort &&
      other.joinedOnly == joinedOnly &&
      other.search == search;

  @override
  int get hashCode => Object.hash(sort, joinedOnly, search);
}

class CommunitiesApi {
  const CommunitiesApi(this._dio);
  final Dio _dio;

  Future<List<Community>> list(CommunityQuery q) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.communities,
      queryParameters: {
        'sort': q.sort.name,
        'scope': q.joinedOnly ? 'mine' : 'all',
        'pageSize': 50,
        if ((q.search ?? '').trim().isNotEmpty) 'q': q.search!.trim(),
      },
    );
    return jMaps(jMap(res.data)['data'])
        .map(Community.fromJson)
        .where((c) => c.id.isNotEmpty && c.name.isNotEmpty)
        .toList();
  }

  Future<Community> get(String idOrSlug) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.community(idOrSlug));
    return Community.fromJson(jMap(jMap(res.data)['data']));
  }

  /// Returns the new membership `{role, status}`.
  Future<(String?, String?)> join(String id) async {
    final res = await _dio.post<Map<String, dynamic>>(ApiRoutes.communityJoin(id));
    final m = jMap(jMap(res.data)['data']);
    return (jStr(m['role']) ?? 'member', jStr(m['status']) ?? 'active');
  }

  Future<void> leave(String id) =>
      _dio.delete<void>(ApiRoutes.communityMembership(id));

  Future<MembersPage> members(String id, int page) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.communityPublicMembers(id),
      queryParameters: {'page': page, 'pageSize': 50},
    );
    final body = jMap(res.data);
    final meta = jMap(body['meta']);
    return MembersPage(
      jMaps(body['data']).map(CommunityMember.fromJson).toList(),
      page: jInt(meta['page'], page),
      totalPages: jInt(meta['totalPages'], page),
    );
  }

  Future<List<RelatedPaper>> relatedPapers(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.communityRelatedPapers(id));
    return jMaps(jMap(res.data)['data'])
        .map(RelatedPaper.fromJson)
        .where((p) => p.id.isNotEmpty && p.title.isNotEmpty)
        .toList();
  }

  Future<List<RelatedGap>> relatedGaps(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.communityRelatedGaps(id));
    return jMaps(jMap(res.data)['data'])
        .map(RelatedGap.fromJson)
        .where((g) => g.title.isNotEmpty)
        .toList();
  }

  Future<CommunitySummary> summary(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.communitySummary(id));
    return CommunitySummary.fromJson(jMap(jMap(res.data)['data']));
  }

  Future<CommunitySummary> requestSummary(String id) async {
    final res = await _dio.post<Map<String, dynamic>>(ApiRoutes.communitySummary(id));
    return CommunitySummary.fromJson(jMap(jMap(res.data)['data']));
  }
}

final communitiesApiProvider = Provider<CommunitiesApi>(
  (ref) => CommunitiesApi(ref.watch(apiClientProvider).dio),
);

final FutureProviderFamily<List<Community>, CommunityQuery> communitiesProvider =
    FutureProvider.autoDispose.family<List<Community>, CommunityQuery>(
  (ref, q) => ref.watch(communitiesApiProvider).list(q),
);

final FutureProviderFamily<Community, String> communityProvider =
    FutureProvider.autoDispose.family<Community, String>(
  (ref, slug) => ref.watch(communitiesApiProvider).get(slug),
);

final FutureProviderFamily<(List<RelatedPaper>, List<RelatedGap>), String> communityRelatedProvider =
    FutureProvider.autoDispose.family<(List<RelatedPaper>, List<RelatedGap>), String>((ref, id) async {
  final api = ref.watch(communitiesApiProvider);
  final results = await Future.wait([api.relatedPapers(id), api.relatedGaps(id)]);
  return (results[0] as List<RelatedPaper>, results[1] as List<RelatedGap>);
});

final FutureProviderFamily<CommunitySummary, String> communitySummaryProvider =
    FutureProvider.autoDispose.family<CommunitySummary, String>(
  (ref, id) => ref.watch(communitiesApiProvider).summary(id),
);
