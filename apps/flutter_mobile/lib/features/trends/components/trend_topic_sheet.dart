import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:go_router/go_router.dart';

/// One topic: its verdict, papers per year, and what to do with it.
///
/// The router is taken before the sheet opens: actions close the sheet
/// first, and its own context is gone by the time they navigate.
Future<void> showTrendTopicSheet(
  BuildContext context, {
  required TrendingTopic topic,
  required ValueChanged<String> onExplain,
}) {
  final router = GoRouter.of(context);
  return showModalBottomSheet<void>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) {
      void closeThen(VoidCallback action) {
        Navigator.pop(sheetContext);
        action();
      }

      final q = Uri.encodeComponent(topic.topic);
      return _TopicSheet(
        topic: topic,
        onSearch: () => closeThen(() => unawaited(router.push('/search?q=$q'))),
        onReport: () =>
            closeThen(() => unawaited(router.push('/reports?topic=$q'))),
        onExplain: () => closeThen(() => onExplain(topic.topic)),
      );
    },
  );
}

class _TopicSheet extends StatelessWidget {
  const _TopicSheet({
    required this.topic,
    required this.onSearch,
    required this.onReport,
    required this.onExplain,
  });

  final TrendingTopic topic;
  final VoidCallback onSearch;
  final VoidCallback onReport;
  final VoidCallback onExplain;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final verdict = trendVerdictStyle(topic.classification.verdict, lumi);
    final field = topic.taxonomy?.fieldName?.trim() ?? '';
    final years = topic.yearlyBreakdown;

    Widget metric(String label, String value, Color color) => Expanded(
      child: Column(
        children: [
          Text(
            label,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelMedium?.copyWith(
              color: lumi.foregroundSecondary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            textAlign: TextAlign.center,
            style: theme.textTheme.titleSmall?.copyWith(color: color),
          ),
        ],
      ),
    );

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(topic.topic, style: theme.textTheme.titleLarge),
          if (field.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              context.t('Scope: {{field}}', {'field': field}),
              style: theme.textTheme.bodySmall?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              metric(
                context.t('Trend'),
                context.t(verdict.text),
                verdict.color,
              ),
              metric(
                context.t('Change'),
                trendChangeText(context, topic.classification) ?? '—',
                lumi.foreground,
              ),
              metric(
                context.t('Publications'),
                formatNumber(topic.totalPapers),
                lumi.foreground,
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Cross-topic labels: descriptive, they never change the verdict.
          if ((topic.crossTopic != null) ||
              (topic.taxonomy?.isApplication ?? false)) ...[
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (topic.crossTopic?.clear ?? false) const TrendClearPill(),
                if (topic.taxonomy?.isApplication ?? false)
                  const TrendApplicationPill(),
                if (topic.crossTopic != null)
                  Text(
                    context.t(trendSizeBandLabel(topic.crossTopic!.sizeBand)),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: lumi.foregroundSecondary,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          Text(
            context.t(trendVerdictMeaning(topic.classification.verdict)),
            style: theme.textTheme.bodyMedium,
          ),
          if (topic.classification.yearsUsed > 0) ...[
            const SizedBox(height: 4),
            Text(
              context.t('Complete years used: {{count}}', {
                'count': topic.classification.yearsUsed,
              }),
              style: theme.textTheme.bodySmall?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            ),
          ],
          const SizedBox(height: 16),
          // Raw counts per year: descriptive, the verdict above is the trend.
          Text(
            context.t('Publications per year'),
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          if (years.length < 2)
            Text(
              context.t('Not enough yearly data to draw a line.'),
              style: theme.textTheme.bodySmall?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            )
          else
            SizedBox(
              height: 150,
              child: LineChart(
                LineChartData(
                  minX: years.first.year.toDouble(),
                  maxX: years.last.year.toDouble(),
                  gridData: FlGridData(
                    drawVerticalLine: false,
                    getDrawingHorizontalLine: (_) =>
                        FlLine(color: lumi.line, strokeWidth: 1),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    leftTitles: const AxisTitles(),
                    rightTitles: const AxisTitles(),
                    topTitles: const AxisTitles(),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        interval: years.length > 6 ? 2 : 1,
                        getTitlesWidget: (value, _) => Text(
                          '${value.toInt()}',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: lumi.foregroundSecondary,
                          ),
                        ),
                      ),
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: [
                        for (final y in years)
                          FlSpot(y.year.toDouble(), y.count.toDouble()),
                      ],
                      isCurved: true,
                      preventCurveOverShooting: true,
                      color: lumi.primary,
                      barWidth: 3,
                      belowBarData: BarAreaData(
                        show: true,
                        color: lumi.primary.withValues(alpha: 0.1),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onSearch,
                  icon: const Icon(Icons.search, size: 18),
                  label: Text(context.t('Search papers')),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: onReport,
                  icon: const Icon(Icons.description_outlined, size: 18),
                  label: Text(context.t('Generate report')),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onExplain,
              icon: const Icon(Icons.summarize_outlined, size: 18),
              label: Text(context.t('Explain trend with AI')),
            ),
          ),
        ],
      ),
    );
  }
}
