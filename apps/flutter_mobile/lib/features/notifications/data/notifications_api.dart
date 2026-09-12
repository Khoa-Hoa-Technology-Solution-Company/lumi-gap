import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final notificationsApiProvider = Provider<NotificationsApi>((ref) {
  return NotificationsApi(ref.watch(apiClientProvider).dio);
});

final FutureProvider<List<AppNotification>> notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) {
  return ref.watch(notificationsApiProvider).list();
});

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.isRead,
    required this.createdAt,
    this.type,
    this.targetKind,
    this.targetId,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      title: (json['title'] ?? 'Notification').toString(),
      message: (json['message'] ?? '').toString(),
      type: json['type']?.toString(),
      targetKind: json['targetKind']?.toString(),
      targetId: (json['targetId'] ?? json['paperId'])?.toString(),
      isRead: json['isRead'] == true,
      createdAt: (json['createdAt'] ?? '').toString(),
    );
  }

  final String id;
  final String title;
  final String message;
  final String? type;
  final String? targetKind;
  final String? targetId;
  final bool isRead;
  final String createdAt;
}

class NotificationsApi {
  const NotificationsApi(this._dio);

  final Dio _dio;

  Future<List<AppNotification>> list() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.notificationsList);
    return (res.data?['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }

  Future<void> markRead(String id) => _dio.patch<void>(ApiRoutes.notificationsMarkRead(id));

  Future<void> markAllRead() => _dio.post<void>(ApiRoutes.notificationsMarkAllRead);

  Future<void> registerDeviceToken({
    required String token,
    required String platform,
    String? deviceName,
  }) {
    return _dio.post<void>(
      ApiRoutes.notificationsRegisterDeviceToken,
      data: {
        'token': token,
        'platform': platform,
        'deviceName': ?deviceName,
      },
    );
  }
}
