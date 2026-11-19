import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

final projectsApiProvider = Provider<ProjectsApi>((ref) {
  return ProjectsApi(ref.watch(apiClientProvider).dio);
});

final FutureProvider<List<ProjectView>> projectsProvider =
    FutureProvider.autoDispose<List<ProjectView>>((ref) {
      return ref.watch(projectsApiProvider).list();
    });

final FutureProviderFamily<ProjectView, String> projectProvider = FutureProvider
    .autoDispose
    .family<ProjectView, String>((ref, id) {
      return ref.watch(projectsApiProvider).detail(id);
    });

typedef ProjectChatQuery = ({String projectId, String scope});

final FutureProviderFamily<List<ProjectChatMessage>, ProjectChatQuery>
projectChatProvider = FutureProvider.autoDispose
    .family<List<ProjectChatMessage>, ProjectChatQuery>((ref, query) {
      return ref
          .watch(projectsApiProvider)
          .listChat(query.projectId, scope: query.scope);
    });

class ProjectView {
  const ProjectView({
    required this.id,
    required this.title,
    this.description,
    this.ownerId,
    this.members = const [],
    this.papers = const [],
    this.memberCountFromApi,
    this.paperCountFromApi,
    this.accessRole,
  });

  factory ProjectView.fromJson(Map<String, dynamic> json) {
    return ProjectView(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      title: (json['title'] ?? trNow('Untitled project')).toString(),
      description: json['description']?.toString(),
      ownerId: json['ownerId']?.toString(),
      // The list endpoint sends `members: []` and the real number in
      // `memberCount`; counting the list would always give 0.
      memberCountFromApi: json['memberCount'] is num
          ? (json['memberCount'] as num).toInt()
          : null,
      paperCountFromApi: json['paperCount'] is num
          ? (json['paperCount'] as num).toInt()
          : null,
      accessRole: json['accessRole']?.toString(),
      members: (json['members'] as List<dynamic>? ?? [])
          .map(ProjectMemberRef.fromUnknown)
          .where((member) => member.id.isNotEmpty)
          .toList(),
      papers: (json['papers'] as List<dynamic>? ?? [])
          .map(ProjectPaperRef.fromUnknown)
          .where((paper) => paper.id.isNotEmpty)
          .toList(),
    );
  }

  final String id;
  final String title;
  final String? description;
  final String? ownerId;
  final List<ProjectMemberRef> members;
  final List<ProjectPaperRef> papers;
  final int? memberCountFromApi;
  final int? paperCountFromApi;

  /// "OWNER" or "MEMBER": the signed-in user's role, decided by the server.
  final String? accessRole;

  int get memberCount => memberCountFromApi ?? members.length;
  int get paperCount => paperCountFromApi ?? papers.length;

  /// Null when the server did not say (older payloads).
  bool? get viewerIsOwner => switch (accessRole?.toUpperCase()) {
        'OWNER' => true,
        'MEMBER' => false,
        _ => null,
      };
}

class ProjectPaperRef {
  const ProjectPaperRef({
    required this.id,
    required this.title,
    this.publicationYear,
    this.citationCount,
  });

  factory ProjectPaperRef.fromUnknown(Object? value) {
    if (value is String) {
      return ProjectPaperRef(id: value, title: trNow('Paper {{id}}', {'id': value}));
    }

    if (value is! Map<String, dynamic>) {
      return ProjectPaperRef(id: '', title: trNow('Unknown paper'));
    }

    final rawPaper = value['targetId'] is Map<String, dynamic>
        ? value['targetId'] as Map<String, dynamic>
        : value;

    final id = (rawPaper['_id'] ?? rawPaper['id'] ?? value['targetId'] ?? '')
        .toString();
    return ProjectPaperRef(
      id: id,
      title: (rawPaper['title'] ?? trNow('Untitled paper')).toString(),
      publicationYear: (rawPaper['publicationYear'] as num?)?.toInt(),
      citationCount: (rawPaper['citationCount'] as num?)?.toInt(),
    );
  }

  final String id;
  final String title;
  final int? publicationYear;
  final int? citationCount;
}

class ProjectMemberRef {
  const ProjectMemberRef({
    required this.id,
    required this.displayName,
    this.role,
  });

  factory ProjectMemberRef.fromUnknown(Object? value) {
    if (value is String) {
      return ProjectMemberRef(id: value, displayName: value);
    }

    if (value is! Map<String, dynamic>) {
      return ProjectMemberRef(id: '', displayName: trNow('Member'));
    }

    // Current API: {targetKind: 'User', targetId: <user summary or id>,
    // role}. Older payloads: {userId: <user or id>}.
    final ref = value['targetId'] ?? value['userId'];
    final rawUser = ref is Map<String, dynamic> ? ref : value;
    final id = (rawUser['_id'] ??
            rawUser['id'] ??
            (ref is String ? ref : null) ??
            '')
        .toString();
    final name =
        rawUser['displayName'] ??
        rawUser['fullName'] ??
        rawUser['name'] ??
        rawUser['email'] ??
        trNow('Member');

    return ProjectMemberRef(
      id: id,
      displayName: name.toString(),
      role: value['role']?.toString(),
    );
  }

