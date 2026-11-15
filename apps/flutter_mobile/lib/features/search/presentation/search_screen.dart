import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
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

  void _openFilterBottomSheet() {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (context) {
          return StatefulBuilder(
            builder: (context, setBottomSheetState) {
              final theme = Theme.of(context);
              final lumi = context.lumi;

              return Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  bottom: MediaQuery.of(context).viewInsets.bottom + 16,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            context.t('Search Filters'),
                            style: theme.textTheme.titleLarge,
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
                            child: Text(context.t('Clear All')),
                          ),
                        ],
                      ),
                      const Divider(height: 24),

                      // Rerank Toggle
                      SwitchListTile(
                        title: Text(
                          context.t('Semantic Reranking'),
                          style: theme.textTheme.titleSmall,
                        ),
                        subtitle: Text(
                          context.t(
                            'Uses AI models to re-evaluate relevance. May increase search latency.',
                          ),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: lumi.foregroundSecondary,
                          ),
                        ),
                        value: _rerank,
                        contentPadding: EdgeInsets.zero,
                        onChanged: (val) {
                          setBottomSheetState(() {
                            _rerank = val;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // Years Range Inputs
                      Text(
                        context.t('Publication Years'),
                        style: theme.textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              decoration: InputDecoration(
                                hintText: context.t('From Year'),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
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
                                hintText: context.t('To Year'),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
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
                      Text(
                        context.t('Sort Results By'),
                        style: theme.textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _sort,
                        decoration: InputDecoration(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        items: [
                          DropdownMenuItem(
                            value: 'relevance',
                            child: Text(context.t('Relevance')),
                          ),
                          DropdownMenuItem(
                            value: 'citations',
                            child: Text(context.t('Citation Count')),
                          ),
                          DropdownMenuItem(
                            value: 'year',
                            child: Text(context.t('Publication Year')),
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
                      Text(
                        context.t('Paper Kind'),
                        style: theme.textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _paperKind,
                        decoration: InputDecoration(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        hint: Text(context.t('All Kinds')),
                        items: [
                          DropdownMenuItem(
                            value: 'article',
                            child: Text(context.t('Journal Article')),
                          ),
                          DropdownMenuItem(
                            value: 'book-chapter',
                            child: Text(context.t('Book Chapter')),
                          ),
                          DropdownMenuItem(
                            value: 'proceedings',
                            child: Text(context.t('Conference Proceeding')),
                          ),
                          DropdownMenuItem(
                            value: 'preprint',
                            child: Text(context.t('Preprint')),
                          ),
                          DropdownMenuItem(
                            value: 'review',
                            child: Text(context.t('Review')),
                          ),
                          DropdownMenuItem(
                            value: 'other',
                            child: Text(context.t('Other')),
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
                        title: Text(
                          context.t('Open Access Only'),
                          style: theme.textTheme.titleSmall,
                        ),
                        value: _openAccess ?? false,
                        contentPadding: EdgeInsets.zero,
                        onChanged: (val) {
                          setBottomSheetState(() {
                            _openAccess = val == true ? true : null;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // Source
                      Text(
                        context.t('Journal / Venue Source'),
                        style: theme.textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        decoration: InputDecoration(
                          hintText: context.t('e.g. Nature, IEEE'),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
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
                        child: FilledButton(
                          onPressed: () {
                            Navigator.pop(context);
                            unawaited(_performSearch(reset: true));
                          },
                          child: Text(context.t('Apply Filters')),
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
                            context.t('Add to project'),
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
                                    context.go('/projects');
                                  },
                                  child: Text(
                                    context.t('Create your first project'),
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
                                      color: context.lumi.primarySoft,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Icon(
                                      Icons.folder,
                                      color: context.lumi.primary,
                                      size: 17,
                                    ),
                                  ),
                                  title: Text(
                                    project.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  subtitle: Text(
                                    context.plural(
                                      project.papers.length,
                                      one: '{{count}} paper',
                                      other: '{{count}} papers',
                                    ),
                                  ),
                                  trailing: Icon(
                                    Icons.add,
                                    color: context.lumi.primary,
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
                                          SnackBar(
                                            content: Text(
                                              context.t(
                                                'Added paper to project',
                                              ),
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
                                            content: Text(
                                              context.t(
                                                'Failed to add: {{e}}',
                                                {'e': context.t(failureMessageKey(e))},
                                              ),
                                            ),
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
                        error: (e, _) => Text(
                          context.t('Error loading projects: {{e}}', {'e': context.t(failureMessageKey(e))}),
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

  Future<void> _toggleBookmark(String paperId) async {
    final api = ref.read(bookmarksApiProvider);
    final status = await api.checkStatus('paper', paperId);
    if (status.bookmarked && status.bookmarkId != null) {
      await api.delete(status.bookmarkId!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Bookmark removed'))),
        );
      }
    } else {
      await api.create(targetKind: 'paper', targetId: paperId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Bookmarked successfully'))),
        );
      }
    }
    ref.invalidate(bookmarksProvider);
  }

  void _copyCitation(Paper paper) {
    final authors = paper.authors.map((a) => a.displayName).join(', ');
    final citation =
        '${authors.isEmpty ? context.t("Unknown") : authors} (${paper.publicationYear}). ${paper.title}. ${paper.journalName ?? context.t("Unknown Journal")}.';
    unawaited(
      Clipboard.setData(ClipboardData(text: citation)).then((_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(context.t('Citation copied to clipboard'))),
          );
        }
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final showScopeBadge =
        _domainIds.isNotEmpty ||
        _fieldIds.isNotEmpty ||
        _subfieldIds.isNotEmpty ||
        _topicIds.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Search Papers')),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _openFilterBottomSheet,
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
                            context.t('Year: {{from}}-{{to}}', {
                              'from': _yearFrom ?? '',
                              'to': _yearTo ?? '',
                            }),
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
                          label: Text(
                            context.t('Kind: {{paperKind}}', {
                              'paperKind': _paperKind,
                            }),
                          ),
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
                          label: Text(context.t('Open Access')),
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
                          label: Text(context.t('Domain: {{id}}', {'id': id})),
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
                          label: Text(context.t('Field: {{id}}', {'id': id})),
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
                          label: Text(
                            context.t('Subfield: {{id}}', {'id': id}),
                          ),
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
                          label: Text(context.t('Topic: {{id}}', {'id': id})),
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
                      return _SearchResultCard(
                        paper: paper,
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
  });

  final Paper paper;
  final VoidCallback onBookmarkTap;
  final VoidCallback onAddProjectTap;
  final VoidCallback onCiteTap;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final authors = paper.authors.map((a) => a.displayName).join(', ');
    final venue = paper.journalName?.trim() ?? '';
    // Only what the paper really has: a missing venue is left out.
    final meta = [
      '${paper.publicationYear}',
      if (venue.isNotEmpty) venue,
      context.plural(
        paper.citationCount,
        one: '{{count}} citation',
        other: '{{count}} citations',
      ),
    ].join(' · ');

    const radius = BorderRadius.all(Radius.circular(8));
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: lumi.surface,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: lumi.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            paper.title,
                            style: theme.textTheme.titleMedium,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        // Imported papers keep the stored default 0, which
                        // means "not measured": no chip rather than "0.00".
                        if (paper.dataQualityScore > 0) ...[
                          const SizedBox(width: 8),
                          Tooltip(
                            message: context.t('Data quality score'),
                            child: LumiChip(
                              label: paper.dataQualityScore.toStringAsFixed(2),
                              tone: LumiChipTone.primary,
                              icon: Icons.bar_chart,
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (authors.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        authors,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: lumi.foregroundSecondary,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          meta,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: lumi.muted,
                          ),
                        ),
                        if (paper.openAccessUrl != null)
                          LumiChip(
                            label: context.t('Open Access'),
                            tone: LumiChipTone.success,
                            icon: Icons.lock_open,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: lumi.line),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.bookmark_outline, size: 20),
                      tooltip: context.t('Save Paper'),
                      onPressed: onBookmarkTap,
                    ),
                    IconButton(
                      icon: const Icon(Icons.folder_open_outlined, size: 20),
                      tooltip: context.t('Add to project'),
                      onPressed: onAddProjectTap,
                    ),
                    IconButton(
                      icon: const Icon(Icons.format_quote_outlined, size: 20),
                      tooltip: context.t('Cite Paper'),
                      onPressed: onCiteTap,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
