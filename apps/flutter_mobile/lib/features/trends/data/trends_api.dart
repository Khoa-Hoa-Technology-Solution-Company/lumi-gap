import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:meta/meta.dart';

final trendsApiProvider = Provider<TrendsApi>((ref) {
  return TrendsApi(ref.watch(apiClientProvider).dio);
});

final FutureProviderFamily<TrendsOverview, TrendsOverviewParams> trendsOverviewProvider = FutureProvider.autoDispose.family<TrendsOverview, TrendsOverviewParams>((ref, params) {
  return ref.watch(trendsApiProvider).overview(params);
});

final FutureProviderFamily<PublicationTrend, String> trendTopicProvider = FutureProvider.autoDispose.family<PublicationTrend, String>((ref, topic) {
  return ref.watch(trendsApiProvider).topic(topic);
});

@immutable
class TrendsOverviewParams {
  const TrendsOverviewParams({
    this.yearFrom,
    this.yearTo,
    this.limit,
    this.minPapers,
    this.sortBy,
    this.scopeFilters = const TrendScopeFilters(),
  });

  final int? yearFrom;
  final int? yearTo;
  final int? limit;
  final int? minPapers;
  final String? sortBy;
  final TrendScopeFilters scopeFilters;

  Map<String, dynamic> toQuery() => {
        if (yearFrom != null) 'yearFrom': yearFrom,
        if (yearTo != null) 'yearTo': yearTo,
        if (limit != null) 'limit': limit,
        if (minPapers != null) 'minPapers': minPapers,
        if (sortBy != null) 'sortBy': sortBy,
        ...scopeFilters.toQuery(),
      };

  @override
  bool operator ==(Object other) {
    return other is TrendsOverviewParams &&
        other.yearFrom == yearFrom &&
        other.yearTo == yearTo &&
        other.limit == limit &&
        other.minPapers == minPapers &&
        other.sortBy == sortBy &&
        other.scopeFilters == scopeFilters;
  }

  @override
  int get hashCode => Object.hash(yearFrom, yearTo, limit, minPapers, sortBy, scopeFilters);
}

@immutable
class TrendScopeFilters {
  const TrendScopeFilters({
    this.paperKinds = const [],
    this.openAccessStatuses = const [],
    this.providers = const [],
    this.sources = const [],
    this.citationBands = const [],
    this.domains = const [],
    this.fields = const [],
    this.subfields = const [],
    this.topics = const [],
    this.domainIds = const [],
    this.fieldIds = const [],
    this.subfieldIds = const [],
    this.topicIds = const [],
  });

  factory TrendScopeFilters.fromQuery(Map<String, String> query) {
    return TrendScopeFilters(
      paperKinds: _csvParam(query['paperKinds']),
      openAccessStatuses: _csvParam(query['openAccessStatuses']),
      providers: _csvParam(query['providers']),
      sources: _csvParam(query['sources']),
      citationBands: _csvParam(query['citationBands']),
      domains: _csvParam(query['domains']),
      fields: _csvParam(query['fields']),
      subfields: _csvParam(query['subfields']),
      topics: _csvParam(query['topics']),
      domainIds: _csvParam(query['domainIds']),
      fieldIds: _csvParam(query['fieldIds']),
      subfieldIds: _csvParam(query['subfieldIds']),
      topicIds: _csvParam(query['topicIds']),
    );
  }

  final List<String> paperKinds;
  final List<String> openAccessStatuses;
  final List<String> providers;
  final List<String> sources;
  final List<String> citationBands;
  final List<String> domains;
  final List<String> fields;
  final List<String> subfields;
  final List<String> topics;
  final List<String> domainIds;
  final List<String> fieldIds;
  final List<String> subfieldIds;
  final List<String> topicIds;

