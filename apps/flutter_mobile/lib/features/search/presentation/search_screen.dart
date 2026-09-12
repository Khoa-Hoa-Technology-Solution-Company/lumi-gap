import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/search/data/search_api.dart';
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

  // Filter values
  int? _yearFrom;
  int? _yearTo;
  String? _paperKind;
  bool? _openAccess;
  String? _source;
  String? _provider;
  String? _sort = 'relevance';
  bool _rerank = false;
  double _minScore = 0;
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
    if (filters.containsKey('yearFrom')) {
      _yearFrom = int.tryParse(filters['yearFrom'] ?? '');
    }
    if (filters.containsKey('yearTo')) {
      _yearTo = int.tryParse(filters['yearTo'] ?? '');
    }
    if (filters.containsKey('paperKinds')) {
      _paperKind = _scopeFilters.paperKinds.length == 1
          ? _scopeFilters.paperKinds.first
          : null;
    }
    if (filters.containsKey('sources')) {
      _source = _scopeFilters.sources.length == 1
          ? _scopeFilters.sources.first
          : null;
    }
    if (filters.containsKey('providers')) {
      _provider = _scopeFilters.providers.length == 1
          ? _scopeFilters.providers.first
          : null;
    }
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

  Future<void> _performSearch({bool reset = false}) async {
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
        rerank: _rerank,
        yearFrom: _yearFrom,
        yearTo: _yearTo,
        paperKind: _paperKind,
        openAccess: _openAccess,
        provider: _provider,
        source: _source,
        sort: _sort,
        minScore: _minScore,
        scopeFilters: scopeFilters,
      );

      final result = await ref.read(searchApiProvider).semantic(params);

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
      setState(() {
        _isLoadingMore = false;
        _hasMore = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Search failed: $e')),
        );
      }
    }
  }

  void _openFilterBottomSheet() {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) {
          return StatefulBuilder(
            builder: (context, setBottomSheetState) {
              final theme = Theme.of(context);
              final isDark = theme.brightness == Brightness.dark;

              return Container(
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : Colors.white,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(24),
                  ),
                ),
                padding: EdgeInsets.only(
                  top: 16,
                  left: 20,
                  right: 20,
                  bottom: MediaQuery.of(context).viewInsets.bottom + 24,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF475569)
                                : const Color(0xFFCBD5E1),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Search Filters',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          TextButton(
                            onPressed: () {
                              setBottomSheetState(() {
                                _yearFrom = null;
                                _yearTo = null;
                                _paperKind = null;
                                _openAccess = null;
                                _source = null;
                                _provider = null;
                                _sort = 'relevance';
                                _rerank = false;
                                _minScore = 0.0;
                                _scopeFilters = const TrendScopeFilters();
                                _domainIds = [];
                                _fieldIds = [];
                                _subfieldIds = [];
                                _topicIds = [];
                              });
                            },
                            child: const Text(
                              'Clear All',
                              style: TextStyle(color: Color(0xFF06B6D4)),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),

                      // Rerank Toggle
                      SwitchListTile(
                        title: const Text(
                          'Semantic Reranking',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                        subtitle: const Text(
                          'Uses AI models to re-evaluate relevance. May increase search latency.',
                          style: TextStyle(
                            fontSize: 11,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                        value: _rerank,
                        activeThumbColor: const Color(0xFF06B6D4),
                        contentPadding: EdgeInsets.zero,
                        onChanged: (val) {
                          setBottomSheetState(() {
                            _rerank = val;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // Years Range Inputs
                      const Text(
                        'Publication Years',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              decoration: InputDecoration(
                                hintText: 'From Year',
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              keyboardType: TextInputType.number,
                              controller: TextEditingController(
                                text: _yearFrom?.toString() ?? '',
                              ),
                              onChanged: (val) {
                                _yearFrom = int.tryParse(val);
                              },
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: TextField(
                              decoration: InputDecoration(
                                hintText: 'To Year',
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              keyboardType: TextInputType.number,
                              controller: TextEditingController(
                                text: _yearTo?.toString() ?? '',
                              ),
                              onChanged: (val) {
                                _yearTo = int.tryParse(val);
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Sort By
                      const Text(
                        'Sort Results By',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        initialValue: _sort,
                        decoration: InputDecoration(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'relevance',
                            child: Text('Relevance'),
                          ),
                          DropdownMenuItem(
                            value: 'citations',
                            child: Text('Citation Count'),
                          ),
                          DropdownMenuItem(
                            value: 'year',
                            child: Text('Publication Year'),
                          ),
                        ],
                        onChanged: (val) {
                          setBottomSheetState(() {
                            _sort = val;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // Paper Kind
                      const Text(
                        'Paper Kind',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        initialValue: _paperKind,
                        decoration: InputDecoration(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        hint: const Text('All Kinds'),
                        items: const [
                          DropdownMenuItem(
                            value: 'article',
                            child: Text('Journal Article'),
                          ),
                          DropdownMenuItem(
                            value: 'book-chapter',
                            child: Text('Book Chapter'),
                          ),
                          DropdownMenuItem(
                            value: 'proceedings',
                            child: Text('Conference Proceeding'),
                          ),
                          DropdownMenuItem(
                            value: 'preprint',
                            child: Text('Preprint'),
                          ),
                          DropdownMenuItem(
                            value: 'review',
                            child: Text('Review'),
                          ),
                          DropdownMenuItem(
                            value: 'other',
                            child: Text('Other'),
                          ),
                        ],
                        onChanged: (val) {
                          setBottomSheetState(() {
                            _paperKind = val;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // Open Access Status
                      CheckboxListTile(
                        title: const Text(
                          'Open Access Only',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        value: _openAccess ?? false,
                        activeColor: const Color(0xFF06B6D4),
                        contentPadding: EdgeInsets.zero,
                        onChanged: (val) {
                          setBottomSheetState(() {
                            _openAccess = val == true ? true : null;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // Source
                      const Text(
                        'Journal / Venue Source',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        decoration: InputDecoration(
                          hintText: 'e.g. Nature, IEEE',
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        controller: TextEditingController(text: _source ?? ''),
                        onChanged: (val) {
                          _source = val.trim().isEmpty ? null : val.trim();
                        },
                      ),
                      const SizedBox(height: 24),

                      // Apply Button
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF06B6D4),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onPressed: () {
                            Navigator.pop(context);
                            unawaited(_performSearch(reset: true));
                          },
                          child: const Text(
                            'Apply Filters',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _openProjectPicker(BuildContext context, String paperId) {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (context) {
          return Consumer(
            builder: (context, ref, child) {
              final projectsAsync = ref.watch(projectsProvider);
              final theme = Theme.of(context);
              return SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Add to project',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(context),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      projectsAsync.when(
                        data: (projects) {
                          if (projects.isEmpty) {
                            return Center(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 24,
                                ),
                                child: OutlinedButton(
                                  onPressed: () {
                                    Navigator.pop(context);
                                    unawaited(context.push('/projects'));
                                  },
                                  child: const Text(
                                    'Create your first project',
                                  ),
                                ),
                              ),
                            );
                          }
                          return Flexible(
                            child: ListView.builder(
                              shrinkWrap: true,
                              itemCount: projects.length,
                              itemBuilder: (context, index) {
                                final project = projects[index];
                                return ListTile(
                                  leading: Container(
                                    width: 36,
                                    height: 36,
                                    decoration: BoxDecoration(
                                      color: Colors.cyan.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(
                                      Icons.folder,
                                      color: Color(0xFF06B6D4),
                                      size: 17,
                                    ),
                                  ),
                                  title: Text(
                                    project.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  subtitle: Text(
                                    '${project.papers.length} papers',
                                  ),
                                  trailing: const Icon(
                                    Icons.add,
                                    color: Color(0xFF06B6D4),
                                  ),
                                  onTap: () async {
                                    Navigator.pop(context);
                                    try {
                                      await ref
                                          .read(projectsApiProvider)
                                          .addPaper(project.id, paperId);
                                      ref.invalidate(projectsProvider);
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'Added paper to project',
                                            ),
                                          ),
                                        );
                                      }
                                    } on Exception catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          SnackBar(
                                            content: Text('Failed to add: $e'),
                                          ),
                                        );
                                      }
                                    }
                                  },
                                );
                              },
                            ),
                          );
                        },
                        loading: () =>
                            const Center(child: CircularProgressIndicator()),
                        error: (e, _) => Text('Error loading projects: $e'),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _toggleBookmark(String paperId) async {
    final api = ref.read(bookmarksApiProvider);
    final status = await api.checkStatus('paper', paperId);
    if (status.bookmarked && status.bookmarkId != null) {
      await api.delete(status.bookmarkId!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bookmark removed')),
        );
      }
    } else {
      await api.create(targetKind: 'paper', targetId: paperId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bookmarked successfully')),
        );
      }
    }
    ref.invalidate(bookmarksProvider);
  }

  void _copyCitation(Paper paper) {
    final authors = paper.authors.map((a) => a.displayName).join(', ');
    final citation =
        '${authors.isEmpty ? "Unknown" : authors} (${paper.publicationYear}). ${paper.title}. ${paper.journalName ?? "Unknown Journal"}.';
    unawaited(
      Clipboard.setData(ClipboardData(text: citation)).then((_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Citation copied to clipboard')),
          );
        }
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final bgColor = isDark
        ? const Color(0xFF0F1B2D)
        : theme.scaffoldBackgroundColor;
    final cardBg = isDark ? const Color(0xFF1A2332) : theme.cardColor;
    final borderColor = isDark
        ? const Color(0xFF26334A)
        : const Color(0xFFE2E8F0);

    final showScopeBadge =
        _domainIds.isNotEmpty ||
        _fieldIds.isNotEmpty ||
        _subfieldIds.isNotEmpty ||
        _topicIds.isNotEmpty;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: const Text('Search Papers'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _openFilterBottomSheet,
            tooltip: 'Filters',
          ),
        ],
      ),
      body: Column(
        children: [
          // Search Input Bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: cardBg,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: borderColor),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        const Icon(Icons.search, color: Color(0xFF94A3B8)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _searchController,
                            decoration: const InputDecoration(
                              hintText: 'Search term or query...',
                              border: InputBorder.none,
                            ),
                            textInputAction: TextInputAction.search,
                            onSubmitted: (_) =>
                                unawaited(_performSearch(reset: true)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF06B6D4),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                    ),
                    onPressed: () => unawaited(_performSearch(reset: true)),
                    child: const Text(
                      'Search',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Scope Filters indicator
          if (showScopeBadge ||
              _yearFrom != null ||
              _yearTo != null ||
              _paperKind != null ||
              _openAccess == true)
            Padding(
              padding: const EdgeInsets.only(left: 16, right: 16, bottom: 8),
              child: SizedBox(
                height: 38,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    if (_yearFrom != null || _yearTo != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: InputChip(
                          label: Text(
                            'Year: ${_yearFrom ?? ""}-${_yearTo ?? ""}',
                          ),
                          onDeleted: () {
                            setState(() {
                              _yearFrom = null;
                              _yearTo = null;
                            });
                            unawaited(_performSearch(reset: true));
                          },
                        ),
                      ),
                    if (_paperKind != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: InputChip(
                          label: Text('Kind: $_paperKind'),
                          onDeleted: () {
                            setState(() {
                              _paperKind = null;
                            });
                            unawaited(_performSearch(reset: true));
                          },
                        ),
                      ),
                    if (_openAccess == true)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: InputChip(
                          label: const Text('Open Access'),
                          onDeleted: () {
                            setState(() {
                              _openAccess = null;
                            });
                            unawaited(_performSearch(reset: true));
                          },
                        ),
                      ),
                    ..._domainIds.map(
                      (id) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: InputChip(
                          label: Text('Domain: $id'),
                          onDeleted: () {
                            setState(() {
                              _domainIds.remove(id);
                            });
                            unawaited(_performSearch(reset: true));
                          },
                        ),
                      ),
                    ),
                    ..._fieldIds.map(
                      (id) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: InputChip(
                          label: Text('Field: $id'),
                          onDeleted: () {
                            setState(() {
                              _fieldIds.remove(id);
                            });
                            unawaited(_performSearch(reset: true));
                          },
                        ),
                      ),
                    ),
                    ..._subfieldIds.map(
                      (id) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: InputChip(
                          label: Text('Subfield: $id'),
                          onDeleted: () {
                            setState(() {
                              _subfieldIds.remove(id);
                            });
                            unawaited(_performSearch(reset: true));
                          },
                        ),
                      ),
                    ),
                    ..._topicIds.map(
                      (id) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: InputChip(
                          label: Text('Topic: $id'),
                          onDeleted: () {
                            setState(() {
                              _topicIds.remove(id);
                            });
                            unawaited(_performSearch(reset: true));
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Results List
          Expanded(
            child: _loadedPapers.isEmpty
                ? (_isLoadingMore
                      ? const AppLoading(message: 'Searching papers...')
                      : const AppEmptyState(
                          icon: Icons.search_off_outlined,
                          title: 'No search results',
                          message:
                              'Enter a keyword above or relax/clear filters in the top-right button to find broader publications.',
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
                                color: Color(0xFF06B6D4),
                              ),
                            ),
                          ),
                        );
                      }

                      final paper = _loadedPapers[index];
                      return _SearchResultCard(
                        paper: paper,
                        cardBg: cardBg,
                        borderColor: borderColor,
                        onBookmarkTap: () => _toggleBookmark(paper.id),
                        onAddProjectTap: () =>
                            _openProjectPicker(context, paper.id),
                        onCiteTap: () => _copyCitation(paper),
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

class _SearchResultCard extends StatelessWidget {
  const _SearchResultCard({
    required this.paper,
    required this.onBookmarkTap,
    required this.onAddProjectTap,
    required this.onCiteTap,
    required this.onTap,
    required this.cardBg,
    required this.borderColor,
  });

  final Paper paper;
  final VoidCallback onBookmarkTap;
  final VoidCallback onAddProjectTap;
  final VoidCallback onCiteTap;
  final VoidCallback onTap;
  final Color cardBg;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authors = paper.authors.map((a) => a.displayName).join(', ');

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      color: cardBg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: borderColor),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      paper.title,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        height: 1.3,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF06B6D4).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      paper.dataQualityScore.toStringAsFixed(2),
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF0891B2),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                authors.isEmpty ? 'No authors listed' : authors,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  color: theme.colorScheme.onSurfaceVariant.withValues(
                    alpha: 0.8,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    '${paper.publicationYear} · ${paper.journalName ?? "Unknown venue"} · ${paper.citationCount} cites',
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  if (paper.openAccessUrl != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF451A03),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        'OA',
                        style: TextStyle(
                          color: Color(0xFFFBBF24),
                          fontSize: 8,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const Divider(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.bookmark_outline, size: 18),
                    tooltip: 'Save Paper',
                    onPressed: onBookmarkTap,
                  ),
                  IconButton(
                    icon: const Icon(Icons.folder_open_outlined, size: 18),
                    tooltip: 'Add to project',
                    onPressed: onAddProjectTap,
                  ),
                  IconButton(
                    icon: const Icon(Icons.format_quote_outlined, size: 18),
                    tooltip: 'Cite Paper',
                    onPressed: onCiteTap,
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: onTap,
                    icon: const Icon(
                      Icons.arrow_forward_outlined,
                      size: 14,
                      color: Color(0xFF06B6D4),
                    ),
                    label: const Text(
                      'View Detail',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF06B6D4),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
