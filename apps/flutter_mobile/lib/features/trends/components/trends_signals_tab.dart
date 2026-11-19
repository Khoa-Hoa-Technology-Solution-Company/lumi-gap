import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_data.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/trends/components/trend_topic_sheet.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:go_router/go_router.dart';

/// Signals: the clearest rising topic first, then the emerging keywords,
/// then every topic in trend order. A row opens the topic sheet, which holds
/// its actions (papers, report, explain).
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

  void _open(BuildContext context, TrendingTopic topic) => unawaited(
        showTrendTopicSheet(context, topic: topic, onExplain: onExplainTopic),
      );

  @override
  Widget build(BuildContext context) {
    // Same rules as the web: the order and the "rising" claim come from the
    // API's verdict only, never from raw-count growth.
    final topics = sortTopicsByTrend(overview.topics);
    final strongest = topRisingTopic(topics);
    final allInsufficient = topics.isNotEmpty &&
        topics.every(
          (t) => t.classification.verdict == TrendVerdict.insufficient,
        );

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 20, 0, 32),
      children: [
        if (strongest != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: _StrongestTopic(
              topic: strongest,
              onOpen: () => _open(context, strongest),
            ),
          ),
        if (overview.risingKeywords.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: LumiSectionHeader(title: context.t('Emerging Keywords')),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                for (final kw in overview.risingKeywords) ...[
                  _KeywordChip(
                    keyword: kw.keyword,
                    change: '${formatSigned(kw.growthRatePct, 0)}%',
                    onTap: () => unawaited(
                      context.push(
                        '/search?q=${Uri.encodeComponent(kw.keyword)}',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LumiSectionHeader(
                title: context.t('Rising Topics Signals'),
                caption: allInsufficient
                    ? context.t(
                        'Not enough yearly data yet to tell whether these topics are rising or falling.',
                      )
                    : null,
              ),
              if (topics.isEmpty)
                LumiEmptyState(
                  icon: Icons.show_chart,
                  message: context.t(
                    'No signals found. Change scope to load topics.',
                  ),
                  compact: true,
                )
              else
                LumiRowGroup(
                  children: [
                    for (var i = 0; i < topics.length; i++)
                      _TopicRow(
                        rank: i + 1,
                        topic: topics[i],
                        showVerdict: !allInsufficient,
                        onTap: () => _open(context, topics[i]),
                      ),
                  ],
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The featured topic: its name, its % per year as the figure of the
/// screen, its real yearly line, and how sure the API is.
class _StrongestTopic extends StatelessWidget {
  const _StrongestTopic({required this.topic, required this.onOpen});

  final TrendingTopic topic;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final c = topic.classification;
    final pct = c.shownChangePct;
    final values = [for (final y in topic.yearlyBreakdown) y.count.toDouble()];
    final facts = [
      context.plural(
        topic.totalPapers,
        one: '{{count}} paper',
        other: '{{count}} papers',
        args: {'count': formatNumber(topic.totalPapers)},
      ),
      if (c.confidence != null)
        context.t(
          c.confidence == TrendConfidence.high
              ? 'High confidence'
              : 'Medium confidence',
        ),
    ].join(' · ');

    return LumiCard(
      onTap: onOpen,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Fastest rising topic'),
            style: theme.textTheme.titleSmall
                ?.copyWith(color: lumi.foregroundSecondary),
          ),
          const SizedBox(height: 4),
          Text(topic.topic, style: theme.textTheme.titleLarge),
          if (pct != null) ...[
            const SizedBox(height: 8),
            LumiHeroMetric(
              value: pct > 0
                  ? '+${pct.toStringAsFixed(1)}%'
                  : '${pct.toStringAsFixed(1)}%',
              unit: context.t('per year'),
              valueColor: lumi.success,
            ),
          ],
          if (LumiSparkline.canDraw(values)) ...[
            const SizedBox(height: 12),
            LumiSparkline(
              values: values,
              color: lumi.success,
              width: null,
              height: 72,
              fill: true,
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  facts,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ),
              Text(
                context.t('Details'),
                style: theme.textTheme.labelLarge?.copyWith(color: lumi.primary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _KeywordChip extends StatelessWidget {
  const _KeywordChip({
    required this.keyword,
    required this.change,
    required this.onTap,
  });

  final String keyword;
  final String change;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Material(
      color: lumi.surface,
      shape: StadiumBorder(side: BorderSide(color: lumi.line)),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(keyword, style: theme.textTheme.bodyMedium),
                const SizedBox(width: 6),
                Text(
                  change,
                  style: theme.textTheme.labelLarge
                      ?.copyWith(color: lumi.foreground),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One topic: rank, name, field and papers; on the right its % per year,
/// or its verdict when it has no figure.
class _TopicRow extends StatelessWidget {
  const _TopicRow({
    required this.rank,
    required this.topic,
    required this.showVerdict,
    required this.onTap,
  });

  final int rank;
  final TrendingTopic topic;
  final bool showVerdict;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final c = topic.classification;
    final pct = c.shownChangePct;
    final style = trendVerdictStyle(c.verdict, lumi);
    final sub = [
      if (topic.taxonomy?.fieldName != null) topic.taxonomy!.fieldName!,
      context.plural(
        topic.totalPapers,
        one: '{{count}} paper',
        other: '{{count}} papers',
        args: {'count': formatNumber(topic.totalPapers)},
      ),
    ].join(' · ');

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 12, 14),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: lumi.surfaceMuted,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '$rank',
                style: theme.textTheme.labelLarge
                    ?.copyWith(color: lumi.foregroundSecondary),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    topic.topic,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: lumi.foregroundSecondary),
                  ),
                  if (showVerdict && pct == null) ...[
                    const SizedBox(height: 6),
                    TrendVerdictPill(verdict: c.verdict),
                  ],
                ],
              ),
            ),
            if (showVerdict && pct != null) ...[
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(style.icon, size: 16, color: style.color),
                      const SizedBox(width: 2),
                      Text(
                        pct > 0
                            ? '+${pct.toStringAsFixed(1)}%'
                            : '${pct.toStringAsFixed(1)}%',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                  Text(
                    context.t(style.text),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: lumi.foregroundSecondary),
                  ),
                ],
              ),
            ],
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, size: 20, color: lumi.muted),
          ],
        ),
      ),
    );
  }
}
