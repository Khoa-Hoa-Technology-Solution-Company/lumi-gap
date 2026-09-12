import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
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

final FutureProviderFamily<List<ProjectTeamChatMessage>, String>
projectTeamChatProvider = FutureProvider.autoDispose
    .family<List<ProjectTeamChatMessage>, String>((ref, id) {
      return ref.watch(projectsApiProvider).listTeamChat(id);
    });

class ProjectView {
  const ProjectView({
    required this.id,
    required this.title,
    this.description,
    this.ownerId,
    this.members = const [],
    this.papers = const [],
  });

  factory ProjectView.fromJson(Map<String, dynamic> json) {
    return ProjectView(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      title: (json['title'] ?? 'Untitled project').toString(),
      description: json['description']?.toString(),
      ownerId: json['ownerId']?.toString(),
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
      return ProjectPaperRef(id: value, title: 'Paper $value');
    }

    if (value is! Map<String, dynamic>) {
      return const ProjectPaperRef(id: '', title: 'Unknown paper');
    }

    final rawPaper = value['targetId'] is Map<String, dynamic>
        ? value['targetId'] as Map<String, dynamic>
        : value;

    final id = (rawPaper['_id'] ?? rawPaper['id'] ?? value['targetId'] ?? '').toString();
    return ProjectPaperRef(
      id: id,
      title: (rawPaper['title'] ?? 'Untitled paper').toString(),
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
  });

  factory ProjectMemberRef.fromUnknown(Object? value) {
    if (value is String) {
      return ProjectMemberRef(id: value, displayName: value);
    }

    if (value is! Map<String, dynamic>) {
      return const ProjectMemberRef(id: '', displayName: 'Member');
    }

    final rawUser = value['userId'] is Map<String, dynamic>
        ? value['userId'] as Map<String, dynamic>
        : value;
    final id = (rawUser['_id'] ?? rawUser['id'] ?? value['userId'] ?? '').toString();
    final name = rawUser['displayName'] ??
        rawUser['fullName'] ??
        rawUser['name'] ??
        rawUser['email'] ??
        'Member';

    return ProjectMemberRef(id: id, displayName: name.toString());
  }

  final String id;
  final String displayName;
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
      fullName?.isNotEmpty == true ? fullName! : (email ?? 'Member');
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

class ProjectTeamChatMessage {
  const ProjectTeamChatMessage({
    required this.id,
    required this.sender,
    required this.content,
    required this.createdAt,
    this.readBy = const [],
    this.readCount = 0,
    this.isDeleted = false,
  });

  factory ProjectTeamChatMessage.fromJson(Map<String, dynamic> json) =>
      ProjectTeamChatMessage(
        id: (json['id'] ?? json['_id'] ?? '').toString(),
        sender: ChatSender.fromJson(
          (json['sender'] as Map<String, dynamic>?) ?? {},
        ),
        content: (json['content'] ?? '').toString(),
        createdAt: (json['createdAt'] ?? '').toString(),
        readBy: (json['readBy'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(ChatSender.fromJson)
            .toList(),
        readCount: (json['readCount'] as num?)?.toInt() ?? 0,
        isDeleted: json['isDeleted'] == true,
      );

  final String id;
  final ChatSender sender;
  final String content;
  final String createdAt;
  final List<ChatSender> readBy;
  final int readCount;
  final bool isDeleted;
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

  Future<ProjectView> create(String title, String? description) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.projectsCreate,
      data: {
        'title': title,
        if (description != null && description.isNotEmpty)
          'description': description,
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
  }) =>
      _dio.post<void>(
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

  Future<List<ProjectTeamChatMessage>> listTeamChat(String projectId) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.projectsTeamChat(projectId),
      queryParameters: {'limit': 50},
    );
    final data = res.data?['data'] as Map<String, dynamic>? ?? {};
    return (data['messages'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ProjectTeamChatMessage.fromJson)
        .toList();
  }

  Future<void> sendTeamChat(String projectId, String content) =>
      _dio.post<void>(
        ApiRoutes.projectsTeamChat(projectId),
        data: {'content': content},
      );

  Future<void> markTeamChatRead(String projectId, String messageId) =>
      _dio.post<void>(ApiRoutes.projectsTeamChatRead(projectId, messageId));

  Future<void> deleteTeamChat(String projectId, String messageId) => _dio
      .delete<void>(ApiRoutes.projectsTeamChatMessage(projectId, messageId));
}
