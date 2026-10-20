import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/quality/data/quality_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

export 'package:flutter_mobile/features/quality/data/quality_models.dart';

final qualityApiProvider = Provider<QualityApi>((ref) {
  return QualityApi(ref.watch(apiClientProvider).dio);
});

final FutureProviderFamily<QualityView, QualityTarget> qualityViewProvider = FutureProvider.autoDispose.family<QualityView, QualityTarget>((ref, target) {
  return ref.watch(qualityApiProvider).view(target.kind, target.id, projectId: target.projectId);
});

final FutureProviderFamily<PaperReadingContext, ReadingContextQuery> readingContextProvider =
    FutureProvider.autoDispose.family<PaperReadingContext, ReadingContextQuery>((ref, q) {
  return ref.watch(qualityApiProvider).readingContext(q.paperId, topic: q.topic, query: q.query);
});

@immutable
class QualityTarget {
  const QualityTarget(this.kind, this.id, {this.projectId});

  final String kind;
  final String id;

  /// Paper project mode only.
  final String? projectId;

  @override
  bool operator ==(Object other) => other is QualityTarget && other.kind == kind && other.id == id && other.projectId == projectId;

  @override
  int get hashCode => Object.hash(kind, id, projectId);
}

@immutable
class ReadingContextQuery {
  const ReadingContextQuery(this.paperId, {this.topic, this.query});

  final String paperId;
  final String? topic;
  final String? query;

  @override
  bool operator ==(Object other) => other is ReadingContextQuery && other.paperId == paperId && other.topic == topic && other.query == query;

  @override
  int get hashCode => Object.hash(paperId, topic, query);
}

class QualityView {
  const QualityView({
    required this.ratingAvg,
    required this.ratingCount,
    required this.ratings,
    this.evaluation,
    this.evaluationTask,
    this.projectEvaluation,
    this.projectEvaluationTask,
    this.myStars,
    this.myComment,
  });

  factory QualityView.fromJson(Map<String, dynamic> json) {
    final summary = json['ratingSummary'] as Map<String, dynamic>? ?? {};
    final myRating = json['myRating'] as Map<String, dynamic>?;
    return QualityView(
      evaluation: json['evaluation'] is Map<String, dynamic> ? QualityEvaluation.fromJson(json['evaluation'] as Map<String, dynamic>) : null,
      evaluationTask: QualityEvaluationTask.tryParse(json['evaluationTask']),
      projectEvaluation: QualityProjectEvaluation.tryParse(json['projectEvaluation']),
      projectEvaluationTask: QualityEvaluationTask.tryParse(json['projectEvaluationTask']),
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
  final QualityEvaluationTask? evaluationTask;
  final QualityProjectEvaluation? projectEvaluation;
  final QualityEvaluationTask? projectEvaluationTask;
  final double ratingAvg;
  final int ratingCount;
  final int? myStars;
  final String? myComment;
  final List<UserRating> ratings;
}

class UserRating {
  const UserRating({required this.id, required this.userName, required this.stars, this.comment});

  factory UserRating.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>?;
    return UserRating(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      userName: (user?['fullName'] ?? '').toString(),
      stars: (json['stars'] as num?)?.toInt() ?? 0,
      comment: json['comment']?.toString(),
    );
  }

  final String id;

  /// Empty when the rater is unknown; the UI substitutes a localized "Anonymous".
  final String userName;
  final int stars;
  final String? comment;
}

/// Thrown when a task ends in failure or does not finish within the polling window.
class QualityTaskException implements Exception {
  const QualityTaskException(this.message, {this.timedOut = false, this.code});

  final String message;

  /// QualityErrorCode from the task or the HTTP error envelope, if any.
  final String? code;
  final bool timedOut;

  @override
  String toString() => message;
}

class QualityApi {
  const QualityApi(this._dio, {this.pollInterval = const Duration(seconds: 2), this.maxPolls = 120});

  final Dio _dio;
  final Duration pollInterval;
  final int maxPolls;

  Future<QualityView> view(String kind, String id, {String? projectId}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.qualityView(kind, id),
      queryParameters: {'projectId': ?projectId},
    );
    return QualityView.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  /// POST /quality/evaluate answers 202 with a task; use [waitForTask] to poll it.
  Future<QualityEvaluationTask> startEvaluation(
    String kind,
    String id, {
    String? projectId,
    String language = 'en',
    bool force = false,
  }) async {
    try {
      return await _start(kind, id, projectId: projectId, language: language, force: force);
    } on DioException catch (e) {
      final body = e.response?.data;
      final error = body is Map ? body['error'] : null;
      throw QualityTaskException('', code: error is Map ? error['code']?.toString() : null);
    }
  }

  Future<QualityEvaluationTask> _start(
    String kind,
    String id, {
    String? projectId,
    String language = 'en',
    bool force = false,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.qualityEvaluate,
      data: {
        'targetKind': kind,
        'targetId': id,
        'language': language,
        if (force) 'force': true,
        'projectId': ?projectId,
      },
    );
    return QualityEvaluationTask.tryParse(response.data?['data']) ?? const QualityEvaluationTask(status: QualityTaskStatus.failed);
  }

  /// Polls GET /quality/evaluation-jobs/:jobId until the task completes or fails.
  Future<QualityEvaluationTask> waitForTask(QualityEvaluationTask first) async {
    var task = first;
    for (var attempt = 0; attempt < maxPolls; attempt++) {
      if (task.status == QualityTaskStatus.completed) return task;
      if (task.status == QualityTaskStatus.failed) throw QualityTaskException(task.error ?? '', code: task.errorCode);
      final jobId = task.jobId;
      if (jobId == null || jobId.isEmpty) throw const QualityTaskException('');
      await Future<void>.delayed(pollInterval);
      final progress = await _dio.get<Map<String, dynamic>>(ApiRoutes.qualityEvaluationJob(jobId));
      task = QualityEvaluationTask.tryParse(progress.data?['data']) ?? task;
    }
    throw const QualityTaskException('', timedOut: true);
  }

  Future<QualityEvaluationTask> evaluate(
    String kind,
    String id, {
    String? projectId,
    String language = 'en',
    bool force = false,
  }) async {
    final started = await startEvaluation(kind, id, projectId: projectId, language: language, force: force);
    return waitForTask(started);
  }

  Future<PaperReadingContext> readingContext(String paperId, {String? topic, String? query}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '${ApiRoutes.qualityView('paper', paperId)}/reading-context',
      queryParameters: {
        if (topic != null && topic.isNotEmpty) 'topic': topic,
        if (query != null && query.isNotEmpty) 'query': query,
      },
    );
    return PaperReadingContext.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
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
