import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_analysis_overlay.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_card.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_detail_sheet.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_sheets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

export 'package:flutter_mobile/features/gaps/presentation/gap_sheets.dart'
    show gapSorts, gapTopicError, gapTopicMax, gapTopicMin;

class GapsScreen extends ConsumerStatefulWidget {
  const GapsScreen({super.key, this.initialTopic});

  final String? initialTopic;

  @override
  ConsumerState<GapsScreen> createState() => _GapsScreenState();
}

class _GapsScreenState extends ConsumerState<GapsScreen> {
  late final _searchField =
      TextEditingController(text: widget.initialTopic ?? '');

  /// The topic filter actually sent (the API's `topic`, as on the web): the
  /// field settles for 350ms first, so typing does not fire a request per
  /// key.
  late String _search = widget.initialTopic ?? '';
  Timer? _searchDebounce;

  String _status = 'active';
  GapListFilters _filters = const GapListFilters();

  bool _analyzing = false;
  String? _analysisId;
  Timer? _pollTimer;
  bool _disposed = false;

  /// Gaps whose status change is in flight.
  final Set<String> _busy = {};

  /// Pages 1.._pages are shown; scrolling near the end asks for the next.
  int _pages = 1;
  bool _canLoadMore = false;
  final _scroll = ScrollController();

  GapsListParams _paramsFor(int page) => GapsListParams(
        topic: _search,
        status: _status,
        minConfidence: _filters.minConfidence,
        sortBy: _filters.sortBy,
        page: page,
      );

  /// A filter change shows its own list from the first page.
  void _setFilter(VoidCallback change) => setState(() {
        change();
        _pages = 1;
      });

