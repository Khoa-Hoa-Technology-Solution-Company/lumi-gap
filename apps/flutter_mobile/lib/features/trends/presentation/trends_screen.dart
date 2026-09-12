import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
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
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final bgColor = isDark
        ? const Color(0xFF0F1B2D)
        : theme.scaffoldBackgroundColor;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: const Text(
          'Trends Workbench',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFF06B6D4),
          labelColor: const Color(0xFF06B6D4),
          unselectedLabelColor: const Color(0xFF94A3B8),
          tabs: const [
            Tab(text: 'Signals'),
            Tab(text: 'Scope'),
            Tab(text: 'Compare'),
            Tab(text: 'Explain'),
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
        loading: () => const AppLoading(
          fullScreen: true,
          message: 'Loading trends data...',
        ),
        error: (error, _) => AppErrorState(message: error.toString()),
      ),
    );
  }
}