  final String id;
  final String displayName;

  /// "OWNER" or "MEMBER" when the API sends it.
  final String? role;

  bool isOwnerOf(ProjectView project) =>
      role?.toUpperCase() == 'OWNER' ||
      (project.ownerId != null && project.ownerId == id);
}

class ChatSender {
  const ChatSender({
    required this.id,
    this.fullName,
    this.email,
    this.avatarUrl,
  });

  factory ChatSender.fromJson(Map<String, dynamic> json) => ChatSender(
    id: (json['id'] ?? json['_id'] ?? '').toString(),
    fullName: json['fullName']?.toString(),
    email: json['email']?.toString(),
    avatarUrl: json['avatarUrl']?.toString(),
  );

  final String id;
  final String? fullName;
  final String? email;
  final String? avatarUrl;
  String get displayName =>
      fullName?.isNotEmpty == true ? fullName! : (email ?? trNow('Member'));
}

class ProjectChatMessage {
  const ProjectChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
    this.userId = '',
    this.citedPaperIds = const [],
    this.requester,
    this.creditCost,
    this.isPinned = false,
  });

  factory ProjectChatMessage.fromJson(Map<String, dynamic> json) {
    return ProjectChatMessage(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      role: (json['role'] ?? 'assistant').toString(),
      content: (json['content'] ?? '').toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      userId: (json['userId'] ?? '').toString(),
      citedPaperIds: (json['citedPaperIds'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      requester: json['requester'] is Map<String, dynamic>
          ? ChatSender.fromJson(json['requester'] as Map<String, dynamic>)
          : null,
      creditCost: (json['creditCost'] as num?)?.toInt(),
      isPinned: json['isPinned'] == true,
    );
  }

  final String id;
  final String role;
  final String content;
  final String createdAt;
  final String userId;
  final List<String> citedPaperIds;
  final ChatSender? requester;
  final int? creditCost;
  final bool isPinned;
}

class ProjectsApi {
  const ProjectsApi(this._dio);

  final Dio _dio;

  Future<List<ProjectView>> list() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.projectsList);
    return (res.data?['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ProjectView.fromJson)
        .toList();
  }

  Future<ProjectView> detail(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.projectsDetail(id),
    );
    return ProjectView.fromJson(
      (res.data?['data'] as Map<String, dynamic>?) ?? {},
    );
  }

  /// [idempotencyKey] (a UUID) lets the same request be sent again after a
  /// timeout without creating a second project: the backend returns the
  /// project it already made for that key and those details.
  Future<ProjectView> create(
    String title,
    String? description, {
    String? idempotencyKey,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.projectsCreate,
      data: {
        'title': title,
        if (description != null && description.isNotEmpty)
          'description': description,
        'idempotencyKey': ?idempotencyKey,
      },
    );
    return ProjectView.fromJson(
      (res.data?['data'] as Map<String, dynamic>?) ?? {},
    );
  }

  Future<ProjectView> update(
    String projectId, {
    String? title,
    String? description,
  }) async {
    final res = await _dio.put<Map<String, dynamic>>(
      ApiRoutes.projectsUpdate(projectId),
      data: {
        if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
        if (description != null) 'description': description.trim(),
      },
    );
    return ProjectView.fromJson(
      (res.data?['data'] as Map<String, dynamic>?) ?? {},
    );
  }

  Future<void> delete(String projectId) =>
      _dio.delete<void>(ApiRoutes.projectsDelete(projectId));

  Future<void> addPaper(String projectId, String paperId) => _dio.post<void>(
    ApiRoutes.projectsAddPaper(projectId),
    data: {'paperId': paperId},
  );

  Future<void> removePaper(String projectId, String paperId) =>
      _dio.delete<void>(ApiRoutes.projectsRemovePaper(projectId, paperId));

  Future<void> addMember(
    String projectId, {
    required String targetId,
    String role = 'member',
  }) => _dio.post<void>(
    ApiRoutes.projectsAddMember(projectId),
    data: {'targetKind': 'User', 'targetId': targetId, 'role': role},
  );

  Future<void> removeMember(String projectId, String memberId) =>
      _dio.delete<void>(ApiRoutes.projectsRemoveMember(projectId, memberId));

  Future<List<ProjectChatMessage>> listChat(
    String projectId, {
    String scope = 'private',
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.projectsChatHistory(projectId),
      queryParameters: {'limit': 50, 'scope': scope},
    );
    final data = res.data?['data'] as Map<String, dynamic>? ?? {};
    return (data['messages'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ProjectChatMessage.fromJson)
        .toList();
  }

  Future<void> sendChat(
    String projectId,
    String message, {
    String scope = 'private',
  }) => _dio.post<void>(
    ApiRoutes.projectsChatSend(projectId),
    data: {'message': message, 'scope': scope},
  );

  Future<void> pinChat(String projectId, String messageId, bool pinned) =>
      _dio.patch<void>(
        ApiRoutes.projectsChatPin(projectId, messageId),
        data: {'pinned': pinned},
      );
}