  Map<String, dynamic> toQuery() => {
        if (_csv(paperKinds) != null) 'paperKinds': _csv(paperKinds),
        if (_csv(openAccessStatuses) != null) 'openAccessStatuses': _csv(openAccessStatuses),
        if (_csv(providers) != null) 'providers': _csv(providers),
        if (_csv(sources) != null) 'sources': _csv(sources),
        if (_csv(citationBands) != null) 'citationBands': _csv(citationBands),
        if (_csv(domains) != null) 'domains': _csv(domains),
        if (_csv(fields) != null) 'fields': _csv(fields),
        if (_csv(subfields) != null) 'subfields': _csv(subfields),
        if (_csv(topics) != null) 'topics': _csv(topics),
        if (_csv(domainIds) != null) 'domainIds': _csv(domainIds),
        if (_csv(fieldIds) != null) 'fieldIds': _csv(fieldIds),
        if (_csv(subfieldIds) != null) 'subfieldIds': _csv(subfieldIds),
        if (_csv(topicIds) != null) 'topicIds': _csv(topicIds),
      };

  Map<String, dynamic> toJson() => {
        if (paperKinds.isNotEmpty) 'paperKinds': paperKinds,
        if (openAccessStatuses.isNotEmpty) 'openAccessStatuses': openAccessStatuses,
        if (providers.isNotEmpty) 'providers': providers,
        if (sources.isNotEmpty) 'sources': sources,
        if (citationBands.isNotEmpty) 'citationBands': citationBands,
        if (domains.isNotEmpty) 'domains': domains,
        if (fields.isNotEmpty) 'fields': fields,
        if (subfields.isNotEmpty) 'subfields': subfields,
        if (topics.isNotEmpty) 'topics': topics,
        if (domainIds.isNotEmpty) 'domainIds': domainIds,
        if (fieldIds.isNotEmpty) 'fieldIds': fieldIds,
        if (subfieldIds.isNotEmpty) 'subfieldIds': subfieldIds,
        if (topicIds.isNotEmpty) 'topicIds': topicIds,
      };

  bool get isEmpty => toJson().isEmpty;

  @override
  bool operator ==(Object other) {
    return other is TrendScopeFilters &&
        _listEquals(other.paperKinds, paperKinds) &&
        _listEquals(other.openAccessStatuses, openAccessStatuses) &&
        _listEquals(other.providers, providers) &&
        _listEquals(other.sources, sources) &&
        _listEquals(other.citationBands, citationBands) &&
        _listEquals(other.domains, domains) &&
        _listEquals(other.fields, fields) &&
        _listEquals(other.subfields, subfields) &&
        _listEquals(other.topics, topics) &&
        _listEquals(other.domainIds, domainIds) &&
        _listEquals(other.fieldIds, fieldIds) &&
        _listEquals(other.subfieldIds, subfieldIds) &&
        _listEquals(other.topicIds, topicIds);
  }

  @override
  int get hashCode => Object.hashAll([
        Object.hashAll(paperKinds),
        Object.hashAll(openAccessStatuses),
        Object.hashAll(providers),
        Object.hashAll(sources),
        Object.hashAll(citationBands),
        Object.hashAll(domains),
        Object.hashAll(fields),
        Object.hashAll(subfields),
        Object.hashAll(topics),
        Object.hashAll(domainIds),
        Object.hashAll(fieldIds),
        Object.hashAll(subfieldIds),
        Object.hashAll(topicIds),
      ]);
}

class TrendsOverview {
  const TrendsOverview({
    required this.topics,
    this.risingKeywords = const [],
    this.yearlyTotalPapers = const [],
    this.citationTrend = const [],
    this.facets,
    this.taxonomyCoverage,
    this.recommendedComparisons = const [],
    this.yearFrom,
    this.yearTo,
    this.lastCompleteYear,
    this.totalPapersInWindow = 0,
    this.uniqueTopicsInScope = 0,
    this.computedAt,
  });

