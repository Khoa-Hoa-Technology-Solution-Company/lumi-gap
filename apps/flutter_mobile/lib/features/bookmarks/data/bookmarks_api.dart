import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

final bookmarksApiProvider = Provider<BookmarksApi>((ref) {
  return BookmarksApi(ref.watch(apiClientProvider).dio);
});

final FutureProvider<List<Bookmark>> bookmarksProvider = FutureProvider.autoDispose<List<Bookmark>>((ref) {
  return ref.watch(bookmarksApiProvider).list();
});

final FutureProviderFamily<BookmarkStatus, BookmarkTarget> bookmarkStatusProvider = FutureProvider.autoDispose.family<BookmarkStatus, BookmarkTarget>((ref, target) {
  return ref.watch(bookmarksApiProvider).checkStatus(target.kind, target.id);
});

@immutable
class BookmarkTarget {
  const BookmarkTarget(this.kind, this.id);

  final String kind;
  final String id;

  @override
  bool operator ==(Object other) => other is BookmarkTarget && other.kind == kind && other.id == id;

  @override
  int get hashCode => Object.hash(kind, id);
}

class BookmarkStatus {
  const BookmarkStatus({required this.bookmarked, this.bookmarkId});

  factory BookmarkStatus.fromJson(Map<String, dynamic> json) {
    return BookmarkStatus(
      bookmarked: json['bookmarked'] == true,
      bookmarkId: json['bookmarkId']?.toString(),
    );
  }

  final bool bookmarked;
  final String? bookmarkId;
}

class Bookmark {
  const Bookmark({
    required this.id,
    required this.targetKind,
    required this.targetId,
    this.note,
    this.paperDetail,
    this.reportTitle,
    this.reportStatus,
    this.createdAt,
  });

  factory Bookmark.fromJson(Map<String, dynamic> json) {
    final paperJson = json['paperDetail'];
    final reportJson = json['reportDetail'] as Map<String, dynamic>?;
    return Bookmark(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      targetKind: (json['targetKind'] ?? 'paper').toString(),
      targetId: (json['targetId'] ?? '').toString(),
      note: json['note']?.toString(),
      paperDetail: paperJson is Map<String, dynamic> ? parsePaper(paperJson) : null,
      reportTitle: reportJson == null ? null : (reportJson['topic'] ?? reportJson['query'])?.toString(),
      reportStatus: reportJson?['status']?.toString(),
      createdAt: json['createdAt']?.toString(),
    );
  }

  final String id;
  final String targetKind;
  final String targetId;
  final String? note;
  final Paper? paperDetail;
  final String? reportTitle;
  final String? reportStatus;
  final String? createdAt;
}

class BookmarksApi {
  const BookmarksApi(this._dio);

  final Dio _dio;

  Future<List<Bookmark>> list() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.bookmarksList);
    return (res.data?['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Bookmark.fromJson)
        .toList();
  }

  Future<Bookmark> create({required String targetKind, required String targetId}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.bookmarksCreate,
      data: {'targetKind': targetKind, 'targetId': targetId},
    );
    return Bookmark.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<void> delete(String id) => _dio.delete<void>(ApiRoutes.bookmarksDelete(id));

  Future<Bookmark> updateNote(String id, String? note) async {
    final res = await _dio.patch<Map<String, dynamic>>(ApiRoutes.bookmarksUpdateNote(id), data: {'note': note});
    return Bookmark.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<BookmarkStatus> checkStatus(String targetKind, String targetId) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.bookmarksCheck,
      queryParameters: {'targetKind': targetKind, 'targetId': targetId},
    );
    return BookmarkStatus.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }
}
