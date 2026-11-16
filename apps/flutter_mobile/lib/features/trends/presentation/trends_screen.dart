import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/trends/components/trends_ai_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_compare_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_scope_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_signals_tab.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum _TrendsTab { signals, compare, explain }

const int _defaultYearFrom = scopeDefaultYearFrom;
const int _defaultYearTo = scopeDefaultYearTo;
const int _defaultMinPapers = scopeDefaultMinPapers;

/// How many parts of [p] differ from the default scope: the badge on the
/// Scope button.
int trendScopeActiveCount(TrendsOverviewParams p) {
  final f = p.scopeFilters;
  return [
    (p.yearFrom ?? _defaultYearFrom) != _defaultYearFrom ||
        (p.yearTo ?? _defaultYearTo) != _defaultYearTo,
    (p.minPapers ?? _defaultMinPapers) != _defaultMinPapers,
    f.paperKinds.isNotEmpty,
    f.openAccessStatuses.isNotEmpty,
    f.domainIds.isNotEmpty,
    f.fieldIds.isNotEmpty,
    f.subfieldIds.isNotEmpty,
  ].where((changed) => changed).length;
}

class TrendsScreen extends ConsumerStatefulWidget {
  const TrendsScreen({super.key});

  @override
  ConsumerState<TrendsScreen> createState() => _TrendsScreenState();
}

class _TrendsScreenState extends ConsumerState<TrendsScreen> {
  _TrendsTab _tab = _TrendsTab.signals;

  int _yearFrom = _defaultYearFrom;
  int _yearTo = _defaultYearTo;
  int _minPapers = _defaultMinPapers;
  final String _sortBy = 'momentum';
  TrendScopeFilters _scopeFilters = const TrendScopeFilters();

  String? _aiTabInitialTopic;

  TrendsOverviewParams get _params => TrendsOverviewParams(
        yearFrom: _yearFrom,
        yearTo: _yearTo,
        minPapers: _minPapers,
        sortBy: _sortBy,
        limit: 30,
        scopeFilters: _scopeFilters,
      );

  void _explain(String topic) => setState(() {
        _aiTabInitialTopic = topic;
        _tab = _TrendsTab.explain;
      });

  void _apply(TrendsOverviewParams p) => setState(() {
        _yearFrom = p.yearFrom ?? _defaultYearFrom;
        _yearTo = p.yearTo ?? _defaultYearTo;
        _minPapers = p.minPapers ?? _defaultMinPapers;
        _scopeFilters = p.scopeFilters;
      });

  Future<void> _openScope(TrendsOverview? overview) async {
    if (overview == null) return;
    final picked = await showModalBottomSheet<TrendsOverviewParams>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ScopeSheet(overview: overview, params: _params),
    );
    if (picked != null && mounted) _apply(picked);
  }

  @override
  Widget build(BuildContext context) {
    final params = _params;
    final query = ref.watch(trendsOverviewProvider(params));
    final active = trendScopeActiveCount(params);

    return Scaffold(
      backgroundColor: context.lumi.background,
      appBar: AppBar(
        title: Text(context.t('Trends')),
        actions: [
          LumiFilterButton(
            activeCount: active,
            onPressed: () => _openScope(query.value),
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: LumiSegmentedTabs<_TrendsTab>(
              options: [
                (_TrendsTab.signals, context.t('Signals')),
                (_TrendsTab.compare, context.t('Compare')),
                (_TrendsTab.explain, context.t('Explain')),
              ],
              selected: _tab,
              onChanged: (t) => setState(() => _tab = t),
            ),
          ),
          Expanded(
            child: query.when(
              // Each tab keeps its state (typed topics, a chosen chart) when
              // another one is shown.
              data: (overview) => IndexedStack(
                index: _tab.index,
                children: [
                  TrendsSignalsTab(
                    overview: overview,
                    params: params,
                    onExplainTopic: _explain,
                  ),
                  TrendsCompareTab(
                    overview: overview,
                    params: params,
                    onExplainTopic: _explain,
                  ),
                  TrendsAiTab(
                    overview: overview,
                    params: params,
                    initialTopic: _aiTabInitialTopic,
                  ),
                ],
              ),
              loading: () => const LumiPageSkeleton(height: 120),
              error: (error, _) =>
                  AppErrorState(message: context.t(failureMessageKey(error))),
            ),
          ),
        ],
      ),
    );
  }
}

/// The scope editor in a sheet. It edits a copy: nothing changes on the
/// screen until "Apply"; closing it another way keeps the old scope.
class _ScopeSheet extends StatefulWidget {
  const _ScopeSheet({required this.overview, required this.params});

  final TrendsOverview overview;
  final TrendsOverviewParams params;

  @override
  State<_ScopeSheet> createState() => _ScopeSheetState();
}

class _ScopeSheetState extends State<_ScopeSheet> {
  late TrendsOverviewParams _draft = widget.params;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.9,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    context.t('Scope'),
                    style: theme.textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  tooltip: context.t('Close'),
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Expanded(
            child: TrendsScopeTab(
              overview: widget.overview,
              params: _draft,
              onChanged: (p) => setState(() => _draft = p),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.pop(context, _draft),
                  child: Text(context.t('Apply')),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
