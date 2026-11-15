import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';

class TrendsOverviewTab extends StatelessWidget {
  const TrendsOverviewTab({
    required this.overview,
    required this.onOpenScopeSheet,
    super.key,
  });

  final TrendsOverview overview;
  final VoidCallback onOpenScopeSheet;

  Widget _buildMetricCard({
    required BuildContext context,
    required String title,
    required String value,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: context.lumi.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: context.lumi.line),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTypography.metrics.bodySmall!.copyWith(fontWeight: FontWeight.w600, color: context.lumi.muted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: AppTypography.metrics.bodyMedium!.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineChart(BuildContext context, bool isDark) {
    final yearly = overview.yearlyTotalPapers;
    if (yearly.isEmpty) return const SizedBox.shrink();

    final spots = yearly.asMap().entries.map((e) {
      return FlSpot(e.value.year.toDouble(), e.value.count.toDouble());
    }).toList();

    final minYear = yearly.map((e) => e.year).reduce((a, b) => a < b ? a : b).toDouble();
    final maxYear = yearly.map((e) => e.year).reduce((a, b) => a > b ? a : b).toDouble();
    final maxCount = yearly.map((e) => e.count).reduce((a, b) => a > b ? a : b).toDouble();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          context.t('Scope Timeline Trend'),
          style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        Text(
          context.t('What this shows: The overall publication volume within the current scope over time.'),
          style: context.type.bodySmall!.copyWith(color: context.lumi.muted, fontStyle: FontStyle.italic),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 160,
          child: LineChart(
            LineChartData(
              gridData: const FlGridData(show: false),
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 36,
                    getTitlesWidget: (val, _) => Text(formatCompact(val), style: context.type.bodySmall),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: context.type.bodySmall),
                  ),
                ),
                rightTitles: const AxisTitles(),
                topTitles: const AxisTitles(),
              ),
              borderData: FlBorderData(show: false),
              minX: minYear,
              maxX: maxYear,
              minY: 0,
              maxY: maxCount * 1.15,
              lineBarsData: [
                LineChartBarData(
                  spots: spots,
                  isCurved: true,
                  color: context.lumi.primary,
                  barWidth: 3,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTopTopicsChart(BuildContext context, bool isDark) {
    final topics = overview.topics.take(5).toList();
    if (topics.isEmpty) return const SizedBox.shrink();

    final barGroups = topics.asMap().entries.map((e) {
      return BarChartGroupData(
        x: e.key,
        barRods: [
          BarChartRodData(
            toY: e.value.momentum,
            color: context.lumi.primary,
            width: 14,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      );
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          context.t('Top Topics by Growth Momentum'),
          style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        Text(
          context.t('What this shows: Emerging research directions sorted by growth momentum (yearly change in publication counts).'),
          style: context.type.bodySmall!.copyWith(color: context.lumi.muted, fontStyle: FontStyle.italic),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 160,
          child: BarChart(
            BarChartData(
              gridData: const FlGridData(show: false),
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 36,
                    getTitlesWidget: (val, _) => Text(val.toStringAsFixed(1), style: context.type.bodySmall),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, _) {
                      final idx = val.toInt();
                      if (idx < 0 || idx >= topics.length) return const SizedBox.shrink();
                      final topic = topics[idx].topic;
                      final shortName = topic.length > 10 ? '${topic.substring(0, 8)}..' : topic;
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(shortName, style: context.type.bodySmall, overflow: TextOverflow.ellipsis),
                      );
                    },
                  ),
                ),
                rightTitles: const AxisTitles(),
                topTitles: const AxisTitles(),
              ),
              borderData: FlBorderData(show: false),
              barGroups: barGroups,
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final coverage = overview.taxonomyCoverage;
    final coveragePct = coverage != null ? '${(coverage.primaryTopicCoveragePct * 100).toStringAsFixed(1)}%' : 'N/A';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header summary card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.lumi.surface,
              border: Border.all(color: context.lumi.line),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        context.t('DATASET SCOPE'),
                        style: context.type.bodySmall!.copyWith(color: context.lumi.muted, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        context.t('{{count}} Papers inside current scope', {'count': formatNumber(overview.totalPapersInWindow)}),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        context.t('Computed from year {{from}} to {{to}}', {'from': overview.yearFrom ?? 2020, 'to': overview.yearTo ?? 2026}),
                        style: context.type.bodySmall!.copyWith(color: context.lumi.foregroundSecondary,),
                      ),
                    ],
                  ),
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: context.lumi.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: onOpenScopeSheet,
                  icon: Icon(Icons.tune, color: context.lumi.onPrimary, size: 16),
                  label: Text(context.t('Filters'), style: TextStyle(color: context.lumi.onPrimary, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Overview Metrics row
          Row(
            children: [
              _buildMetricCard(
                context: context,
                title: context.t('Scoped Papers'),
                value: formatNumber(overview.totalPapersInWindow),
                icon: Icons.article_outlined,
                color: context.lumi.primary,
                isDark: isDark,
              ),
              const SizedBox(width: 12),
              _buildMetricCard(
                context: context,
                title: context.t('Unique Topics'),
                value: formatNumber(overview.uniqueTopicsInScope),
                icon: Icons.tag_outlined,
                color: context.lumi.primary,
                isDark: isDark,
              ),
              const SizedBox(width: 12),
              _buildMetricCard(
                context: context,
                title: context.t('Topic Coverage'),
                value: coveragePct,
                icon: Icons.shield_outlined,
                color: context.lumi.success,
                isDark: isDark,
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Charts section
          _buildTimelineChart(context, isDark),
          const SizedBox(height: 24),
          _buildTopTopicsChart(context, isDark),
        ],
      ),
    );
  }
}
