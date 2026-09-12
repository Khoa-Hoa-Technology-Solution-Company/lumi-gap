import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

final searchApiProvider = Provider<SearchApi>((ref) {
  return SearchApi(ref.watch(apiClientProvider).dio);
});

final FutureProviderFamily<PagedPapers, SearchParams> searchResultsProvider = FutureProvider.autoDispose.family<PagedPapers, SearchParams>((ref, params) {
  if (params.q.trim().isEmpty) return Future.value(const PagedPapers(papers: []));
  return ref.watch(searchApiProvider).semantic(params);
});

@immutable
class SearchParams {
  const SearchParams({
    required this.q,
    this.page = 1,
    this.pageSize = 10,
    this.rerank = false,
    this.yearFrom,
    this.yearTo,
    this.paperKind,
    this.openAccess,
    this.provider,
    this.source,
    this.sort,
    this.minScore = 0,
    this.scopeFilters = const TrendScopeFilters(),
  });

  final String q;
  final int page;
  final int pageSize;
  final bool rerank;
  final int? yearFrom;
  final int? yearTo;
  final String? paperKind;
  final bool? openAccess;
  final String? provider;
  final String? source;
  final String? sort;
  final double minScore;
  final TrendScopeFilters scopeFilters;

  Map<String, dynamic> toQuery() {
    final query = <String, dynamic>{
      'q': q,
      'page': page,
      'pageSize': pageSize,
      'rerank': rerank,
      'minScore': minScore,
      ...scopeFilters.toQuery(),
    };
    if (yearFrom != null) query['yearFrom'] = yearFrom;
    if (yearTo != null) query['yearTo'] = yearTo;
    if (paperKind != null && paperKind!.trim().isNotEmpty) query['paperKind'] = paperKind!.trim();
    if (openAccess != null) query['openAccess'] = openAccess;
    if (provider != null && provider!.trim().isNotEmpty) query['provider'] = provider!.trim();
    if (source != null && source!.trim().isNotEmpty) query['source'] = source!.trim();
    if (sort != null && sort!.trim().isNotEmpty) query['sort'] = sort!.trim();
    return query;
  }

  @override
  bool operator ==(Object other) {
    return other is SearchParams &&
        other.q == q &&
        other.page == page &&
        other.pageSize == pageSize &&
        other.rerank == rerank &&
        other.yearFrom == yearFrom &&
        other.yearTo == yearTo &&
        other.paperKind == paperKind &&
        other.openAccess == openAccess &&
        other.provider == provider &&
        other.source == source &&
        other.sort == sort &&
        other.minScore == minScore &&
        other.scopeFilters == scopeFilters;
  }

  @override
  int get hashCode => Object.hash(q, page, pageSize, rerank, yearFrom, yearTo, paperKind, openAccess, provider, source, sort, minScore, scopeFilters);
}

class SearchApi {
  const SearchApi(this._dio);

  final Dio _dio;

  Future<PagedPapers> semantic(SearchParams params) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.searchSemantic,
      queryParameters: params.toQuery(),
    );
    return PagedPapers(
      papers: (res.data?['data'] as List<dynamic>? ?? []).map(parsePaper).toList(),
      meta: res.data?['meta'] as Map<String, dynamic>?,
    );
  }
}
