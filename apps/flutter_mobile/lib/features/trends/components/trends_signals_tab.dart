import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict_label.dart';
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
                  context.t('Scope: {{field}}', {
                    'field':
                        topic.taxonomy?.fieldName ?? context.t('Unknown field'),
                  }),
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                const Divider(height: 24),

                // Mini Line Chart
                Text(
                  context.t('Publication Timeline Trend'),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
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

                // The conclusion: verdict, what it means, change of the share
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    TrendVerdictLabel(verdict: topic.verdict),
                    if (topic.crossTopic?.clear ?? false)
                      const TrendClearPill(),
                    if (topic.taxonomy?.isApplication ?? false)
                      const TrendApplicationPill(),
                    if (topic.crossTopic != null)
                      Text(
                        context.t(
                          trendSizeBandLabel(topic.crossTopic!.sizeBand),
                        ),
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xFF94A3B8),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  context.t(trendVerdictMeaning(topic.verdict)),
                  style: const TextStyle(fontSize: 12, height: 1.4),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _buildMetricCell(
                      context.t('Relative change per year'),
                      trendChangeText(context, topic.classification) ?? '—',
                      trendVerdictStyle(topic.verdict, context.lumi).color,
                    ),
                    _buildMetricCell(
                      context.t('Complete years used'),
                      '${topic.classification?.yearsUsed ?? 0}',
                      const Color(0xFF06B6D4),
                    ),
                    _buildMetricCell(
                      context.t('Publications'),
                      formatNumber(topic.totalPapers),
                      const Color(0xFFA78BFA),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  context.t(
                    "The chart shows papers per year; the verdict is tested on the topic's share of all papers in the Information Technology scope.",
                  ),
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF94A3B8),
                    fontStyle: FontStyle.italic,
                  ),
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
                        label: Text(
                          context.t('Search Papers'),
                          style: const TextStyle(
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
                        label: Text(
                          context.t('Generate Report'),
                          style: const TextStyle(
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
                    label: Text(
                      context.t('Explain Trend with AI'),
                      style: const TextStyle(
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
          textAlign: TextAlign.center,
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

  /// How many tested topics of the scope got each verdict.
  Widget _buildVerdictCounts(BuildContext context) {
    final lumi = context.lumi;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          overview.testedTopicCount > 0
              ? context.t('Trend verdicts among the {{count}} topics tested', {
                  'count': formatNumber(overview.testedTopicCount),
                })
              : context.t('Trend verdicts in this scope'),
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 12,
          runSpacing: 6,
          children: [
            for (final v in TrendVerdict.values)
              if ((overview.verdictCounts[v] ?? 0) > 0)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      trendVerdictStyle(v, lumi).icon,
                      size: 14,
                      color: trendVerdictStyle(v, lumi).color,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${context.t(trendVerdictStyle(v, lumi).text)} ${formatNumber(overview.verdictCounts[v]!)}',
                      style: TextStyle(
                        fontSize: 11,
                        color: trendVerdictStyle(v, lumi).color,
                      ),
                    ),
                  ],
                ),
          ],
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

    // The banner names the listed topic with the largest significant rise of its share.
    final rising =
        overview.topics.where((t) => t.verdict == TrendVerdict.rising).toList()
          ..sort(
            (a, b) => (b.classification?.relativeChangePct ?? 0).compareTo(
              a.classification?.relativeChangePct ?? 0,
            ),
          );
    final strongestTopic = rising.isNotEmpty ? rising.first : null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Strongest Topic Insight Banner
        ...[
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
                    strongestTopic == null
                        ? context.t(
                            'No topic shows a statistically significant rise in its share of publications in this scope.',
                          )
                        : context.t(
                            '{{topic}} has the largest significant rise in its share of publications in this dataset ({{change}}).',
                            {
                              'topic': strongestTopic.topic,
                              'change':
                                  trendChangeText(
                                    context,
                                    strongestTopic.classification,
                                  ) ??
                                  '',
                            },
                          ),
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
          const SizedBox(height: 12),
          if (overview.verdictCounts.isNotEmpty) _buildVerdictCounts(context),
          const SizedBox(height: 20),
        ],

        // Rising Keywords Title & Chips
        if (overview.risingKeywords.isNotEmpty) ...[
          Row(
            children: [
              const Icon(Icons.tag, color: Color(0xFF8B5CF6), size: 18),
              const SizedBox(width: 8),
              Text(
                context.t('Emerging Keywords'),
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
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
                  avatar: kw.significant
                      ? const Icon(
                          Icons.bolt,
                          size: 14,
                          color: Color(0xFF10B981),
                        )
                      : null,
                  tooltip: context.t(
                    'Test statistic of the keyword shift: larger means stronger evidence of a rise.',
                  ),
                  label: Text(
                    // i18n-ignore: keyword and its z statistic
                    '${kw.keyword} · z ${kw.z.toStringAsFixed(1)}',
                  ),
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
        Row(
          children: [
            const Icon(Icons.trending_up, color: Color(0xFF06B6D4), size: 18),
            const SizedBox(width: 8),
            Text(
              context.t('Rising Topics Signals'),
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
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
                style: const TextStyle(
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
              final change = trendChangeText(context, topic.classification);
              final verdictColor = trendVerdictStyle(
                topic.verdict,
                context.lumi,
              ).color;

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
                                  topic.taxonomy?.fieldName ??
                                      context.t('Unknown field'),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Color(0xFF94A3B8),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 130),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                TrendVerdictLabel(verdict: topic.verdict),
                                if (topic.crossTopic?.clear ?? false) ...[
                                  const SizedBox(height: 4),
                                  const TrendClearPill(),
                                ],
                                if (topic.taxonomy?.isApplication ?? false) ...[
                                  const SizedBox(height: 4),
                                  const TrendApplicationPill(),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            context.plural(
                              topic.totalPapers,
                              one: '{{count}} publication',
                              other: '{{count}} publications',
                            ),
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                          if (change != null)
                            Text(
                              change,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: verdictColor,
                              ),
                            ),
                          if (topic.classification?.confidence != null)
                            Text(
                              topic.classification!.confidence == 'high'
                                  ? context.t('High confidence')
                                  : context.t('Medium confidence'),
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
                            tooltip: context.t('Search papers'),
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
                            tooltip: context.t('Explain trend'),
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
                            label: Text(
                              context.t('View Trend Graph'),
                              style: const TextStyle(
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
