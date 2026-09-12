import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
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
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
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
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8)),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineChart(bool isDark) {
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
        const Text(
          'Scope Timeline Trend',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        const Text(
          'What this shows: The overall publication volume within the current scope over time.',
          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontStyle: FontStyle.italic),
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
                    getTitlesWidget: (val, _) => Text(formatCompact(val), style: const TextStyle(fontSize: 9)),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 9)),
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
                  color: const Color(0xFF06B6D4),
                  barWidth: 3,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTopTopicsChart(bool isDark) {
    final topics = overview.topics.take(5).toList();
    if (topics.isEmpty) return const SizedBox.shrink();

    final barGroups = topics.asMap().entries.map((e) {
      return BarChartGroupData(
        x: e.key,
        barRods: [
          BarChartRodData(
            toY: e.value.momentum,
            color: const Color(0xFF8B5CF6),
            width: 14,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      );
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Top Topics by Growth Momentum',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        const Text(
          'What this shows: Emerging research directions sorted by growth momentum (yearly change in publication counts).',
          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontStyle: FontStyle.italic),
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
                    getTitlesWidget: (val, _) => Text(val.toStringAsFixed(1), style: const TextStyle(fontSize: 9)),
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
                        child: Text(shortName, style: const TextStyle(fontSize: 9), overflow: TextOverflow.ellipsis),
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
              gradient: const LinearGradient(
                colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'DATASET SCOPE',
                        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${formatNumber(overview.totalPapersInWindow)} Papers inside current scope',
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Computed from year ${overview.yearFrom ?? 2020} to ${overview.yearTo ?? 2026}',
                        style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                      ),
                    ],
                  ),
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF06B6D4),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: onOpenScopeSheet,
                  icon: const Icon(Icons.tune, color: Colors.white, size: 16),
                  label: const Text('Filters', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Overview Metrics row
          Row(
            children: [
              _buildMetricCard(
                title: 'Scoped Papers',
                value: formatNumber(overview.totalPapersInWindow),
                icon: Icons.article_outlined,
                color: const Color(0xFF06B6D4),
                isDark: isDark,
              ),
              const SizedBox(width: 12),
              _buildMetricCard(
                title: 'Unique Topics',
                value: formatNumber(overview.uniqueTopicsInScope),
                icon: Icons.tag_outlined,
                color: const Color(0xFF8B5CF6),
                isDark: isDark,
              ),
              const SizedBox(width: 12),
              _buildMetricCard(
                title: 'Topic Coverage',
                value: coveragePct,
                icon: Icons.shield_outlined,
                color: const Color(0xFF10B981),
                isDark: isDark,
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Charts section
          _buildTimelineChart(isDark),
          const SizedBox(height: 24),
          _buildTopTopicsChart(isDark),
        ],
      ),
    );
  }
}
