import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

final papersApiProvider = Provider<PapersApi>((ref) {
  return PapersApi(ref.watch(apiClientProvider).dio);
});

final FutureProviderFamily<PagedPapers, PapersListParams> papersProvider = FutureProvider.autoDispose.family<PagedPapers, PapersListParams>((ref, params) {
  return ref.watch(papersApiProvider).list(params);
});

final FutureProviderFamily<Paper, String> paperProvider = FutureProvider.autoDispose.family<Paper, String>((ref, id) {
  return ref.watch(papersApiProvider).detail(id);
});

final FutureProviderFamily<PaperReferencesResult, String> paperReferencesProvider = FutureProvider.autoDispose.family<PaperReferencesResult, String>((ref, id) {
  return ref.watch(papersApiProvider).references(id);
});

final FutureProvider<List<Paper>> myPapersProvider = FutureProvider.autoDispose<List<Paper>>((ref) {
  return ref.watch(papersApiProvider).myRequests();
});

@immutable
class PapersListParams {
  const PapersListParams({this.q, this.page = 1, this.pageSize = 10});

  final String? q;
  final int page;
  final int pageSize;

  Map<String, dynamic> toQuery() => {
        if (q != null && q!.trim().isNotEmpty) 'q': q!.trim(),
        'page': page,
        'pageSize': pageSize,
      };

  @override
  bool operator ==(Object other) {
    return other is PapersListParams &&
        other.q == q &&
        other.page == page &&
        other.pageSize == pageSize;
  }

  @override
  int get hashCode => Object.hash(q, page, pageSize);
}

class PagedPapers {
  const PagedPapers({required this.papers, this.meta});

  final List<Paper> papers;
  final Map<String, dynamic>? meta;
}

class PaperReferencesResult {
  const PaperReferencesResult({
    required this.references,
    required this.totalReferenced,
    required this.inCorpus,
  });

  factory PaperReferencesResult.fromJson(Map<String, dynamic> json) {
    return PaperReferencesResult(
      references: (json['references'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PaperRef.fromJson)
          .toList(),
      totalReferenced: (json['totalReferenced'] as num?)?.toInt() ?? 0,
      inCorpus: (json['inCorpus'] as num?)?.toInt() ?? 0,
    );
  }

  final List<PaperRef> references;
  final int totalReferenced;
  final int inCorpus;
}

class PaperRef {
  const PaperRef({
    required this.id,
    required this.title,
    required this.publicationYear,
    required this.authors,
    this.doi,
  });

  factory PaperRef.fromJson(Map<String, dynamic> json) {
    return PaperRef(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      title: (json['title'] ?? 'Untitled paper').toString(),
      publicationYear: (json['publicationYear'] as num?)?.toInt() ?? 0,
      authors: parseAuthors(json['authors']),
      doi: json['doi']?.toString(),
    );
  }

  final String id;
  final String title;
  final int publicationYear;
  final List<PaperAuthorRef> authors;
  final String? doi;
}

class PaperSubmitFile {
  const PaperSubmitFile({required this.path, required this.name, this.mimeType});

  final String path;
  final String name;
  final String? mimeType;
}

class SubmitPaperInput {
  const SubmitPaperInput({
    required this.title,
    required this.doi,
    required this.paperLink,
    required this.abstractText,
    required this.publicationYear,
    required this.paperKind,
    required this.authors,
    required this.keywords,
    required this.topics,
    this.openAccessUrl,
    this.pdf,
  });

  final String title;
  final String doi;
  final String paperLink;
  final String abstractText;
  final int publicationYear;
  final String paperKind;
  final List<String> authors;
  final List<String> keywords;
  final List<String> topics;
  final String? openAccessUrl;
  final PaperSubmitFile? pdf;
}

class PapersApi {
  const PapersApi(this._dio);

  final Dio _dio;

  Future<PagedPapers> list(PapersListParams params) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.papersList, queryParameters: params.toQuery());
    return PagedPapers(
      papers: _parsePaperList(res.data?['data']),
      meta: res.data?['meta'] as Map<String, dynamic>?,
    );
  }

  Future<Paper> detail(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.papersDetail(id));
    return parsePaper(res.data?['data']);
  }

  Future<PaperReferencesResult> references(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.papersReferences(id));
    return PaperReferencesResult.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<List<Paper>> myRequests() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.papersMyRequests);
    return _parsePaperList(res.data?['data']);
  }

  Future<Paper> create(SubmitPaperInput input) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.papersCreate,
      data: await _toFormData(input),
      options: Options(contentType: 'multipart/form-data'),
    );
    return parsePaper(res.data?['data']);
  }

  Future<Paper> update(String id, SubmitPaperInput input) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      ApiRoutes.papersUpdate(id),
      data: await _toFormData(input),
      options: Options(contentType: 'multipart/form-data'),
    );
    return parsePaper(res.data?['data']);
  }

  Future<Paper> uploadPdf(String id, PaperSubmitFile file) async {
    final form = FormData.fromMap({
      'pdf': await MultipartFile.fromFile(
        file.path,
        filename: file.name,
      ),
    });
    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.papersUploadPdf(id),
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    return parsePaper(res.data?['data']);
  }

  Future<void> acceptPdf(String id) => _dio.patch<void>(ApiRoutes.papersAcceptPdf(id));

  Future<void> rejectPdf(String id) => _dio.patch<void>(ApiRoutes.papersRejectPdf(id));

  Future<void> cancel(String id) => _dio.delete<void>(ApiRoutes.papersCancel(id));
}

