import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
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
    if (paperCount >= 20) return tk('High');
    if (paperCount >= 5) return tk('Exploratory');
    return tk('Small base');
  }

  void _showTopicDetailSheet(BuildContext context, TrendingTopic topic) {

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
              color: context.lumi.surface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(12),
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
                      color: context.lumi.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  topic.topic,
                  style: context.type.titleLarge!.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  context.t('Scope: {{field}}', {'field': topic.taxonomy?.fieldName ?? context.t('Unknown field')}),
                  style: context.type.bodySmall!.copyWith(
                    color: context.lumi.muted,
                  ),
                ),
                const Divider(height: 24),

                // Mini Line Chart
                Text(
                  context.t('Publication Timeline Trend'),
                  style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 150,
                  child: LineChart(
                    LineChartData(
                      gridData: FlGridData(
                        drawVerticalLine: false,
                        getDrawingHorizontalLine: (value) => FlLine(
                          color: context.lumi.line,
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
                                style: context.type.bodySmall!.copyWith(
                                  color: context.lumi.foregroundSecondary,
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
                          color: context.lumi.primary,
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
                      context,
                      context.t('Growth Rate'),
                      context.t('{{percent}}% YoY', {'percent': topic.growthRatePct.toStringAsFixed(1)}),
                      context.lumi.success,
                    ),
                    _buildMetricCell(
                      context,
                      context.t('Momentum Score'),
                      topic.momentum.toStringAsFixed(2),
                      context.lumi.primary,
                    ),
                    _buildMetricCell(
                      context,
                      context.t('Publications'),
                      topic.totalPapers.toString(),
                      context.lumi.primary,
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
                          backgroundColor: context.lumi.primary,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
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
                        icon: Icon(
                          Icons.search,
                          color: context.lumi.onPrimary,
                          size: 16,
                        ),
                        label: Text(
                          context.t('Search Papers'),
                          style: context.type.bodyMedium!.copyWith(
                            color: context.lumi.onPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: context.lumi.primary,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
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
                        icon: Icon(
                          Icons.description,
                          color: context.lumi.onPrimary,
                          size: 16,
                        ),
                        label: Text(
                          context.t('Generate Report'),
                          style: context.type.bodyMedium!.copyWith(
                            color: context.lumi.onPrimary,
                            fontWeight: FontWeight.w600,
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
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () {
                      Navigator.pop(context);
                      onExplainTopic(topic.topic);
                    },
                    icon: const Icon(Icons.summarize_outlined, size: 16),
                    label: Text(
                      context.t('Explain Trend with AI'),
                      style: context.type.bodyMedium!.copyWith(
                        fontWeight: FontWeight.w600,
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

  Widget _buildMetricCell(
    BuildContext context,
    String label,
    String value,
    Color color,
  ) {
    return Column(
      children: [
        Text(
          label,
          style: AppTypography.metrics.bodySmall!.copyWith(
            color: context.lumi.muted,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: AppTypography.metrics.bodyMedium!.copyWith(
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final cardBg = context.lumi.surface;
    final borderColor = context.lumi.line;

    // The banner names the first topic, in the API's ranking, that really
    // grows. With no growing topic there is no "rising" claim to make.
    final strongestTopic = strongestRisingTopic(overview.topics);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Strongest Topic Insight Banner
        if (strongestTopic != null) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.lumi.primarySoft,
              border: Border.all(
                color: context.lumi.primary.withValues(alpha: 0.3),
              ),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.trending_up,
                  color: context.lumi.primary,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    context.t('"{{topic}}" is the strongest rising topic in this dataset scope with growth rate of {{percent}}%.', {'topic': strongestTopic.topic, 'percent': formatSigned(strongestTopic.growthRatePct)}),
                    style: context.type.bodyMedium!.copyWith(
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
          Row(
            children: [
              Icon(Icons.tag, color: context.lumi.primary, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  context.t('Emerging Keywords'),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
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
                  label: Text('${kw.keyword} (${formatSigned(kw.growthRatePct, 0)}%)'),
                  onPressed: () => unawaited(
                    context.push(
                      '/search?q=${Uri.encodeComponent(kw.keyword)}',
                    ),
                  ),
                  backgroundColor: cardBg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: BorderSide(color: borderColor),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 24),
        ],

        // Ranked Topics Title
        Row(
          children: [
            Icon(Icons.trending_up, color: context.lumi.primary, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                context.t('Rising Topics Signals'),
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        if (overview.topics.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Text(
                context.t('No signals found. Change scope to load topics.'),
                style: TextStyle(
                  fontStyle: FontStyle.italic,
                  color: context.lumi.muted,
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

              return Card(
                elevation: 0,
                margin: EdgeInsets.zero,
                color: cardBg,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(color: borderColor),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
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
                                  style: Theme.of(context).textTheme.titleMedium,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  topic.taxonomy?.fieldName ?? context.t('Unknown field'),
                                  style: context.type.bodySmall!.copyWith(
                                    color: context.lumi.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Tooltip(
                            message: context.t(
                              'How much to trust this signal, from the number of papers behind it',
                            ),
                            child: LumiChip(
                              label: context.t(reliability),
                              tone: reliabilityTone(reliability),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      // Wraps instead of overflowing on a narrow phone.
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          Text(
                            context.plural(
                              topic.totalPapers,
                              one: '{{count}} publication',
                              other: '{{count}} publications',
                              args: {'count': formatNumber(topic.totalPapers)},
                            ),
                            style: context.type.bodySmall!.copyWith(
                              color: context.lumi.foregroundSecondary,
                            ),
                          ),
                          Text(
                            context.t('Growth: {{percent}}%', {
                              'percent': formatSigned(topic.growthRatePct),
                            }),
                            style: context.type.bodySmall!.copyWith(
                              fontWeight: FontWeight.w600,
                              color: topic.growthRatePct > 0
                                  ? context.lumi.success
                                  : topic.growthRatePct < 0
                                      ? context.lumi.error
                                      : context.lumi.foregroundSecondary,
                            ),
                          ),
                          Text(
                            context.t('Momentum: {{momentum}}', {
                              'momentum': topic.momentum.toStringAsFixed(1),
                            }),
                            style: context.type.bodySmall!.copyWith(
                              color: context.lumi.foregroundSecondary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Divider(height: 1, color: context.lumi.line),
                      // Labelled actions: an icon alone does not say what
                      // "explain" or "search" will do.
                      Wrap(
                        spacing: 4,
                        children: [
                          TextButton.icon(
                            onPressed: () => unawaited(
                              context.push(
                                '/search?q=${Uri.encodeComponent(topic.topic)}',
                              ),
                            ),
                            icon: const Icon(Icons.search, size: 18),
                            label: Text(context.t('Papers')),
                          ),
                          TextButton.icon(
                            onPressed: () => onExplainTopic(topic.topic),
                            icon: const Icon(Icons.summarize_outlined, size: 18),
                            label: Text(context.t('Explain')),
                          ),
                          TextButton.icon(
                            onPressed: () =>
                                _showTopicDetailSheet(context, topic),
                            icon: const Icon(Icons.show_chart, size: 18),
                            label: Text(context.t('Trend graph')),
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

/// First topic, in the order the API ranked them, whose growth is above
/// zero. Null when none grows.
TrendingTopic? strongestRisingTopic(List<TrendingTopic> topics) {
  for (final topic in topics) {
    if (topic.growthRatePct > 0) return topic;
  }
  return null;
}

LumiChipTone reliabilityTone(String label) => switch (label) {
      'High' => LumiChipTone.success,
      'Exploratory' => LumiChipTone.primary,
      _ => LumiChipTone.warning,
    };