  factory TrendsOverview.fromJson(Map<String, dynamic> json) {
    return TrendsOverview(
      topics: (json['topics'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(TrendingTopic.fromJson)
          .toList(),
      risingKeywords: (json['risingKeywords'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(RisingKeyword.fromJson)
          .toList(),
      yearlyTotalPapers: (json['yearlyTotalPapers'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(YearlyCount.fromJson)
          .toList(),
      citationTrend: (json['citationTrend'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(YearlyCitationMetric.fromJson)
          .toList(),
      facets: json['facets'] is Map<String, dynamic> ? TrendFacets.fromJson(json['facets'] as Map<String, dynamic>) : null,
      taxonomyCoverage: json['taxonomyCoverage'] is Map<String, dynamic>
          ? TrendTaxonomyCoverage.fromJson(json['taxonomyCoverage'] as Map<String, dynamic>)
          : null,
      recommendedComparisons: (json['recommendedComparisons'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(RecommendedTrendComparison.fromJson)
          .toList(),
      yearFrom: (json['yearFrom'] as num?)?.toInt(),
      yearTo: (json['yearTo'] as num?)?.toInt(),
      lastCompleteYear: (json['lastCompleteYear'] as num?)?.toInt(),
      totalPapersInWindow: (json['totalPapersInWindow'] as num?)?.toInt() ?? 0,
      uniqueTopicsInScope: (json['uniqueTopicsInScope'] as num?)?.toInt() ?? 0,
      computedAt: json['computedAt']?.toString(),
    );
  }

  final List<TrendingTopic> topics;
  final List<RisingKeyword> risingKeywords;
  final List<YearlyCount> yearlyTotalPapers;
  final List<YearlyCitationMetric> citationTrend;
  final TrendFacets? facets;
  final TrendTaxonomyCoverage? taxonomyCoverage;
  final List<RecommendedTrendComparison> recommendedComparisons;
  final int? yearFrom;
  final int? yearTo;
  final int? lastCompleteYear;
  final int totalPapersInWindow;
  final int uniqueTopicsInScope;
  final String? computedAt;
}

class TrendingTopic {
  const TrendingTopic({
    required this.topic,
    required this.momentum,
    required this.growthRatePct,
    required this.totalPapers,
    required this.yearlyBreakdown,
    this.taxonomy,
    this.cagr3yPct,
  });

  factory TrendingTopic.fromJson(Map<String, dynamic> json) {
    return TrendingTopic(
      topic: (json['topic'] ?? json['topicName'] ?? 'Unknown topic').toString(),
      momentum: (json['momentum'] as num?)?.toDouble() ?? 0,
      growthRatePct: (json['growthRatePct'] as num?)?.toDouble() ?? 0,
      totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
      yearlyBreakdown: (json['yearlyBreakdown'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(YearlyCount.fromJson)
          .toList(),
      taxonomy: json['taxonomy'] is Map<String, dynamic> ? TrendTopicTaxonomy.fromJson(json['taxonomy'] as Map<String, dynamic>) : null,
      cagr3yPct: (json['cagr3yPct'] as num?)?.toDouble(),
    );
  }

  final String topic;
  final double momentum;
  final double growthRatePct;
  final int totalPapers;
  final List<YearlyCount> yearlyBreakdown;
  final TrendTopicTaxonomy? taxonomy;
  final double? cagr3yPct;
}

class YearlyCount {
  const YearlyCount({required this.year, required this.count});

  factory YearlyCount.fromJson(Map<String, dynamic> json) {
    return YearlyCount(
      year: (json['year'] as num?)?.toInt() ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }

  final int year;
  final int count;
}

class YearlyCitationMetric extends YearlyCount {
  const YearlyCitationMetric({
    required super.year,
    required super.count,
    required this.totalCitations,
    required this.avgCitations,
  });

  factory YearlyCitationMetric.fromJson(Map<String, dynamic> json) {
    return YearlyCitationMetric(
      year: (json['year'] as num?)?.toInt() ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
      totalCitations: (json['totalCitations'] as num?)?.toInt() ?? 0,
      avgCitations: (json['avgCitations'] as num?)?.toDouble() ?? 0,
    );
  }

  final int totalCitations;
  final double avgCitations;
}

class PublicationTrend {
  const PublicationTrend({
    required this.topic,
    required this.yearlyBreakdown,
    required this.keywords,
    this.citationTrend = const [],
    this.facets,
    this.taxonomy,
    this.totalPapers = 0,
    this.growthRatePct = 0,
    this.momentum = 0,
    this.lastCompleteYear,
    this.topJournals = const [],
    this.topAuthors = const [],
  });

  factory PublicationTrend.fromJson(Map<String, dynamic> json) {
    return PublicationTrend(
      topic: (json['topic'] ?? 'Unknown topic').toString(),
      yearlyBreakdown: (json['yearlyBreakdown'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(YearlyCount.fromJson)
          .toList(),
      keywords: (json['keywords'] as List<dynamic>? ?? [])
          .map<TrendKeyword>((value) => TrendKeyword.fromJson(value as Object))
          .toList(),
      citationTrend: (json['citationTrend'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(YearlyCitationMetric.fromJson)
          .toList(),
      facets: json['facets'] is Map<String, dynamic> ? TrendFacets.fromJson(json['facets'] as Map<String, dynamic>) : null,
      taxonomy: json['taxonomy'] is Map<String, dynamic> ? TrendTopicTaxonomy.fromJson(json['taxonomy'] as Map<String, dynamic>) : null,
      totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
      growthRatePct: (json['growthRatePct'] as num?)?.toDouble() ?? 0,
      momentum: (json['momentum'] as num?)?.toDouble() ?? 0,
      lastCompleteYear: (json['lastCompleteYear'] as num?)?.toInt(),
      topJournals: _topItems(json['topJournals']),
      topAuthors: _topItems(json['topAuthors']),
    );
  }

  final String topic;
  final List<YearlyCount> yearlyBreakdown;
  final List<TrendKeyword> keywords;
  final List<YearlyCitationMetric> citationTrend;
  final TrendFacets? facets;
  final TrendTopicTaxonomy? taxonomy;
  final int totalPapers;
  final double growthRatePct;
  final double momentum;
  final int? lastCompleteYear;
  final List<TrendFacetBucket> topJournals;
  final List<TrendFacetBucket> topAuthors;
}

class TrendKeyword {
  const TrendKeyword({required this.keyword, required this.count});

  factory TrendKeyword.fromJson(Object value) {
    if (value is Map<String, dynamic>) {
      return TrendKeyword(keyword: (value['keyword'] ?? value['keywordName'] ?? '').toString(), count: (value['count'] as num?)?.toInt() ?? 0);
    }
    return TrendKeyword(keyword: value.toString(), count: 0);
  }

  final String keyword;
  final int count;
}

class RisingKeyword {
  const RisingKeyword({required this.keyword, required this.totalPapers, required this.growthRatePct, required this.yearlyBreakdown});

  factory RisingKeyword.fromJson(Map<String, dynamic> json) => RisingKeyword(
        keyword: (json['keyword'] ?? '').toString(),
        totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
        growthRatePct: (json['growthRatePct'] as num?)?.toDouble() ?? 0,
        yearlyBreakdown: (json['yearlyBreakdown'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(YearlyCount.fromJson)
            .toList(),
      );

  final String keyword;
  final int totalPapers;
  final double growthRatePct;
  final List<YearlyCount> yearlyBreakdown;
}

class TrendFacetBucket {
  const TrendFacetBucket({required this.id, required this.name, required this.count, this.openalexId});

  factory TrendFacetBucket.fromJson(Map<String, dynamic> json) => TrendFacetBucket(
        id: (json['id'] ?? '').toString(),
        name: (json['name'] ?? json['id'] ?? '').toString(),
        count: (json['count'] as num?)?.toInt() ?? 0,
        openalexId: json['openalexId']?.toString(),
      );

  final String id;
  final String name;
  final int count;
  final String? openalexId;
}

class TrendFacets {
  const TrendFacets({
    this.paperKinds = const [],
    this.openAccessStatuses = const [],
    this.providers = const [],
    this.topSources = const [],
    this.citationBands = const [],
    this.domains = const [],
    this.fields = const [],
    this.subfields = const [],
    this.topics = const [],
  });

  factory TrendFacets.fromJson(Map<String, dynamic> json) => TrendFacets(
        paperKinds: _facetList(json['paperKinds']),
        openAccessStatuses: _facetList(json['openAccessStatuses']),
        providers: _facetList(json['providers']),
        topSources: _facetList(json['topSources']),
        citationBands: _facetList(json['citationBands']),
        domains: _facetList(json['domains']),
        fields: _facetList(json['fields']),
        subfields: _facetList(json['subfields']),
        topics: _facetList(json['topics']),
      );

  final List<TrendFacetBucket> paperKinds;
  final List<TrendFacetBucket> openAccessStatuses;
  final List<TrendFacetBucket> providers;
  final List<TrendFacetBucket> topSources;
  final List<TrendFacetBucket> citationBands;
  final List<TrendFacetBucket> domains;
  final List<TrendFacetBucket> fields;
  final List<TrendFacetBucket> subfields;
  final List<TrendFacetBucket> topics;
}

class TrendTopicTaxonomy {
  const TrendTopicTaxonomy({
    this.openalexTopicId,
    this.domainId,
    this.domainName,
    this.fieldId,
    this.fieldName,
    this.subfieldId,
    this.subfieldName,
  });

  factory TrendTopicTaxonomy.fromJson(Map<String, dynamic> json) => TrendTopicTaxonomy(
        openalexTopicId: json['openalexTopicId']?.toString(),
        domainId: json['domainId']?.toString(),
        domainName: json['domainName']?.toString(),
        fieldId: json['fieldId']?.toString(),
        fieldName: json['fieldName']?.toString(),
        subfieldId: json['subfieldId']?.toString(),
        subfieldName: json['subfieldName']?.toString(),
      );

  final String? openalexTopicId;
  final String? domainId;
  final String? domainName;
  final String? fieldId;
  final String? fieldName;
  final String? subfieldId;
  final String? subfieldName;
}

class TrendTaxonomyCoverage {
  const TrendTaxonomyCoverage({
    required this.totalPapers,
    required this.papersWithAnyTopic,
    required this.papersWithPrimaryTopic,
    required this.papersWithFullHierarchy,
    required this.anyTopicCoveragePct,
    required this.primaryTopicCoveragePct,
    required this.fullHierarchyCoveragePct,
  });

  factory TrendTaxonomyCoverage.fromJson(Map<String, dynamic> json) => TrendTaxonomyCoverage(
        totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
        papersWithAnyTopic: (json['papersWithAnyTopic'] as num?)?.toInt() ?? 0,
        papersWithPrimaryTopic: (json['papersWithPrimaryTopic'] as num?)?.toInt() ?? 0,
        papersWithFullHierarchy: (json['papersWithFullHierarchy'] as num?)?.toInt() ?? 0,
        anyTopicCoveragePct: (json['anyTopicCoveragePct'] as num?)?.toDouble() ?? 0,
        primaryTopicCoveragePct: (json['primaryTopicCoveragePct'] as num?)?.toDouble() ?? 0,
        fullHierarchyCoveragePct: (json['fullHierarchyCoveragePct'] as num?)?.toDouble() ?? 0,
      );

  final int totalPapers;
  final int papersWithAnyTopic;
  final int papersWithPrimaryTopic;
  final int papersWithFullHierarchy;
  final double anyTopicCoveragePct;
  final double primaryTopicCoveragePct;
  final double fullHierarchyCoveragePct;
}

class RecommendedTrendComparison {
  const RecommendedTrendComparison({required this.topics, required this.reason});

  factory RecommendedTrendComparison.fromJson(Map<String, dynamic> json) => RecommendedTrendComparison(
        topics: (json['topics'] as List<dynamic>? ?? []).map((item) => item.toString()).toList(),
        reason: (json['reason'] ?? '').toString(),
      );

  final List<String> topics;
  final String reason;
}

class TrendCompareResponse {
  const TrendCompareResponse({required this.topics, this.yearFrom, this.yearTo, this.lastCompleteYear, this.computedAt});

  factory TrendCompareResponse.fromJson(Map<String, dynamic> json) => TrendCompareResponse(
        topics: (json['topics'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TopicComparisonItem.fromJson)
            .toList(),
        yearFrom: (json['yearFrom'] as num?)?.toInt(),
        yearTo: (json['yearTo'] as num?)?.toInt(),
        lastCompleteYear: (json['lastCompleteYear'] as num?)?.toInt(),
        computedAt: json['computedAt']?.toString(),
      );

  final List<TopicComparisonItem> topics;
  final int? yearFrom;
  final int? yearTo;
  final int? lastCompleteYear;
  final String? computedAt;
}

class TopicComparisonItem extends TrendingTopic {
  const TopicComparisonItem({
    required super.topic,
    required super.momentum,
    required super.growthRatePct,
    required super.totalPapers,
    required super.yearlyBreakdown,
    super.taxonomy,
    super.cagr3yPct,
    this.citationTrend = const [],
  });

  factory TopicComparisonItem.fromJson(Map<String, dynamic> json) => TopicComparisonItem(
        topic: (json['topic'] ?? 'Unknown topic').toString(),
        momentum: (json['momentum'] as num?)?.toDouble() ?? 0,
        growthRatePct: (json['growthRatePct'] as num?)?.toDouble() ?? 0,
        totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
        yearlyBreakdown: (json['yearlyBreakdown'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(YearlyCount.fromJson)
            .toList(),
        taxonomy: json['taxonomy'] is Map<String, dynamic> ? TrendTopicTaxonomy.fromJson(json['taxonomy'] as Map<String, dynamic>) : null,
        cagr3yPct: (json['cagr3yPct'] as num?)?.toDouble(),
        citationTrend: (json['citationTrend'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(YearlyCitationMetric.fromJson)
            .toList(),
      );

  final List<YearlyCitationMetric> citationTrend;
}

class TrendTopicCandidatesResponse {
  const TrendTopicCandidatesResponse({required this.query, required this.topics, this.totalCandidates = 0});

  factory TrendTopicCandidatesResponse.fromJson(Map<String, dynamic> json) => TrendTopicCandidatesResponse(
        query: (json['query'] ?? '').toString(),
        totalCandidates: (json['totalCandidates'] as num?)?.toInt() ?? 0,
        topics: (json['topics'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TrendTopicCandidate.fromJson)
            .toList(),
      );

  final String query;
  final int totalCandidates;
  final List<TrendTopicCandidate> topics;
}

class TrendTopicCandidate extends TrendingTopic {
  const TrendTopicCandidate({
    required super.topic,
    required super.momentum,
    required super.growthRatePct,
    required super.totalPapers,
    required super.yearlyBreakdown,
    required this.matchedBy,
    super.taxonomy,
    super.cagr3yPct,
  });

  factory TrendTopicCandidate.fromJson(Map<String, dynamic> json) => TrendTopicCandidate(
        topic: (json['topic'] ?? 'Unknown topic').toString(),
        momentum: (json['momentum'] as num?)?.toDouble() ?? 0,
        growthRatePct: (json['growthRatePct'] as num?)?.toDouble() ?? 0,
        totalPapers: (json['totalPapers'] as num?)?.toInt() ?? 0,
        yearlyBreakdown: (json['yearlyBreakdown'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(YearlyCount.fromJson)
            .toList(),
        matchedBy: (json['matchedBy'] ?? 'topic').toString(),
        taxonomy: json['taxonomy'] is Map<String, dynamic> ? TrendTopicTaxonomy.fromJson(json['taxonomy'] as Map<String, dynamic>) : null,
        cagr3yPct: (json['cagr3yPct'] as num?)?.toDouble(),
      );

  final String matchedBy;
}

class TopicRelationshipResponse {
  const TopicRelationshipResponse({required this.topic, required this.nodes, required this.edges});

  factory TopicRelationshipResponse.fromJson(Map<String, dynamic> json) => TopicRelationshipResponse(
        topic: (json['topic'] ?? '').toString(),
        nodes: (json['nodes'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TopicRelationshipNode.fromJson)
            .toList(),
        edges: (json['edges'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TopicRelationshipEdge.fromJson)
            .toList(),
      );

  final String topic;
  final List<TopicRelationshipNode> nodes;
  final List<TopicRelationshipEdge> edges;
}

class TopicRelationshipNode {
  const TopicRelationshipNode({required this.id, required this.label, required this.count});

  factory TopicRelationshipNode.fromJson(Map<String, dynamic> json) => TopicRelationshipNode(
        id: (json['id'] ?? '').toString(),
        label: (json['label'] ?? '').toString(),
        count: (json['count'] as num?)?.toInt() ?? 0,
      );

  final String id;
  final String label;
  final int count;
}

class TopicRelationshipEdge {
  const TopicRelationshipEdge({required this.source, required this.target, required this.count});

  factory TopicRelationshipEdge.fromJson(Map<String, dynamic> json) => TopicRelationshipEdge(
        source: (json['source'] ?? '').toString(),
        target: (json['target'] ?? '').toString(),
        count: (json['count'] as num?)?.toInt() ?? 0,
      );

  final String source;
  final String target;
  final int count;
}

class TrendExplanationResponse {
  const TrendExplanationResponse({
    required this.language,
    required this.summary,
    this.topic,
    this.whyItMatters = const [],
    this.evidenceSignals = const [],
    this.cautions = const [],
    this.suggestedActions = const [],
    this.metricTrace = const [],
    this.generatedAt,
  });

  factory TrendExplanationResponse.fromJson(Map<String, dynamic> json) => TrendExplanationResponse(
        topic: json['topic']?.toString(),
        language: (json['language'] ?? 'en').toString(),
        summary: (json['summary'] ?? '').toString(),
        whyItMatters: _stringList(json['whyItMatters']),
        evidenceSignals: (json['evidenceSignals'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TrendEvidenceSignal.fromJson)
            .toList(),
        cautions: _stringList(json['cautions']),
        suggestedActions: _stringList(json['suggestedActions']),
        metricTrace: (json['metricTrace'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TrendMetricTrace.fromJson)
            .toList(),
        generatedAt: json['generatedAt']?.toString(),
      );

  final String? topic;
  final String language;
  final String summary;
  final List<String> whyItMatters;
  final List<TrendEvidenceSignal> evidenceSignals;
  final List<String> cautions;
  final List<String> suggestedActions;
  final List<TrendMetricTrace> metricTrace;
  final String? generatedAt;
}

class TrendExplanationHistoryItem extends TrendExplanationResponse {
  const TrendExplanationHistoryItem({
    required this.id,
    required super.language,
    required super.summary,
    super.topic,
    super.whyItMatters,
    super.evidenceSignals,
    super.cautions,
    super.suggestedActions,
    super.metricTrace,
    super.generatedAt,
    this.scopeLabel = '',
    this.createdAt = '',
  });

  factory TrendExplanationHistoryItem.fromJson(Map<String, dynamic> json) => TrendExplanationHistoryItem(
        id: (json['id'] ?? '').toString(),
        topic: json['topic']?.toString(),
        language: (json['language'] ?? 'en').toString(),
        summary: (json['summary'] ?? '').toString(),
        whyItMatters: _stringList(json['whyItMatters']),
        evidenceSignals: (json['evidenceSignals'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TrendEvidenceSignal.fromJson)
            .toList(),
        cautions: _stringList(json['cautions']),
        suggestedActions: _stringList(json['suggestedActions']),
        metricTrace: (json['metricTrace'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TrendMetricTrace.fromJson)
            .toList(),
        generatedAt: json['generatedAt']?.toString(),
        scopeLabel: (json['scopeLabel'] ?? '').toString(),
        createdAt: (json['createdAt'] ?? '').toString(),
      );

  final String id;
  final String scopeLabel;
  final String createdAt;
}

class TrendEvidenceSignal {
  const TrendEvidenceSignal({required this.text, required this.sources});

  factory TrendEvidenceSignal.fromJson(Map<String, dynamic> json) => TrendEvidenceSignal(
        text: (json['text'] ?? '').toString(),
        sources: _stringList(json['sources']),
      );

  final String text;
  final List<String> sources;
}

class TrendMetricTrace {
  const TrendMetricTrace({required this.source, required this.label, required this.value, required this.explanation});

  factory TrendMetricTrace.fromJson(Map<String, dynamic> json) => TrendMetricTrace(
        source: (json['source'] ?? '').toString(),
        label: (json['label'] ?? '').toString(),
        value: (json['value'] ?? '').toString(),
        explanation: (json['explanation'] ?? '').toString(),
      );

  final String source;
  final String label;
  final String value;
  final String explanation;
}

class TrendsApi {
  const TrendsApi(this._dio);

  final Dio _dio;

  Future<TrendsOverview> overview(TrendsOverviewParams params) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.trendsOverview, queryParameters: params.toQuery());
    return TrendsOverview.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<PublicationTrend> topic(String topic, {TrendsOverviewParams? params, String? topicId}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.trendsTopic(topic),
      queryParameters: {
        if (params != null) ...params.toQuery(),
        if (topicId != null && topicId.trim().isNotEmpty) 'topicId': topicId.trim(),
      },
    );
    return PublicationTrend.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<TrendCompareResponse> compare({
    required List<String> topics,
    int? yearFrom,
    int? yearTo,
    TrendScopeFilters scopeFilters = const TrendScopeFilters(),
  }) async {
    final queryParameters = <String, dynamic>{
      'topics': topics.map((topic) => topic.trim()).where((topic) => topic.isNotEmpty).join(','),
      ...scopeFilters.toQuery(),
    };
    if (yearFrom != null) queryParameters['yearFrom'] = yearFrom;
    if (yearTo != null) queryParameters['yearTo'] = yearTo;

    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.trendsCompare,
      queryParameters: queryParameters,
    );
    return TrendCompareResponse.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<TrendTopicCandidatesResponse> topicCandidates({
    required String q,
    int? yearFrom,
    int? yearTo,
    int limit = 20,
    int minPapers = 1,
    TrendScopeFilters scopeFilters = const TrendScopeFilters(),
  }) async {
    final queryParameters = <String, dynamic>{
      'q': q,
      'limit': limit,
      'minPapers': minPapers,
      ...scopeFilters.toQuery(),
    };
    if (yearFrom != null) queryParameters['yearFrom'] = yearFrom;
    if (yearTo != null) queryParameters['yearTo'] = yearTo;

    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.trendsTopicCandidates,
      queryParameters: queryParameters,
    );
    return TrendTopicCandidatesResponse.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<TopicRelationshipResponse> relationships({
    required String topic,
    int? yearFrom,
    int? yearTo,
    int limit = 12,
    TrendScopeFilters scopeFilters = const TrendScopeFilters(),
  }) async {
    final queryParameters = <String, dynamic>{
      'topic': topic,
      'limit': limit,
      ...scopeFilters.toQuery(),
    };
    if (yearFrom != null) queryParameters['yearFrom'] = yearFrom;
    if (yearTo != null) queryParameters['yearTo'] = yearTo;

    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.trendsRelationships,
      queryParameters: queryParameters,
    );
    return TopicRelationshipResponse.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<TrendExplanationResponse> explain({
    String? topic,
    int? yearFrom,
    int? yearTo,
    String language = 'en',
    TrendScopeFilters scopeFilters = const TrendScopeFilters(),
  }) async {
    final data = <String, dynamic>{
      'language': language,
      ...scopeFilters.toJson(),
    };
    if (topic != null && topic.trim().isNotEmpty) data['topic'] = topic.trim();
    if (yearFrom != null) data['yearFrom'] = yearFrom;
    if (yearTo != null) data['yearTo'] = yearTo;

    final res = await _dio.post<Map<String, dynamic>>(
      ApiRoutes.trendsExplain,
      data: data,
    );
    return TrendExplanationResponse.fromJson((res.data?['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<List<TrendExplanationHistoryItem>> explainHistory({String? topic, int limit = 10}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiRoutes.trendsExplainHistory,
      queryParameters: {
        if (topic != null && topic.trim().isNotEmpty) 'topic': topic.trim(),
        'limit': limit,
      },
    );
    final data = (res.data?['data'] as Map<String, dynamic>?) ?? {};
    return (data['items'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(TrendExplanationHistoryItem.fromJson)
        .toList();
  }
}

String? _csv(List<String> values) {
  final cleaned = values.map((item) => item.trim()).where((item) => item.isNotEmpty).toList();
  return cleaned.isEmpty ? null : cleaned.join(',');
}

List<String> _csvParam(String? value) {
  if (value == null || value.trim().isEmpty) return const [];
  return value.split(',').map((item) => item.trim()).where((item) => item.isNotEmpty).toList();
}

bool _listEquals(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i += 1) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

List<TrendFacetBucket> _facetList(Object? value) => (value as List<dynamic>? ?? [])
    .whereType<Map<String, dynamic>>()
    .map(TrendFacetBucket.fromJson)
    .toList();

List<TrendFacetBucket> _topItems(Object? value) => (value as List<dynamic>? ?? [])
    .whereType<Map<String, dynamic>>()
    .map(TrendFacetBucket.fromJson)
    .toList();

List<String> _stringList(Object? value) => (value as List<dynamic>? ?? []).map((item) => item.toString()).toList();
