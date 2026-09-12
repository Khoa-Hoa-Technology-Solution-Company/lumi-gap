import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

final reportsApiProvider = Provider<ReportsApi>((ref) {
  return ReportsApi(ref.watch(apiClientProvider).dio);
});

final FutureProviderFamily<ReportsList, ReportsParams> reportsProvider = FutureProvider.autoDispose.family<ReportsList, ReportsParams>((ref, params) {
  return ref.watch(reportsApiProvider).list(params);
});

final FutureProviderFamily<AnalyticalReport, String> reportProvider = FutureProvider.autoDispose.family<AnalyticalReport, String>((ref, id) {
  return ref.watch(reportsApiProvider).detail(id);
});

@immutable
class ReportsParams {
  const ReportsParams({this.page = 1, this.pageSize = 20, this.projectId});

  final int page;
  final int pageSize;
  final String? projectId;

  Map<String, dynamic> toQuery() => {
        'page': page,
        'pageSize': pageSize,
        if (projectId != null && projectId!.trim().isNotEmpty) 'projectId': projectId!.trim(),
      };

  @override
  bool operator ==(Object other) => other is ReportsParams && other.page == page && other.pageSize == pageSize && other.projectId == projectId;

  @override
  int get hashCode => Object.hash(page, pageSize, projectId);
}

class ReportsList {
  const ReportsList({required this.reports, this.total});

  final List<ReportListItem> reports;
  final int? total;
}

class ReportListItem {
  const ReportListItem({required this.id, required this.query, required this.status, this.topic, this.createdAt});

  factory ReportListItem.fromJson(Map<String, dynamic> json) {
    return ReportListItem(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      query: (json['query'] ?? '').toString(),
      topic: json['topic']?.toString(),
      status: (json['status'] ?? 'queued').toString(),
      createdAt: json['createdAt']?.toString(),
    );
  }

  final String id;
  final String query;
  final String? topic;
  final String status;
  final String? createdAt;
}

class AnalyticalReport extends ReportListItem {
  const AnalyticalReport({
    required super.id,
    required super.query,
    required super.status,
    super.topic,
    super.createdAt,
    this.markdown,
    this.errorMessage,
    this.groundingPapers = const [],
    this.researchGaps = const [],
  });

