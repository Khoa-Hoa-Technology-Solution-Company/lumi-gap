import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

final gapsApiProvider = Provider<GapsApi>((ref) {
  return GapsApi(ref.watch(apiClientProvider).dio);
});

final FutureProviderFamily<ListGapsResponse, GapsListParams> gapsProvider = FutureProvider.autoDispose.family<ListGapsResponse, GapsListParams>((ref, params) {
  return ref.watch(gapsApiProvider).list(params);
});

final FutureProviderFamily<GapAnalysisResult, String> gapStatusProvider = FutureProvider.autoDispose.family<GapAnalysisResult, String>((ref, id) {
  return ref.watch(gapsApiProvider).status(id);
});

@immutable
class GapsListParams {
  const GapsListParams({
    this.topic,
    this.projectId,
    this.status = 'active',
    this.source,
    this.minConfidence,
    this.page = 1,
    this.pageSize = 30,
  });

  final String? topic;
  final String? projectId;
  final String status;
  final String? source;
  final double? minConfidence;
  final int page;
  final int pageSize;

  Map<String, dynamic> toQuery() => {
        if (topic != null && topic!.trim().isNotEmpty) 'topic': topic!.trim(),
        if (projectId != null && projectId!.trim().isNotEmpty) 'projectId': projectId!.trim(),
        'status': status,
        if (source != null && source!.trim().isNotEmpty) 'source': source!.trim(),
        if (minConfidence != null) 'minConfidence': minConfidence,
        'page': page,
        'pageSize': pageSize,
      };

  @override
  bool operator ==(Object other) {
    return other is GapsListParams &&
        other.topic == topic &&
        other.projectId == projectId &&
        other.status == status &&
        other.source == source &&
        other.minConfidence == minConfidence &&
        other.page == page &&
        other.pageSize == pageSize;
  }

  @override
  int get hashCode => Object.hash(topic, projectId, status, source, minConfidence, page, pageSize);
}

class ListGapsResponse {
  const ListGapsResponse({required this.data, required this.total});

  factory ListGapsResponse.fromEnvelope(Map<String, dynamic> json) {
    return ListGapsResponse(
      data: (json['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ResearchGapItem.fromJson)
          .toList(),
      total: ((json['meta'] as Map<String, dynamic>?)?['total'] as num?)?.toInt() ?? 0,
    );
  }

  final List<ResearchGapItem> data;
  final int total;
}

class ResearchGapItem {
  const ResearchGapItem({
    required this.id,
    required this.topic,
    required this.title,
    required this.description,
    required this.rationale,
    required this.confidence,
    required this.source,
    required this.status,
    this.projectId,
    this.reportId,
    this.supportingPaperIds = const [],
    this.supportingPapers = const [],
    this.parentTrendSignal = 0,
    this.evidenceCount = 0,
  });

  factory ResearchGapItem.fromJson(Map<String, dynamic> json) {
    return ResearchGapItem(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      topic: (json['topic'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      rationale: (json['rationale'] ?? '').toString(),
      confidence: (json['evidenceConfidence'] as num?)?.toDouble() ?? (json['confidence'] as num?)?.toDouble() ?? 0,
      source: (json['source'] ?? 'standalone').toString(),
      status: (json['status'] ?? 'active').toString(),
      projectId: json['projectId']?.toString(),
      reportId: json['reportId']?.toString(),
      supportingPaperIds: (json['supportingPaperIds'] as List<dynamic>? ?? []).map((item) => item.toString()).toList(),
      supportingPapers: (json['supportingPapers'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(GapSupportingPaper.fromJson)
          .toList(),
      parentTrendSignal: (json['parentTrendSignal'] as num?)?.toDouble() ?? 0,
      evidenceCount: (json['evidenceCount'] as num?)?.toInt() ?? (json['supportingPapers'] as List<dynamic>? ?? []).length,
    );
  }

  final String id;
  final String topic;
  final String title;
  final String description;
  final String rationale;
  final double confidence;
  final String source;
  final String status;
  final String? projectId;
  final String? reportId;
  final List<String> supportingPaperIds;
  final List<GapSupportingPaper> supportingPapers;
  final double parentTrendSignal;
  final int evidenceCount;
}

class GapSupportingPaper {
  const GapSupportingPaper({
    required this.id,
    required this.title,
    this.publicationYear,
    this.journalName,
    this.citationCount,
  });

  factory GapSupportingPaper.fromJson(Map<String, dynamic> json) {
    return GapSupportingPaper(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      title: (json['title'] ?? 'Untitled paper').toString(),
      publicationYear: (json['publicationYear'] as num?)?.toInt(),
      journalName: json['journalName']?.toString(),
      citationCount: (json['citationCount'] as num?)?.toInt(),
    );
  }

  final String id;
  final String title;
  final int? publicationYear;
  final String? journalName;
  final int? citationCount;
}

class GapAnalysisResult {
  const GapAnalysisResult({required this.id, required this.topic, required this.status, this.errorMessage});

  factory GapAnalysisResult.fromJson(Map<String, dynamic> json) {
    return GapAnalysisResult(
      id: (json['id'] ?? '').toString(),
      topic: (json['topic'] ?? '').toString(),
      status: (json['status'] ?? 'queued').toString(),
      errorMessage: json['errorMessage']?.toString(),
    );
  }

  final String id;
  final String topic;
  final String status;
  final String? errorMessage;
}

class GapsApi {
  const GapsApi(this._dio);

  final Dio _dio;

  Future<String> analyze(String topic, {String? projectId, int? yearFrom, int? yearTo}) async {
    final data = <String, dynamic>{'topic': topic};
    if (projectId != null && projectId.trim().isNotEmpty) data['projectId'] = projectId.trim();
    if (yearFrom != null) data['yearFrom'] = yearFrom;
    if (yearTo != null) data['yearTo'] = yearTo;

    final res = await _dio.post<Map<String, dynamic>>(ApiRoutes.gapsAnalyze, data: data);
    return ((res.data?['data'] as Map<String, dynamic>?)?['analysisId'] ?? '').toString();
  }

  Future<GapAnalysisResult> status(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.gapsAnalyzeStatus(id));
    return GapAnalysisResult.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<ListGapsResponse> list(GapsListParams params) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.gapsList, queryParameters: params.toQuery());
    return ListGapsResponse.fromEnvelope(res.data ?? {});
  }

  Future<void> patchStatus(String id, String status) {
    return _dio.patch<void>(ApiRoutes.gapsPatch(id), data: {'status': status});
  }
}
