import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:go_router/go_router.dart';

class TrendsSignalsTab extends StatelessWidget {
  const TrendsSignalsTab({
    required this.overview,
    required this.params,
    required this.onExplainTopic,
    super.key,
  });

  final TrendsOverview overview;
  final TrendsOverviewParams params;
  final void Function(String) onExplainTopic;

  String _getReliabilityLabel(int paperCount) {
    if (paperCount >= 20) return 'High';
    if (paperCount >= 5) return 'Exploratory';
    return 'Small base';
  }

  Color _getReliabilityColor(String label) {
    switch (label) {
      case 'High':
        return const Color(0xFF10B981);
      case 'Exploratory':
        return const Color(0xFF06B6D4);
      default:
        return const Color(0xFFF59E0B);
    }
  }

  void _showTopicDetailSheet(BuildContext context, TrendingTopic topic) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final spots = topic.yearlyBreakdown.asMap().entries.map((e) {
      return FlSpot(e.value.year.toDouble(), e.value.count.toDouble());
    }).toList();

    final minYear = topic.yearlyBreakdown.isNotEmpty
        ? topic.yearlyBreakdown.first.year.toDouble()
        : 2020.0;
    final maxYear = topic.yearlyBreakdown.isNotEmpty
        ? topic.yearlyBreakdown.last.year.toDouble()
        : 2026.0;

    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) {
          return Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
            ),
            padding: const EdgeInsets.all(20),
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
                Text(
                  topic.topic,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Scope: ${topic.taxonomy?.fieldName ?? "Unknown field"}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                const Divider(height: 24),

                // Mini Line Chart
                const Text(
                  'Publication Timeline Trend',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 150,
                  child: LineChart(
                    LineChartData(
                      gridData: FlGridData(
                        drawVerticalLine: false,
                        getDrawingHorizontalLine: (value) => FlLine(
                          color: isDark
                              ? const Color(0xFF334155)
                              : const Color(0xFFE2E8F0),
                          strokeWidth: 1,
                        ),
                      ),
                      titlesData: FlTitlesData(
                        leftTitles: const AxisTitles(),
                        rightTitles: const AxisTitles(),
                        topTitles: const AxisTitles(),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            interval: 2,
                            getTitlesWidget: (value, meta) {
                              return Text(
                                value.toInt().toString(),
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: Color(0xFF64748B),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      lineBarsData: [
                        LineChartBarData(
                          spots: spots,
                          isCurved: true,
                          color: const Color(0xFF06B6D4),
                          barWidth: 3,
                          isStrokeCapRound: true,
                          belowBarData: BarAreaData(
                            color: const Color(
                              0xFF06B6D4,
                            ).withValues(alpha: 0.1),
                          ),
                        ),
                      ],
                      minX: minYear,
                      maxX: maxYear,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Explanation metrics
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _buildMetricCell(
                      'Growth Rate',
                      '${topic.growthRatePct.toStringAsFixed(1)}% YoY',
                      Colors.green,
                    ),
                    _buildMetricCell(
                      'Momentum Score',
                      topic.momentum.toStringAsFixed(2),
                      const Color(0xFF06B6D4),
                    ),
                    _buildMetricCell(
                      'Publications',
                      topic.totalPapers.toString(),
                      const Color(0xFFA78BFA),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Actions
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF06B6D4),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onPressed: () {
                          Navigator.pop(context);
                          unawaited(
                            context.push(
                              '/search?q=${Uri.encodeComponent(topic.topic)}',
                            ),
                          );
                        },
                        icon: const Icon(
                          Icons.search,
                          color: Colors.white,
                          size: 16,
                        ),
                        label: const Text(
                          'Search Papers',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF8B5CF6),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onPressed: () {
                          Navigator.pop(context);
                          unawaited(
                            context.push(
                              '/reports?create=true&topic=${Uri.encodeComponent(topic.topic)}',
                            ),
                          );
                        },
                        icon: const Icon(
                          Icons.description,
                          color: Colors.white,
                          size: 16,
                        ),
                        label: const Text(
                          'Generate Report',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () {
                      Navigator.pop(context);
                      onExplainTopic(topic.topic);
                    },
                    icon: const Icon(Icons.auto_awesome, size: 16),
                    label: const Text(
                      'Explain Trend with AI',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildMetricCell(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            color: Color(0xFF94A3B8),
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark ? const Color(0xFF1A2332) : theme.cardColor;
    final borderColor = isDark
        ? const Color(0xFF26334A)
        : const Color(0xFFE2E8F0);

    // Find the strongest topic for the banner
    final strongestTopic = overview.topics.isNotEmpty
        ? overview.topics.first
        : null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Strongest Topic Insight Banner
        if (strongestTopic != null) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF06B6D4).withValues(alpha: 0.1),
              border: Border.all(
                color: const Color(0xFF06B6D4).withValues(alpha: 0.3),
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.auto_awesome,
                  color: Color(0xFF06B6D4),
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '"${strongestTopic.topic}" is the strongest rising topic in this dataset scope with growth rate of ${strongestTopic.growthRatePct.toStringAsFixed(1)}%.',
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Rising Keywords Title & Chips
        if (overview.risingKeywords.isNotEmpty) ...[
          const Row(
            children: [
              Icon(Icons.tag, color: Color(0xFF8B5CF6), size: 18),
              SizedBox(width: 8),
              Text(
                'Emerging Keywords',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: overview.risingKeywords.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                final kw = overview.risingKeywords[idx];
                return ActionChip(
                  label: Text('${kw.keyword} (+${kw.growthRatePct.round()}%)'),
                  onPressed: () => unawaited(
                    context.push(
                      '/search?q=${Uri.encodeComponent(kw.keyword)}',
                    ),
                  ),
                  backgroundColor: cardBg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: BorderSide(color: borderColor),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 24),
        ],

        // Ranked Topics Title
        const Row(
          children: [
            Icon(Icons.trending_up, color: Color(0xFF06B6D4), size: 18),
            SizedBox(width: 8),
            Text(
              'Rising Topics Signals',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
          ],
        ),
        const SizedBox(height: 12),

        if (overview.topics.isEmpty)
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'No signals found. Change scope to load topics.',
                style: TextStyle(
                  fontStyle: FontStyle.italic,
                  color: Color(0xFF94A3B8),
                ),
              ),
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: overview.topics.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, idx) {
              final topic = overview.topics[idx];
              final reliability = _getReliabilityLabel(topic.totalPapers);
              final reliabilityColor = _getReliabilityColor(reliability);

              return Card(
                elevation: 0,
                margin: EdgeInsets.zero,
                color: cardBg,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: borderColor),
                ),
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
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  topic.topic,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  topic.taxonomy?.fieldName ?? 'Unknown field',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Color(0xFF94A3B8),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: reliabilityColor.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              reliability,
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                                color: reliabilityColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Text(
                            '${topic.totalPapers} publications',
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            '·',
                            style: TextStyle(color: Color(0xFF94A3B8)),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Growth: +${topic.growthRatePct.toStringAsFixed(1)}%',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Colors.green,
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            '·',
                            style: TextStyle(color: Color(0xFF94A3B8)),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Momentum: ${topic.momentum.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.search, size: 18),
                            tooltip: 'Search papers',
                            onPressed: () => unawaited(
                              context.push(
                                '/search?q=${Uri.encodeComponent(topic.topic)}',
                              ),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.auto_awesome_outlined,
                              size: 18,
                            ),
                            tooltip: 'Explain trend',
                            onPressed: () => onExplainTopic(topic.topic),
                          ),
                          const Spacer(),
                          TextButton.icon(
                            onPressed: () =>
                                _showTopicDetailSheet(context, topic),
                            icon: const Icon(
                              Icons.expand_more,
                              size: 16,
                              color: Color(0xFF06B6D4),
                            ),
                            label: const Text(
                              'View Trend Graph',
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
              );
            },
          ),
      ],
    );
  }
}
