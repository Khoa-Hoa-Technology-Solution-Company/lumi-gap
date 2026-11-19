import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/core/utils/json_read.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

/// A pending invitation sent to one of my verified emails
/// (`GET /projects/invitations/mine`, project.service `getMyInvitationPage`).
class ProjectInvitation {
  const ProjectInvitation({
    required this.id,
    required this.projectId,
    required this.projectTitle,
    required this.expiresAt,
    this.invitedEmail,
    this.inviterName,
    this.message,
    this.role = 'MEMBER',
  });

  static ProjectInvitation? fromJson(Json json) {
    final id = jStr(json['id']);
    final projectId = jStr(json['projectId']);
    final title = jStr(json['projectTitle']);
    if (id == null || projectId == null || title == null) return null;
    return ProjectInvitation(
      id: id,
      projectId: projectId,
      projectTitle: title,
      invitedEmail: jStr(json['invitedEmail']),
      inviterName: jStr(json['inviterName']),
      message: jStr(json['message']),
      role: jStr(json['role']) ?? 'MEMBER',
      expiresAt: jDate(json['expiresAt']),
    );
  }

  final String id;
  final String projectId;
  final String projectTitle;
  final String? invitedEmail;
  final String? inviterName;
  final String? message;
  final String role;
  final DateTime? expiresAt;
}

/// What an invitation link shows (`GET /projects/invitation-tokens/:token`).
/// Project details are only sent once the viewer's email matches.
class InvitationPreview {
  const InvitationPreview({
    required this.status,
    required this.authenticated,
    required this.emailMatches,
    required this.alreadyMember,
    this.projectId,
    this.projectTitle,
    this.inviterName,
    this.invitedEmail,
    this.message,
    this.expiresAt,
  });

  factory InvitationPreview.fromJson(Json json) => InvitationPreview(
        status: jStr(json['status']) ?? 'PENDING',
        authenticated: jBool(json['authenticated']),
        emailMatches: jBool(json['emailMatches']),
        alreadyMember: jBool(json['alreadyMember']),
        projectId: jStr(json['projectId']),
        projectTitle: jStr(json['projectTitle']),
        inviterName: jStr(json['inviterName']),
        invitedEmail: jStr(json['invitedEmail']),
        message: jStr(json['message']),
        expiresAt: jDate(json['expiresAt']),
      );

  /// PENDING, ACCEPTED, DECLINED, CANCELLED or EXPIRED.
  final String status;
  final bool authenticated;
  final bool emailMatches;
  final bool alreadyMember;
  final String? projectId;
  final String? projectTitle;
  final String? inviterName;
  final String? invitedEmail;
  final String? message;
  final DateTime? expiresAt;
}

class InvitationsApi {
  const InvitationsApi(this._dio);
  final Dio _dio;

  /// Every page: the list is short and shown in full, like on the web.
  Future<List<ProjectInvitation>> mine() async {
    final items = <ProjectInvitation>[];
    for (var page = 1; page <= 20; page++) {
      final res = await _dio.get<Map<String, dynamic>>(
        ApiRoutes.projectInvitationsMine,
        queryParameters: {'page': page, 'pageSize': 100},
      );
      final body = jMap(res.data);
      // Older servers return the list itself as `data`.
      final data = body['data'];
      final rows = data is List ? jMaps(data) : jMaps(jMap(data)['items']);
      items.addAll([for (final r in rows) ?ProjectInvitation.fromJson(r)]);
      final hasNext = jBool(jMap(body['meta'])['hasNext']) ||
          jBool(jMap(jMap(data)['meta'])['hasNext']);
      if (!hasNext) break;
    }
    return items;
  }

  Future<void> respond(ProjectInvitation invitation, {required bool accept}) =>
      _dio.post<void>(
        ApiRoutes.projectInvitationRespond(
          invitation.projectId,
          invitation.id,
          accept: accept,
        ),
      );

  Future<InvitationPreview> preview(String token) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.projectInvitationToken(token),
    );
    return InvitationPreview.fromJson(jMap(jMap(res.data)['data']));
  }

  Future<void> respondToken(String token, {required bool accept}) =>
      _dio.post<void>(
        ApiRoutes.projectInvitationTokenRespond(token, accept: accept),
      );
}

final invitationsApiProvider = Provider<InvitationsApi>(
  (ref) => InvitationsApi(ref.watch(apiClientProvider).dio),
);

final FutureProvider<List<ProjectInvitation>> myInvitationsProvider =
    FutureProvider.autoDispose<List<ProjectInvitation>>(
  (ref) => ref.watch(invitationsApiProvider).mine(),
);

final FutureProviderFamily<InvitationPreview, String> invitationPreviewProvider =
    FutureProvider.autoDispose.family<InvitationPreview, String>(
  (ref, token) => ref.watch(invitationsApiProvider).preview(token),
);
