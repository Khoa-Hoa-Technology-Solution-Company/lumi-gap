import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

final qualityApiProvider = Provider<QualityApi>((ref) {
  return QualityApi(ref.watch(apiClientProvider).dio);
});

final FutureProviderFamily<QualityView, QualityTarget> qualityViewProvider = FutureProvider.autoDispose.family<QualityView, QualityTarget>((ref, target) {
  return ref.watch(qualityApiProvider).view(target.kind, target.id);
});

@immutable
class QualityTarget {
  const QualityTarget(this.kind, this.id);

  final String kind;
  final String id;

  @override
  bool operator ==(Object other) => other is QualityTarget && other.kind == kind && other.id == id;

  @override
  int get hashCode => Object.hash(kind, id);
}

class QualityView {
  const QualityView({required this.ratingAvg, required this.ratingCount, required this.ratings, this.evaluation, this.myStars, this.myComment});

  factory QualityView.fromJson(Map<String, dynamic> json) {
    final summary = json['ratingSummary'] as Map<String, dynamic>? ?? {};
    final myRating = json['myRating'] as Map<String, dynamic>?;
    return QualityView(
      evaluation: json['evaluation'] is Map<String, dynamic> ? QualityEvaluation.fromJson(json['evaluation'] as Map<String, dynamic>) : null,
      ratingAvg: (summary['avg'] as num?)?.toDouble() ?? 0,
      ratingCount: (summary['count'] as num?)?.toInt() ?? 0,
      myStars: (myRating?['stars'] as num?)?.toInt(),
      myComment: myRating?['comment']?.toString(),
      ratings: (json['allRatings'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(UserRating.fromJson)
          .toList(),
    );
  }

  final QualityEvaluation? evaluation;
  final double ratingAvg;
  final int ratingCount;
  final int? myStars;
  final String? myComment;
  final List<UserRating> ratings;
}

class QualityEvaluation {
  const QualityEvaluation({required this.relevance, required this.groundedness, required this.completeness, required this.overall, required this.rationale});

  factory QualityEvaluation.fromJson(Map<String, dynamic> json) {
    return QualityEvaluation(
      relevance: (json['relevance'] as num?)?.toDouble() ?? 0,
      groundedness: (json['groundedness'] as num?)?.toDouble() ?? 0,
      completeness: (json['completeness'] as num?)?.toDouble() ?? 0,
      overall: (json['overall'] as num?)?.toDouble() ?? 0,
      rationale: (json['rationale'] ?? '').toString(),
    );
  }

  final double relevance;
  final double groundedness;
  final double completeness;
  final double overall;
  final String rationale;
}

class UserRating {
  const UserRating({required this.id, required this.userName, required this.stars, this.comment});

  factory UserRating.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>?;
    return UserRating(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      userName: (user?['fullName'] ?? 'Anonymous').toString(),
      stars: (json['stars'] as num?)?.toInt() ?? 0,
      comment: json['comment']?.toString(),
    );
  }

  final String id;
  final String userName;
  final int stars;
  final String? comment;
}

class QualityApi {
  const QualityApi(this._dio);

  final Dio _dio;

  Future<QualityView> view(String kind, String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.qualityView(kind, id));
    return QualityView.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<void> evaluate(String kind, String id) {
    return _dio.post<void>(ApiRoutes.qualityEvaluate, data: {'targetKind': kind, 'targetId': id});
  }

  Future<void> rate(String kind, String id, int stars, String? comment) {
    return _dio.post<void>(ApiRoutes.qualityRate, data: {
      'targetKind': kind,
      'targetId': id,
      'stars': stars,
      'comment': ?comment,
    });
  }

  Future<void> deleteRate(String ratingId) => _dio.delete<void>(ApiRoutes.qualityDeleteRate(ratingId));
}
