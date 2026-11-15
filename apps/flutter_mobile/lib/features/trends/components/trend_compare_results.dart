import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';

/// What the comparison chart plots per year.
enum CompareMetric { papers, citations, avgCitations }

/// The compared topics as lines (one colour each, named in the legend) and
/// one card per topic with its verdict.
class TrendCompareResults extends StatefulWidget {
  const TrendCompareResults({
    required this.result,
    required this.classificationOf,
    required this.onSearch,
    required this.onExplain,
    super.key,
  });

  final TrendCompareResponse result;

  /// The verdict of a topic from the overview list, by name; null when the
  /// topic is not in it. The compare API itself sends no verdict, as on the
  /// web, so none is assumed.
  final TrendClassification? Function(String topic) classificationOf;
  final ValueChanged<String> onSearch;
  final ValueChanged<String> onExplain;

  @override
  State<TrendCompareResults> createState() => _TrendCompareResultsState();
}

class _TrendCompareResultsState extends State<TrendCompareResults> {
  CompareMetric _metric = CompareMetric.papers;

  /// Years with data in any topic, or the range the API reports.
  (int, int)? _years() {
    final res = widget.result;
    final all = [
      for (final t in res.topics) ...t.yearlyBreakdown.map((y) => y.year),
    ];
    final from = res.yearFrom ?? (all.isEmpty ? null : all.reduce((a, b) => a < b ? a : b));
    final to = res.yearTo ?? (all.isEmpty ? null : all.reduce((a, b) => a > b ? a : b));
    if (from == null || to == null || to <= from) return null;
    return (from, to);
  }

  double _value(TopicComparisonItem t, int year) {
    switch (_metric) {
      case CompareMetric.papers:
        for (final y in t.yearlyBreakdown) {
          if (y.year == year) return y.count.toDouble();
        }
        return 0;
      case CompareMetric.citations:
      case CompareMetric.avgCitations:
        for (final c in t.citationTrend) {
          if (c.year == year) {
            return _metric == CompareMetric.citations
                ? c.totalCitations.toDouble()
                : c.avgCitations;
          }
        }
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final topics = widget.result.topics;
    if (topics.isEmpty) return const SizedBox.shrink();
    final years = _years();

    final explanation = switch (_metric) {
      CompareMetric.papers => context.t(
          'What this shows: Shows how many papers were published each year. Use this to compare research activity.',
        ),
      CompareMetric.citations => context.t(
          'What this shows: Shows accumulated citation volume. Older topics may look stronger because they had more time to collect citations.',
        ),
      CompareMetric.avgCitations => context.t(
          'What this shows: Normalizes citation impact per paper. Useful when one topic has much larger volume.',
        ),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Raw counts per year: the verdicts below are the trends.
        Text(
          context.t('Publications and citations per year'),
          style: theme.textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<CompareMetric>(
          isExpanded: true,
          initialValue: _metric,
          items: [
            DropdownMenuItem(
              value: CompareMetric.papers,
              child: Text(context.t('Papers / year')),
            ),
            DropdownMenuItem(
              value: CompareMetric.citations,
              child: Text(context.t('Total Citations')),
            ),
            DropdownMenuItem(
              value: CompareMetric.avgCitations,
              child: Text(context.t('Avg Citations')),
            ),
          ],
          onChanged: (v) {
            if (v != null) setState(() => _metric = v);
          },
        ),
        const SizedBox(height: 8),
        Text(
          explanation,
          style:
              theme.textTheme.bodySmall?.copyWith(color: lumi.foregroundSecondary),
        ),
        const SizedBox(height: 12),
        if (years == null)
          Text(
            context.t('Not enough yearly data to draw a line.'),
            style: theme.textTheme.bodySmall
                ?.copyWith(color: lumi.foregroundSecondary),
          )
        else
          SizedBox(
            height: 180,
            child: LineChart(
              LineChartData(
                minX: years.$1.toDouble(),
                maxX: years.$2.toDouble(),
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  rightTitles: const AxisTitles(),
                  topTitles: const AxisTitles(),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 36,
                      getTitlesWidget: (v, _) => Text(
                        formatCompact(v),
                        style: theme.textTheme.labelSmall,
                      ),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      // One label per year: without an interval fl_chart
                      // also labels the half-years.
                      interval: years.$2 - years.$1 > 6 ? 2 : 1,
                      reservedSize: 28,
                      getTitlesWidget: (v, meta) => v == v.roundToDouble()
                          ? SideTitleWidget(
                              meta: meta,
                              child: Text(
                                '${v.toInt()}',
                                style: theme.textTheme.labelSmall,
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                  ),
                ),
                lineBarsData: [
                  for (var i = 0; i < topics.length; i++)
                    LineChartBarData(
                      spots: [
                        for (var y = years.$1; y <= years.$2; y++)
                          FlSpot(y.toDouble(), _value(topics[i], y)),
                      ],
                      isCurved: true,
                      preventCurveOverShooting: true,
                      color: LumiChart.seriesAt(i),
                      barWidth: 3,
                    ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 8),
        // The legend: a colour is never the only way to tell lines apart.
        Wrap(
          spacing: 12,
          runSpacing: 4,
          children: [
            for (var i = 0; i < topics.length; i++)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 12,
                    height: 3,
                    color: LumiChart.seriesAt(i),
                  ),
                  const SizedBox(width: 6),
                  Text(topics[i].topic, style: theme.textTheme.labelMedium),
                ],
              ),
          ],
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < topics.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _TopicCard(
              topic: topics[i],
              classification: widget.classificationOf(topics[i].topic),
              color: LumiChart.seriesAt(i),
              onSearch: () => widget.onSearch(topics[i].topic),
              onExplain: () => widget.onExplain(topics[i].topic),
            ),
          ),
      ],
    );
  }
}

class _TopicCard extends StatelessWidget {
  const _TopicCard({
    required this.topic,
    required this.classification,
    required this.color,
    required this.onSearch,
    required this.onExplain,
  });

  final TopicComparisonItem topic;
  final TrendClassification? classification;
  final Color color;
  final VoidCallback onSearch;
  final VoidCallback onExplain;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;

    Widget figure(String label, Widget value) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.labelMedium
                    ?.copyWith(color: lumi.foregroundSecondary),
              ),
              const SizedBox(height: 2),
              value,
            ],
          ),
        );

    return LumiCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(topic.topic, style: theme.textTheme.titleSmall),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              figure(
                context.t('Total Papers'),
                Text(
                  formatNumber(topic.totalPapers),
                  style: theme.textTheme.titleSmall,
                ),
              ),
              if (classification != null) ...[
                figure(
                  context.t('Trend'),
                  TrendVerdictLabel(
                    verdict: classification!.verdict,
                    confidence: classification!.confidence,
                  ),
                ),
                figure(
                  context.t('Change'),
                  Text(
                    trendChangeText(context, classification!) ?? '—',
                    style: theme.textTheme.titleSmall,
                  ),
                ),
              ],
            ],
          ),
          if (classification == null) ...[
            const SizedBox(height: 8),
            Text(
              context.t('No verdict: this topic is not in the overview list'),
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: lumi.foregroundSecondary),
            ),
          ],
          const SizedBox(height: 4),
          Wrap(
            alignment: WrapAlignment.end,
            children: [
              TextButton.icon(
                onPressed: onSearch,
                icon: const Icon(Icons.search, size: 18),
                label: Text(context.t('Search Papers')),
              ),
              TextButton.icon(
                onPressed: onExplain,
                icon: const Icon(Icons.summarize_outlined, size: 18),
                label: Text(context.t('AI Explain')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
