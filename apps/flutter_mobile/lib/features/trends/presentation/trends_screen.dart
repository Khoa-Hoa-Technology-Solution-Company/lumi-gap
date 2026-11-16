import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/trends/components/trends_ai_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_compare_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_scope_tab.dart';
import 'package:flutter_mobile/features/trends/components/trends_signals_tab.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class TrendsScreen extends ConsumerStatefulWidget {
  const TrendsScreen({super.key});

  @override
  ConsumerState<TrendsScreen> createState() => _TrendsScreenState();
}

class _TrendsScreenState extends ConsumerState<TrendsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // Active Scope Parameters
  int _yearFrom = 2020;
  int _yearTo = 2026;
  int _minPapers = 1;
  final String _sortBy = 'momentum';
  TrendScopeFilters _scopeFilters = const TrendScopeFilters();

  String? _aiTabInitialTopic;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _navigateToAiTabWithTopic(String topic) {
    setState(() {
      _aiTabInitialTopic = topic;
    });
    _tabController.animateTo(3); // Index 3 is Explain Tab
  }

  @override
  Widget build(BuildContext context) {
    final currentParams = TrendsOverviewParams(
      yearFrom: _yearFrom,
      yearTo: _yearTo,
      minPapers: _minPapers,
      sortBy: _sortBy,
      limit: 30,
      scopeFilters: _scopeFilters,
    );

    final query = ref.watch(trendsOverviewProvider(currentParams));

    final bgColor = context.lumi.background;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: Text(context.t('Trends Workbench')),
        bottom: TabBar(
          controller: _tabController,
          // Scrolls instead of clipping labels on a narrow screen or with
          // large text.
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          indicatorColor: context.lumi.primary,
          labelColor: context.lumi.primary,
          unselectedLabelColor: context.lumi.muted,
          tabs: [
            Tab(text: context.t('Signals')),
            Tab(text: context.t('Scope')),
            Tab(text: context.t('Compare')),
            Tab(text: context.t('Explain')),
          ],
        ),
      ),
      body: query.when(
        data: (overview) => TabBarView(
          controller: _tabController,
          children: [
            TrendsSignalsTab(
              overview: overview,
              params: currentParams,
              onExplainTopic: _navigateToAiTabWithTopic,
            ),
            TrendsScopeTab(
              overview: overview,
              params: currentParams,
              onChanged: (newParams) {
                setState(() {
                  _yearFrom = newParams.yearFrom ?? 2020;
                  _yearTo = newParams.yearTo ?? 2026;
                  _minPapers = newParams.minPapers ?? 1;
                  _scopeFilters = newParams.scopeFilters;
                });
              },
              onGoToSignals: () => _tabController.animateTo(0),
            ),
            TrendsCompareTab(
              overview: overview,
              params: currentParams,
              onExplainTopic: _navigateToAiTabWithTopic,
            ),
            TrendsAiTab(
              overview: overview,
              params: currentParams,
              initialTopic: _aiTabInitialTopic,
            ),
          ],
        ),
        loading: () => const LumiPageSkeleton(height: 120),
        error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
      ),
    );
  }
}