  factory AnalyticalReport.fromJson(Map<String, dynamic> json) {
    return AnalyticalReport(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      query: (json['query'] ?? '').toString(),
      topic: json['topic']?.toString(),
      status: (json['status'] ?? 'queued').toString(),
      createdAt: json['createdAt']?.toString(),
      markdown: json['markdown']?.toString(),
      errorMessage: json['errorMessage']?.toString(),
      groundingPapers: (json['groundingPapers'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PaperRef.fromJson)
          .toList(),
      researchGaps: (json['researchGaps'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ReportGap.fromJson)
          .toList(),
    );
  }

  final String? markdown;
  final String? errorMessage;
  final List<PaperRef> groundingPapers;
  final List<ReportGap> researchGaps;
}

class ReportGap {
  const ReportGap({required this.title, required this.description, required this.confidence});

  factory ReportGap.fromJson(Map<String, dynamic> json) {
    return ReportGap(
      title: (json['title'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
    );
  }

  final String title;
  final String description;
  final double confidence;
}

enum ReportLanguage {
  auto,
  en,
  vi;

  String get wireValue => name;
}

class ReportEvidencePaper {
  const ReportEvidencePaper({
    required this.id,
    required this.title,
    this.year,
    this.authors = const [],
    this.source,
    this.citations = 0,
    this.score = 0,
    this.abstractText,
    this.origin = 'retrieved',
  });

  factory ReportEvidencePaper.fromJson(Map<String, dynamic> json) {
    return ReportEvidencePaper(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      title: (json['title'] ?? 'Untitled paper').toString(),
      year: _intFromJson(json['year'] ?? json['publicationYear']),
      authors: (json['authors'] as List<dynamic>? ?? []).map((item) => item.toString()).toList(),
      source: (json['source'] ?? json['journal'] ?? json['venue'])?.toString(),
      citations: _intFromJson(json['citations'] ?? json['citationCount']) ?? 0,
      score: _doubleFromJson(json['score'] ?? json['relevanceScore']) ?? 0,
      abstractText: (json['abstractText'] ?? json['abstract'])?.toString(),
      origin: (json['origin'] ?? json['sourceType'] ?? 'retrieved').toString(),
    );
  }

  final String id;
  final String title;
  final int? year;
  final List<String> authors;
  final String? source;
  final int citations;
  final double score;
  final String? abstractText;
  final String origin;
}

class PreviewReportEvidenceResponse {
  const PreviewReportEvidenceResponse({
    required this.papers,
    this.query = '',
    this.topic,
    this.totalCandidates = 0,
    this.userSelectedCount = 0,
    this.retrievedCount = 0,
  });

  factory PreviewReportEvidenceResponse.fromJson(Map<String, dynamic> json) {
    final papersJson = json['papers'] ?? json['evidencePapers'] ?? json['evidence'];
    return PreviewReportEvidenceResponse(
      papers: (papersJson as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ReportEvidencePaper.fromJson)
          .toList(),
      query: (json['query'] ?? '').toString(),
      topic: json['topic']?.toString(),
      totalCandidates: (json['totalCandidates'] as num?)?.toInt() ?? 0,
      userSelectedCount: (json['userSelectedCount'] as num?)?.toInt() ?? 0,
      retrievedCount: (json['retrievedCount'] as num?)?.toInt() ?? 0,
    );
  }

  final List<ReportEvidencePaper> papers;
  final String query;
  final String? topic;
  final int totalCandidates;
  final int userSelectedCount;
  final int retrievedCount;
}

class ReportsApi {
  const ReportsApi(this._dio);

  final Dio _dio;

  Future<ReportsList> list(ReportsParams params) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.reportsList, queryParameters: params.toQuery());
    return ReportsList(
      reports: (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ReportListItem.fromJson)
          .toList(),
      total: (res.data?['meta'] as Map<String, dynamic>?)?['total'] as int?,
    );
  }

  Future<AnalyticalReport> detail(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.reportsDetail(id));
    return AnalyticalReport.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<PreviewReportEvidenceResponse> previewEvidence({
    required String query,
    String? topic,
    String? projectId,
    int? yearFrom,
    int? yearTo,
    bool fast = false,
    bool fillWithRetrieved = true,
    List<String> selectedPaperIds = const [],
    TrendScopeFilters scopeFilters = const TrendScopeFilters(),
  }) async {
    final data = <String, dynamic>{
      'query': query,
      'fast': fast,
      'fillWithRetrieved': fillWithRetrieved,
      if (selectedPaperIds.isNotEmpty) 'selectedPaperIds': selectedPaperIds,
      if (!scopeFilters.isEmpty) 'scopeFilters': scopeFilters.toJson(),
    };
    if (topic != null && topic.trim().isNotEmpty) data['topic'] = topic.trim();
    if (projectId != null && projectId.trim().isNotEmpty) data['projectId'] = projectId.trim();
    if (yearFrom != null) data['yearFrom'] = yearFrom;
    if (yearTo != null) data['yearTo'] = yearTo;

    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.reportsEvidencePreview,
      data: data,
    );
    return PreviewReportEvidenceResponse.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<String> create({
    required String query,
    String? topic,
    String? projectId,
    int? yearFrom,
    int? yearTo,
    ReportLanguage language = ReportLanguage.auto,
    bool deepAnalysis = false,
    bool fast = false,
    List<String> selectedPaperIds = const [],
    TrendScopeFilters scopeFilters = const TrendScopeFilters(),
  }) async {
    final data = <String, dynamic>{
      'query': query,
      'language': language.wireValue,
      'deepAnalysis': deepAnalysis,
      'fast': fast,
      if (selectedPaperIds.isNotEmpty) 'selectedPaperIds': selectedPaperIds,
      if (!scopeFilters.isEmpty) 'scopeFilters': scopeFilters.toJson(),
    };
    if (topic != null && topic.trim().isNotEmpty) data['topic'] = topic.trim();
    if (projectId != null && projectId.trim().isNotEmpty) data['projectId'] = projectId.trim();
    if (yearFrom != null) data['yearFrom'] = yearFrom;
    if (yearTo != null) data['yearTo'] = yearTo;

    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.reportsCreate,
      data: data,
    );
    return ((res.data?['data'] as Map<String, dynamic>?)?['id'] ?? '').toString();
  }

  Future<void> delete(String id) => _dio.delete<void>(ApiRoutes.reportsDelete(id));
}

int? _intFromJson(Object? value) => value is num ? value.toInt() : int.tryParse(value?.toString() ?? '');

double? _doubleFromJson(Object? value) => value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '');