  void _maybeLoadMore() {
    if (!mounted || !_canLoadMore || !_scroll.hasClients) return;
    if (_scroll.position.extentAfter > 600) return;
    _canLoadMore = false;
    setState(() => _pages++);
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeLoadMore);
  }

  @override
  void dispose() {
    _disposed = true;
    _searchField.dispose();
    _scroll.dispose();
    _searchDebounce?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted && value.trim() != _search.trim()) {
        _setFilter(() => _search = value.trim());
      }
    });
  }

  void _showError(Object e) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.t(failureMessageKey(e))),
        backgroundColor: context.lumi.error,
      ),
    );
  }

  Future<void> _openFilters() async {
    final picked = await showGapFilterSheet(context, _filters);
    if (picked != null && picked != _filters && mounted) {
      _setFilter(() => _filters = picked);
    }
  }

  Future<void> _askAndAnalyze() async {
    if (_analyzing) return;
    final topic = await showAnalyzeTopicSheet(context);
    if (topic == null || !mounted) return;
    await _analyze(topic);
  }

  Future<void> _analyze(String topic) async {
    if (_analyzing || gapTopicError(topic) != null) return;
    setState(() => _analyzing = true);
    try {
      final id = await ref.read(gapsApiProvider).analyze(topic);
      // Never start polling for a screen that is already gone.
      if (_disposed || !mounted) return;
      setState(() => _analysisId = id);
      _pollTimer?.cancel();
      _pollTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => ref.invalidate(gapStatusProvider(id)),
      );
    } on Object catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

  void _closeAnalysis({required bool ready}) {
    _pollTimer?.cancel();
    _pollTimer = null;
    setState(() => _analysisId = null);
    // The finished job added gaps: show them.
    if (ready) {
      _pages = 1;
      ref.invalidate(gapsProvider);
    }
  }

  Future<void> _changeStatus(String id, String status) async {
    if (!_busy.add(id)) return;
    setState(() {});
    try {
      await ref.read(gapsApiProvider).patchStatus(id, status);
    } on Object catch (e) {
      _showError(e);
    } finally {
      _busy.remove(id);
      if (mounted) {
        setState(() {});
        // Every list, not just this filter: the gap moved between tabs.
        ref.invalidate(gapsProvider);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final gaps = ref.watch(gapsProvider(_paramsFor(1)));
    final theme = Theme.of(context);
    final lumi = context.lumi;

    // Every page asked so far, in order; a gap that moved onto the next page
    // between two requests is shown once.
    final shown = <ResearchGapItem>[];
    final seen = <String>{};
    var lastPage = gaps;
    for (var page = 1; page <= _pages; page++) {
      final current =
          page == 1 ? gaps : ref.watch(gapsProvider(_paramsFor(page)));
      for (final gap in current.value?.data ?? const <ResearchGapItem>[]) {
        if (seen.add(gap.id)) shown.add(gap);
      }
      lastPage = current;
    }
    final total = gaps.value?.total ?? 0;
    // An empty or short page means the list is over, whatever the total
    // says: no endless requests.
    _canLoadMore = lastPage.hasValue &&
        !lastPage.isLoading &&
        lastPage.requireValue.data.length >= _paramsFor(_pages).pageSize &&
        shown.length < total;
    if (_canLoadMore) {
      // A short first page may not scroll at all: check once laid out.
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoadMore());
    }

    final Widget list;
    if (gaps.hasValue) {
      list = shown.isEmpty
          ? LumiEmptyState(
              icon: Icons.lightbulb_outline,
              title: context.t('No research gaps found'),
              message: context.t('Try another filter or submit a topic.'),
              actionLabel: context.t('Analyze a topic'),
              onAction:
                  _analyzing ? null : () => unawaited(_askAndAnalyze()),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final gap in shown)
                  GapCard(
                    gap: gap,
                    onOpen: () => unawaited(
                      showGapDetailSheet(
                        context,
                        gap: gap,
                        onStatusChange: (s) =>
                            unawaited(_changeStatus(gap.id, s)),
                      ),
                    ),
                  ),
                if (_pages > 1 && lastPage.isLoading)
                  const LumiSkeleton(height: 120)
                else if (lastPage.hasError)
                  LumiErrorState(
                    message: context.t(failureMessageKey(lastPage.error!)),
                    retrying: lastPage.isLoading,
                    onRetry: () =>
                        ref.invalidate(gapsProvider(_paramsFor(_pages))),
                    inline: true,
                  ),
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    context.plural(
                      total,
                      one: '{{count}} research gap found',
                      other: '{{count}} research gaps found',
                    ),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: lumi.foregroundSecondary),
                  ),
                ),
              ],
            );
    } else if (gaps.hasError) {
      list = LumiErrorState(
        message: context.t(failureMessageKey(gaps.error!)),
        retrying: gaps.isLoading,
        onRetry: () => ref.invalidate(gapsProvider(_paramsFor(1))),
        inline: true,
      );
    } else {
      list = const LumiSkeleton(rows: 3, height: 120);
    }

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Research gaps'))),
      // With gaps on screen the way to add more stays in reach; an empty
      // list carries the same action in its message instead.
      floatingActionButton: shown.isEmpty || _analysisId != null
          ? null
          : FloatingActionButton.extended(
              onPressed:
                  _analyzing ? null : () => unawaited(_askAndAnalyze()),
              icon: const Icon(Icons.add),
              label: Text(context.t('Analyze')),
            ),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: () async {
              setState(() => _pages = 1);
              ref.invalidate(gapsProvider);
            },
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 96),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchField,
                        maxLength: gapTopicMax,
                        onChanged: _onSearchChanged,
                        decoration: InputDecoration(
                          hintText: context.t('Filter by topic'),
                          prefixIcon: const Icon(Icons.search, size: 20),
                          counterText: '',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    LumiFilterButton(
                      activeCount: _filters.activeCount,
                      onPressed: () => unawaited(_openFilters()),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                LumiSegmentedTabs<String>(
                  options: [
                    ('active', context.t('Active')),
                    ('resolved', context.t('Resolved')),
                    ('dismissed', context.t('Dismissed')),
                  ],
                  selected: _status,
                  onChanged: (s) => _setFilter(() => _status = s),
                ),
                const SizedBox(height: 16),
                list,
              ],
            ),
          ),
          if (_analysisId != null)
            Positioned.fill(
              child: GapAnalysisOverlay(
                id: _analysisId!,
                onClose: _closeAnalysis,
              ),
            ),
        ],
      ),
    );
  }
}
