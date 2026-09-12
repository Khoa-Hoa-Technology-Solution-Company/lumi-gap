import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final rankingsApiProvider = Provider<RankingsApi>((ref) {
  return RankingsApi(ref.watch(apiClientProvider).dio);
});

final FutureProvider<RankingsResponse> rankingsProvider = FutureProvider.autoDispose<RankingsResponse>((ref) {
  return ref.watch(rankingsApiProvider).top();
});

final FutureProvider<MyRanking?> myRankingProvider = FutureProvider.autoDispose<MyRanking?>((ref) {
  return ref.watch(rankingsApiProvider).me();
});

class RankingUser {
  const RankingUser({required this.rank, required this.name, required this.role, required this.points, required this.credits, this.university});

  factory RankingUser.fromJson(Map<String, dynamic> json) {
    return RankingUser(
      rank: (json['rank'] as num?)?.toInt() ?? 0,
      name: (json['name'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
      points: (json['points'] as num?)?.toInt() ?? 0,
      credits: (json['credits'] as num?)?.toInt() ?? 0,
      university: json['university']?.toString(),
    );
  }

  final int rank;
  final String name;
  final String role;
  final int points;
  final int credits;
  final String? university;
}

class RankingsResponse {
  const RankingsResponse({required this.rankings});

  final List<RankingUser> rankings;
}

class MyRanking {
  const MyRanking({required this.rank, required this.points, required this.uploadedPdfs, required this.requestedPapers});

  factory MyRanking.fromJson(Map<String, dynamic> json) {
    final stats = json['stats'] as Map<String, dynamic>? ?? {};
    return MyRanking(
      rank: (json['rank'] as num?)?.toInt() ?? 0,
      points: (stats['points'] as num?)?.toInt() ?? (json['points'] as num?)?.toInt() ?? 0,
      uploadedPdfs: (stats['uploadedPdfs'] as num?)?.toInt() ?? 0,
      requestedPapers: (stats['requestedPapers'] as num?)?.toInt() ?? 0,
    );
  }

  final int rank;
  final int points;
  final int uploadedPdfs;
  final int requestedPapers;
}

class RankingsApi {
  const RankingsApi(this._dio);

  final Dio _dio;

  Future<RankingsResponse> top() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.authRankingsTop, queryParameters: {'page': 1, 'limit': 20});
    return RankingsResponse(
      rankings: (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(RankingUser.fromJson)
          .toList(),
    );
  }

  Future<MyRanking?> me() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.authRankingsMe);
    final data = res.data?['data'];
    return data is Map<String, dynamic> ? MyRanking.fromJson(data) : null;
  }
}
