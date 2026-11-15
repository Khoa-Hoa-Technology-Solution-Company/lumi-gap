import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/features/trends/components/trend_topic_sheet.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
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

  @override
  Widget build(BuildContext context) {
    final cardBg = context.lumi.surface;
    final borderColor = context.lumi.line;

    // Same rules as the web: the order and the "rising" claim come from the
    // API's verdict only, never from raw-count growth.
    final topics = sortTopicsByTrend(overview.topics);
    final strongestTopic = topRisingTopic(topics);
    final strongestChange = strongestTopic == null
        ? null
        : trendChangeText(context, strongestTopic.classification);
    final allInsufficient =
        topics.isNotEmpty &&
        topics.every(
          (t) => t.classification.verdict == TrendVerdict.insufficient,
        );

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
                    strongestChange == null
                        ? context.t(
                            '"{{topic}}" is the clearest rising topic in this scope.',
                            {'topic': strongestTopic.topic},
                          )
                        : context.t(
                            '"{{topic}}" is the clearest rising topic in this scope: {{change}}.',
                            {
                              'topic': strongestTopic.topic,
                              'change': strongestChange,
                            },
                          ),
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
                  label: Text(
                    '${kw.keyword} (${formatSigned(kw.growthRatePct, 0)}%)',
                  ),
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

        if (allInsufficient) ...[
          Text(
            context.t(
              'Not enough yearly data yet to tell whether these topics are rising or falling.',
            ),
            style: context.type.bodySmall!.copyWith(
              color: context.lumi.foregroundSecondary,
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (topics.isEmpty)
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
            itemCount: topics.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, idx) {
              final topic = topics[idx];
              final change = trendChangeText(context, topic.classification);

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
                                  style: Theme.of(
                                    context,
                                  ).textTheme.titleMedium,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  topic.taxonomy?.fieldName ??
                                      context.t('Unknown field'),
                                  style: context.type.bodySmall!.copyWith(
                                    color: context.lumi.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      // Said once above the list when no topic has one.
                      if (!allInsufficient) ...[
                        const SizedBox(height: 8),
                        TrendVerdictLabel(
                          verdict: topic.classification.verdict,
                          confidence: topic.classification.confidence,
                        ),
                      ],
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
                          if (change != null)
                            Text(
                              change,
                              style: context.type.bodySmall!.copyWith(
                                fontWeight: FontWeight.w600,
                                color: context.lumi.foreground,
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
                            icon: const Icon(
                              Icons.summarize_outlined,
                              size: 18,
                            ),
                            label: Text(context.t('Explain')),
                          ),
                          TextButton.icon(
                            onPressed: () => unawaited(
                              showTrendTopicSheet(
                                context,
                                topic: topic,
                                onExplain: onExplainTopic,
                              ),
                            ),
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
