import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final adminApiProvider = Provider<AdminApi>((ref) {
  return AdminApi(ref.watch(apiClientProvider).dio);
});

final FutureProvider<List<ApiSyncRun>> syncRunsProvider = FutureProvider.autoDispose<List<ApiSyncRun>>((ref) {
  return ref.watch(adminApiProvider).listRuns();
});

final FutureProvider<EmbeddingStatus> embeddingStatusProvider = FutureProvider.autoDispose<EmbeddingStatus>((ref) {
  return ref.watch(adminApiProvider).embeddingStatus();
});

final FutureProvider<PipelineStatus> pipelineStatusProvider = FutureProvider.autoDispose<PipelineStatus>((ref) {
  return ref.watch(adminApiProvider).pipelineStatus();
});

class ApiSyncRun {
  const ApiSyncRun({required this.id, required this.status, required this.searchText, required this.totalFetched, required this.totalInserted, this.errorMessage});

  factory ApiSyncRun.fromJson(Map<String, dynamic> json) {
    return ApiSyncRun(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      status: (json['runStatus'] ?? '').toString(),
      searchText: (json['searchText'] ?? '').toString(),
      totalFetched: (json['totalFetched'] as num?)?.toInt() ?? 0,
      totalInserted: (json['totalInserted'] as num?)?.toInt() ?? 0,
      errorMessage: json['errorMessage']?.toString(),
    );
  }

  final String id;
  final String status;
  final String searchText;
  final int totalFetched;
  final int totalInserted;
  final String? errorMessage;
}

class EmbeddingStatus {
  const EmbeddingStatus({
    required this.analyzable,
    required this.embedded,
    required this.pending,
  });

  factory EmbeddingStatus.fromJson(Map<String, dynamic> json) => EmbeddingStatus(
        analyzable: _intFromJson(json['analyzable'] ?? json['totalPapers']) ?? 0,
        embedded: _intFromJson(json['embedded'] ?? json['embeddedPapers']) ?? 0,
        pending: _intFromJson(json['pending'] ?? json['pendingPapers']) ?? 0,
      );

  final int analyzable;
  final int embedded;
  final int pending;
}

class PipelineStatus {
  const PipelineStatus({
    required this.generatedAt,
    required this.redisOk,
    required this.queues,
    required this.workers,
    required this.corpus,
    this.recommendations = const [],
  });

  factory PipelineStatus.fromJson(Map<String, dynamic> json) => PipelineStatus(
        generatedAt: (json['generatedAt'] ?? '').toString(),
        redisOk: (json['redis'] as Map<String, dynamic>?)?['ok'] == true,
        queues: (json['queues'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PipelineQueueStatus.fromJson)
            .toList(),
        workers: PipelineWorkerStatus.fromJson((json['workers'] as Map<String, dynamic>?) ?? {}),
        corpus: PipelineCorpusStatus.fromJson((json['corpus'] as Map<String, dynamic>?) ?? {}),
        recommendations: (json['recommendations'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PipelineRecommendation.fromJson)
            .toList(),
      );

  final String generatedAt;
  final bool redisOk;
  final List<PipelineQueueStatus> queues;
  final PipelineWorkerStatus workers;
  final PipelineCorpusStatus corpus;
  final List<PipelineRecommendation> recommendations;
}

class PipelineQueueStatus {
  const PipelineQueueStatus({
    required this.name,
    required this.label,
    required this.waiting,
    required this.active,
    required this.failed,
    required this.isBacklogged,
    required this.hasFailures,
  });

  factory PipelineQueueStatus.fromJson(Map<String, dynamic> json) => PipelineQueueStatus(
        name: (json['name'] ?? '').toString(),
        label: (json['label'] ?? '').toString(),
        waiting: (json['waiting'] as num?)?.toInt() ?? 0,
        active: (json['active'] as num?)?.toInt() ?? 0,
        failed: (json['failed'] as num?)?.toInt() ?? 0,
        isBacklogged: json['isBacklogged'] == true,
        hasFailures: json['hasFailures'] == true,
      );

  final String name;
  final String label;
  final int waiting;
  final int active;
  final int failed;
  final bool isBacklogged;
  final bool hasFailures;
}

class PipelineWorkerStatus {
  const PipelineWorkerStatus({
    required this.expected,
    required this.alive,
    required this.stale,
    required this.missing,
  });

  factory PipelineWorkerStatus.fromJson(Map<String, dynamic> json) => PipelineWorkerStatus(
        expected: (json['expected'] as num?)?.toInt() ?? 0,
        alive: (json['alive'] as num?)?.toInt() ?? 0,
        stale: (json['stale'] as num?)?.toInt() ?? 0,
        missing: (json['missing'] as num?)?.toInt() ?? 0,
      );

  final int expected;
  final int alive;
  final int stale;
  final int missing;
}

class PipelineCorpusStatus {
  const PipelineCorpusStatus({
    required this.totalPapers,
    required this.activePapers,
    required this.analyzablePapers,
    required this.embeddedPapers,
    required this.aiAnalyzedPapers,
    required this.embeddingCoveragePct,
    required this.aiAnalysisCoveragePct,
  });

  factory PipelineCorpusStatus.fromJson(Map<String, dynamic> json) => PipelineCorpusStatus(
        totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
        activePapers: (json['activePapers'] as num?)?.toInt() ?? 0,
        analyzablePapers: (json['analyzablePapers'] as num?)?.toInt() ?? 0,
        embeddedPapers: (json['embeddedPapers'] as num?)?.toInt() ?? 0,
        aiAnalyzedPapers: (json['aiAnalyzedPapers'] as num?)?.toInt() ?? 0,
        embeddingCoveragePct: (json['embeddingCoveragePct'] as num?)?.toDouble() ?? 0,
        aiAnalysisCoveragePct: (json['aiAnalysisCoveragePct'] as num?)?.toDouble() ?? 0,
      );

  final int totalPapers;
  final int activePapers;
  final int analyzablePapers;
  final int embeddedPapers;
  final int aiAnalyzedPapers;
  final double embeddingCoveragePct;
  final double aiAnalysisCoveragePct;
}

class PipelineRecommendation {
  const PipelineRecommendation({required this.severity, required this.title, required this.description});

  factory PipelineRecommendation.fromJson(Map<String, dynamic> json) => PipelineRecommendation(
        severity: (json['severity'] ?? 'info').toString(),
        title: (json['title'] ?? '').toString(),
        description: (json['description'] ?? '').toString(),
      );

  final String severity;
  final String title;
  final String description;
}

class AdminApi {
  const AdminApi(this._dio);

  final Dio _dio;

  Future<void> triggerSync({required String searchText, int? yearFrom, int? maxPages}) {
    return _dio.post<void>(
      ApiRoutes.adminSync,
      data: {'searchText': searchText, 'yearFrom': ?yearFrom, 'maxPages': ?maxPages},
    );
  }

  Future<void> triggerEmbedding() => _dio.post<void>(ApiRoutes.adminEmbed);

  Future<EmbeddingStatus> embeddingStatus() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.adminEmbedStatus);
    return EmbeddingStatus.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<PipelineStatus> pipelineStatus() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.adminPipelineStatus);
    return PipelineStatus.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<List<ApiSyncRun>> listRuns() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.adminSyncRuns);
    return (res.data?['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ApiSyncRun.fromJson)
        .toList();
  }
}

int? _intFromJson(Object? value) => value is num ? value.toInt() : int.tryParse(value?.toString() ?? '');
