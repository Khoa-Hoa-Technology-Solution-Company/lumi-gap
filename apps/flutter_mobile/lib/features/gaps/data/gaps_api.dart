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
    this.closureStatus = GapClosureStatus.notChecked,
    this.latestClosureCheck,
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
      closureStatus: GapClosureStatus.parse(json['closureStatus']),
      latestClosureCheck: GapClosureSummary.tryParse(json['latestClosureCheck']),
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

  /// Gap Closure Protocol result; [GapClosureStatus.notChecked] when the API omits it.
  final GapClosureStatus closureStatus;
  final GapClosureSummary? latestClosureCheck;
}

/// Result of the latest closure check of a gap (`GapClosureStatus` in shared-types).
enum GapClosureStatus {
  notChecked,
  closed,
  openCertified,
  abstain;

  /// Unknown or missing values fall back to [notChecked] so an older or newer API never breaks the list.
  static GapClosureStatus parse(Object? raw) {
    switch (raw?.toString().toUpperCase()) {
      case 'CLOSED':
        return GapClosureStatus.closed;
      case 'OPEN_CERTIFIED':
        return GapClosureStatus.openCertified;
      case 'ABSTAIN':
        return GapClosureStatus.abstain;
      default:
        return GapClosureStatus.notChecked;
    }
  }
}

/// Short form of the latest closure check embedded in a gap (`GapClosureSummary` in shared-types).
@immutable
class GapClosureSummary {
  const GapClosureSummary({
    required this.checkId,
    required this.status,
    this.decision,
    this.bound,
    this.judgeKind,
    this.decidedAt,
  });

  /// Returns null when [raw] is not an object.
  static GapClosureSummary? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final json = Map<String, dynamic>.from(raw);
    final decisionRaw = json['decision']?.toString();
    return GapClosureSummary(
      checkId: (json['checkId'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      decision: decisionRaw == null ? null : GapClosureStatus.parse(decisionRaw),
      bound: (json['bound'] as num?)?.toDouble(),
      judgeKind: json['judgeKind']?.toString().toUpperCase(),
      decidedAt: json['decidedAt'] == null ? null : DateTime.tryParse(json['decidedAt'].toString()),
    );
  }

  final String checkId;

  /// QUEUED | SEARCHING | SCREENING | DECIDED | FAILED
  final String status;
  final GapClosureStatus? decision;

  /// False-novelty bound B = epsHat + pHat in [0, 1].
  final double? bound;

  /// AI | HUMAN
  final String? judgeKind;
  final DateTime? decidedAt;
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
