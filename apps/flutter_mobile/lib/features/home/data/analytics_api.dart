import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final analyticsApiProvider = Provider<AnalyticsApi>((ref) {
  return AnalyticsApi(ref.watch(apiClientProvider).dio);
});

final FutureProvider<AnalyticsSummary> analyticsSummaryProvider = FutureProvider.autoDispose<AnalyticsSummary>((ref) {
  return ref.watch(analyticsApiProvider).summary();
});

class AnalyticsSummary {
  const AnalyticsSummary({
    required this.totalSearches,
    required this.totalPapers,
    required this.uniqueUsers,
  });

  factory AnalyticsSummary.fromJson(Map<String, dynamic> json) {
    return AnalyticsSummary(
      totalSearches: (json['totalSearches'] as num?)?.toInt() ?? 0,
      totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
      uniqueUsers: (json['uniqueUsers'] as num?)?.toInt() ?? 0,
    );
  }

  final int totalSearches;
  final int totalPapers;
  final int uniqueUsers;
}

class AnalyticsApi {
  const AnalyticsApi(this._dio);

  final Dio _dio;

  Future<AnalyticsSummary> summary() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.analyticsSummary);
    return AnalyticsSummary.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }
}
