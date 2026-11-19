import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/search/data/search_api.dart';
import 'package:flutter_mobile/features/search/domain/search_filters.dart';
import 'package:flutter_mobile/features/search/presentation/search_active_filters.dart';
import 'package:flutter_mobile/features/search/presentation/search_filter_sheet.dart';
import 'package:flutter_mobile/features/search/presentation/search_result_card.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({
    this.initialQuery = '',
    this.initialFilters = const {},
    super.key,
  });

  final String initialQuery;
  final Map<String, String> initialFilters;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _searchController;
  final ScrollController _scrollController = ScrollController();

  // Search parameters state
  int _page = 1;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  List<Paper> _loadedPapers = [];

  // Filters the reader changes in the sheet; replaced only on "Apply".
  SearchFilters _filters = const SearchFilters();
  String? _provider;
  double _minScore = 0;

  /// Papers whose bookmark request is still in flight: a second tap on the
  /// same paper waits, or two "check then create" runs could both create.
  final Set<String> _bookmarkBusy = {};
  TrendScopeFilters _scopeFilters = const TrendScopeFilters();

  // Taxonomy filters carried from Trends scope
  List<String> _domainIds = [];
  List<String> _fieldIds = [];
  List<String> _subfieldIds = [];
  List<String> _topicIds = [];

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(text: widget.initialQuery);
    _parseInitialFilters();
    _scrollController.addListener(_scrollListener);

    // Initial search
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_searchController.text.trim().isNotEmpty) {
        unawaited(_performSearch(reset: true));
      }
    });
  }

  void _parseInitialFilters() {
    final filters = widget.initialFilters;
    _scopeFilters = TrendScopeFilters.fromQuery(filters);
    // A link's year that the API would refuse is dropped, not sent.
    final from = parseYearField(filters['yearFrom'] ?? '').year;
    final to = parseYearField(filters['yearTo'] ?? '').year;
    final backwards = yearRangeError(from, to) != null;
    _filters = SearchFilters(
      yearFrom: backwards ? null : from,
      yearTo: backwards ? null : to,
      paperKind: _scopeFilters.paperKinds.length == 1
          ? _scopeFilters.paperKinds.first
          : null,
      source: _scopeFilters.sources.length == 1
          ? _scopeFilters.sources.first
          : null,
    );
    if (filters.containsKey('providers')) {
      _provider = _scopeFilters.providers.length == 1
          ? _scopeFilters.providers.first
          : null;
    }
    // Taken out of the scope once it has its own filter: see
    // [withoutPromoted].
    _scopeFilters = withoutPromoted(
      _scopeFilters,
      kind: _filters.paperKind != null,
      source: _filters.source != null,
      provider: _provider != null,
    );
    if (filters.containsKey('domainIds')) {
      _domainIds =
          filters['domainIds']
              ?.split(',')
              .where((s) => s.isNotEmpty)
              .toList() ??
          [];
    }
    if (filters.containsKey('fieldIds')) {
      _fieldIds =
          filters['fieldIds']?.split(',').where((s) => s.isNotEmpty).toList() ??
          [];
    }
    if (filters.containsKey('subfieldIds')) {
      _subfieldIds =
          filters['subfieldIds']
              ?.split(',')
              .where((s) => s.isNotEmpty)
              .toList() ??
          [];
    }
    if (filters.containsKey('topicIds')) {
      _topicIds =
          filters['topicIds']?.split(',').where((s) => s.isNotEmpty).toList() ??
          [];
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollListener() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      if (!_isLoadingMore &&
          _hasMore &&
          _searchController.text.trim().isNotEmpty) {
        unawaited(_performSearch());
      }
    }
  }

  /// Number of the latest search request. An answer is used only if it is
  /// still the latest when it arrives; otherwise a slow earlier request
  /// would add its papers to the results of a newer query or filter.
  int _searchSeq = 0;

  Future<void> _performSearch({bool reset = false}) async {
    final seq = ++_searchSeq;
    if (_searchController.text.trim().isEmpty) {
      setState(() {
        _page = 1;
        _loadedPapers = [];
        _hasMore = false;
        _isLoadingMore = false;
      });
      return;
    }

    if (reset) {
      setState(() {
        _page = 1;
        _loadedPapers = [];
        _hasMore = true;
        _isLoadingMore = true;
      });
    } else {
      setState(() {
        _isLoadingMore = true;
      });
    }

    try {
      final scopeFilters = TrendScopeFilters(
        paperKinds: _scopeFilters.paperKinds,
        openAccessStatuses: _scopeFilters.openAccessStatuses,
        providers: _scopeFilters.providers,
        sources: _scopeFilters.sources,
        citationBands: _scopeFilters.citationBands,
        domains: _scopeFilters.domains,
        fields: _scopeFilters.fields,
        subfields: _scopeFilters.subfields,
        topics: _scopeFilters.topics,
        domainIds: _domainIds,
        fieldIds: _fieldIds,
        subfieldIds: _subfieldIds,
        topicIds: _topicIds,
      );

      final params = SearchParams(
        q: _searchController.text.trim(),
        page: _page,
        pageSize: 15,
        rerank: _filters.rerank,
        yearFrom: _filters.yearFrom,
        yearTo: _filters.yearTo,
        paperKind: _filters.paperKind,
        openAccess: _filters.openAccess,
        provider: _provider,
        source: _filters.source,
        sort: _filters.sort,
        minScore: _minScore,
        scopeFilters: scopeFilters,
      );

      final result = await ref.read(searchApiProvider).semantic(params);
      if (!mounted || seq != _searchSeq) return;

      setState(() {
        _loadedPapers.addAll(result.papers);
        _isLoadingMore = false;
        if (result.papers.length < 15) {
          _hasMore = false;
        } else {
          _page += 1;
        }
      });
    } on Object catch (e) {
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _isLoadingMore = false;
        _hasMore = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t(failureMessageKey(e)))),
      );
    }
  }

  Future<void> _openFilters() async {
    final result = await showSearchFilterSheet(context, initial: _filters);
    if (result == null || !mounted) return;
    setState(() {
      _filters = result.filters;
      if (result.clearedAll) {
        _provider = null;
        _minScore = 0;
        _scopeFilters = const TrendScopeFilters();
        _domainIds = [];
        _fieldIds = [];
        _subfieldIds = [];
        _topicIds = [];
      }
    });
    await _performSearch(reset: true);
  }

  void _removeFilter(SearchFilters next) {
    setState(() => _filters = next);
    unawaited(_performSearch(reset: true));
  }

  void _removeScopeId(List<String> ids, String id) {
    setState(() => ids.remove(id));
    unawaited(_performSearch(reset: true));
  }

  Future<void> _toggleBookmark(String paperId) async {
    if (!_bookmarkBusy.add(paperId)) return;
    setState(() {});
    // Leaving mid-request must still refresh the saved state elsewhere.
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      final api = container.read(bookmarksApiProvider);
      // The server's state, not the icon's: the list may be stale.
      final status = await api.checkStatus('paper', paperId);
      final removing = status.bookmarked && status.bookmarkId != null;
      if (removing) {
        await api.delete(status.bookmarkId!);
      } else {
        await api.create(targetKind: 'paper', targetId: paperId);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              removing
                  ? context.t('Bookmark removed')
                  : context.t('Bookmarked successfully'),
            ),
          ),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t(failureMessageKey(e))),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      _bookmarkBusy.remove(paperId);
      if (mounted) setState(() {});
      container
        ..invalidate(bookmarksProvider)
        ..invalidate(
          bookmarkStatusProvider(BookmarkTarget('paper', paperId)),
        );
    }
  }

  /// "2020–2024", "From 2020", "Until 2024".
  String _yearLabel() {
    final from = _filters.yearFrom;
    final to = _filters.yearTo;
    if (from != null && to != null) return '$from–$to';
    if (from != null) return context.t('From {{year}}', {'year': from});
    return context.t('Until {{year}}', {'year': to});
  }

  @override
  Widget build(BuildContext context) {
    // Saved papers, from one list request rather than one per result.
    final bookmarks = ref.watch(bookmarksProvider).value;
    final savedIds = bookmarks == null
        ? null
        : {
            for (final b in bookmarks)
              if (b.targetKind == 'paper') b.targetId,
          };

    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Search Papers')),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => unawaited(_openFilters()),
            tooltip: context.t('Filters'),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search Input Bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    // Opened from a search bar with nothing typed yet: the
                    // keyboard comes up, no second tap needed.
                    autofocus: widget.initialQuery.trim().isEmpty,
                    decoration: InputDecoration(
                      hintText: context.t('Search term or query...'),
                      prefixIcon: const Icon(Icons.search, size: 20),
                    ),
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => unawaited(_performSearch(reset: true)),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () => unawaited(_performSearch(reset: true)),
                  child: Text(context.t('Search')),
                ),
              ],
            ),
          ),

          SearchActiveFilters(
            chips: [
              if (_filters.yearFrom != null || _filters.yearTo != null)
                (
                  _yearLabel(),
                  () => _removeFilter(
                    _filters.copyWith(
                      yearFrom: () => null,
                      yearTo: () => null,
                    ),
                  ),
                ),
              if (_filters.paperKind != null)
                (
                  context.t(paperKindLabel(_filters.paperKind!)),
                  () => _removeFilter(_filters.copyWith(paperKind: () => null)),
                ),
              if (_filters.openAccess ?? false)
                (
                  context.t('Open Access'),
                  () =>
                      _removeFilter(_filters.copyWith(openAccess: () => null)),
                ),
              for (final id in _domainIds)
                (
                  context.t('Domain: {{id}}', {'id': id}),
                  () => _removeScopeId(_domainIds, id),
                ),
              for (final id in _fieldIds)
                (
                  context.t('Field: {{id}}', {'id': id}),
                  () => _removeScopeId(_fieldIds, id),
                ),
              for (final id in _subfieldIds)
                (
                  context.t('Subfield: {{id}}', {'id': id}),
                  () => _removeScopeId(_subfieldIds, id),
                ),
              for (final id in _topicIds)
                (
                  context.t('Topic: {{id}}', {'id': id}),
                  () => _removeScopeId(_topicIds, id),
                ),
            ],
          ),

          // Results List
          Expanded(
            child: _loadedPapers.isEmpty
                ? (_isLoadingMore
                      // Clipped, not scrollable: on a short screen the
                      // last placeholder is simply cut off.
                      ? const SingleChildScrollView(
                          physics: NeverScrollableScrollPhysics(),
                          padding: EdgeInsets.all(16),
                          child: LumiSkeleton(rows: 4, height: 132),
                        )
                      : SingleChildScrollView(
                          child: LumiEmptyState(
                            icon: Icons.search_off_outlined,
                            title: context.t('No search results'),
                            message: context.t(
                              'Enter a keyword above or relax/clear filters in the top-right button to find broader publications.',
                            ),
                          ),
                        ))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _loadedPapers.length + (_hasMore ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == _loadedPapers.length) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Center(
                            child: SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                              ),
                            ),
                          ),
                        );
                      }

                      final paper = _loadedPapers[index];
                      return SearchResultCard(
                        paper: paper,
                        saved: savedIds?.contains(paper.id),
                        savingBookmark: _bookmarkBusy.contains(paper.id),
                        onBookmarkTap: () =>
                            unawaited(_toggleBookmark(paper.id)),
                        onTap: () =>
                            unawaited(context.push('/paper/${paper.id}')),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