Future<FormData> _toFormData(SubmitPaperInput input) async {
  final map = <String, dynamic>{
    'title': input.title.trim(),
    'doi': input.doi.trim(),
    'paperLink': input.paperLink.trim(),
    'abstractText': input.abstractText.trim(),
    'publicationYear': input.publicationYear.toString(),
    'paperKind': input.paperKind,
    'authors': jsonEncode(
      input.authors
          .asMap()
          .entries
          .map((entry) => {
                'displayName': entry.value,
                'position': entry.key + 1,
                'isCorresponding': entry.key == 0,
              })
          .toList(),
    ),
    'keywords': jsonEncode(input.keywords.map((keywordName) => {'keywordName': keywordName}).toList()),
    'topics': jsonEncode(input.topics.map((topicName) => {'topicName': topicName}).toList()),
    if (input.openAccessUrl != null && input.openAccessUrl!.trim().isNotEmpty) 'openAccessUrl': input.openAccessUrl!.trim(),
  };
  if (input.pdf != null) {
    map['pdf'] = await MultipartFile.fromFile(input.pdf!.path, filename: input.pdf!.name);
  }
  return FormData.fromMap(map);
}

List<Paper> _parsePaperList(Object? value) {
  return (value as List<dynamic>? ?? []).map(parsePaper).toList();
}

Paper parsePaper(Object? value) {
  final json = value is Map<String, dynamic> ? value : <String, dynamic>{};
  return Paper.fromJson({
    'id': (json['id'] ?? json['_id'] ?? '').toString(),
    'externalIds': json['externalIds'] is Map<String, dynamic> ? json['externalIds'] : <String, dynamic>{},
    'title': (json['title'] ?? 'Untitled paper').toString(),
    'abstractText': json['abstractText'] ?? json['abstract'],
    'authors': parseAuthors(json['authors']).map((author) => author.toJson()).toList(),
    'journalName': json['journalName'],
    'publicationYear': (json['publicationYear'] as num?)?.toInt() ?? DateTime.now().year,
    'paperKind': json['paperKind'] ?? 'article',
    'language': json['language'],
    'openAccessStatus': json['openAccessStatus'],
    'openAccessUrl': json['openAccessUrl'],
    'licenseName': json['licenseName'],
    'citationCount': (json['citationCount'] as num?)?.toInt() ?? 0,
    'fwci': (json['fwci'] as num?)?.toDouble(),
    'relatedWorksCount': (json['relatedWorksCount'] as num?)?.toInt(),
    'keywords': parseKeywords(json['keywords']).map((keyword) => keyword.toJson()).toList(),
    'topics': parseTopics(json['topics']).map((topic) => topic.toJson()).toList(),
    'primaryProvider': json['primaryProvider'],
    'dataStatus': json['dataStatus'] ?? 'active',
    'dataQualityScore': (json['dataQualityScore'] as num?)?.toDouble() ?? 0,
    'isAiAnalyzable': json['isAiAnalyzable'] == true,
    'downloadCost': (json['downloadCost'] as num?)?.toDouble(),
    'uploadCreditReward': (json['uploadCreditReward'] as num?)?.toDouble(),
    'pdfPath': json['pdfPath'],
    'paperLink': json['paperLink'],
    'paperStatus': json['paperStatus'],
    'rejectionReason': json['rejectionReason'],
    'createdAt': (json['createdAt'] ?? '').toString(),
    'updatedAt': (json['updatedAt'] ?? '').toString(),
  });
}

List<PaperAuthorRef> parseAuthors(Object? value) {
  return (value as List<dynamic>? ?? []).map((item) {
    final json = item is Map<String, dynamic> ? item : <String, dynamic>{};
    return PaperAuthorRef(
      authorId: json['authorId']?.toString(),
      displayName: (json['displayName'] ?? json['name'] ?? 'Unknown author').toString(),
      position: (json['position'] as num?)?.toInt() ?? 1,
      isCorresponding: json['isCorresponding'] as bool?,
    );
  }).toList();
}

List<PaperKeyword> parseKeywords(Object? value) {
  return (value as List<dynamic>? ?? []).map((item) {
    final json = item is Map<String, dynamic> ? item : <String, dynamic>{};
    return PaperKeyword(
      keywordId: json['keywordId']?.toString(),
      keywordName: (json['keywordName'] ?? json['name'] ?? item).toString(),
      detectedBy: json['detectedBy']?.toString(),
      confidence: (json['confidence'] as num?)?.toDouble(),
    );
  }).toList();
}

List<PaperTopic> parseTopics(Object? value) {
  return (value as List<dynamic>? ?? []).map((item) {
    final json = item is Map<String, dynamic> ? item : <String, dynamic>{};
    return PaperTopic(
      topicId: json['topicId']?.toString(),
      openalexTopicId: json['openalexTopicId']?.toString(),
      topicName: (json['topicName'] ?? json['name'] ?? item).toString(),
      detectedBy: json['detectedBy']?.toString(),
      confidence: (json['confidence'] as num?)?.toDouble(),
      isPrimary: json['isPrimary'] as bool?,
      subfieldId: json['subfieldId']?.toString(),
      subfieldName: json['subfieldName']?.toString(),
      fieldId: json['fieldId']?.toString(),
      fieldName: json['fieldName']?.toString(),
      domainId: json['domainId']?.toString(),
      domainName: json['domainName']?.toString(),
    );
  }).toList();
}
