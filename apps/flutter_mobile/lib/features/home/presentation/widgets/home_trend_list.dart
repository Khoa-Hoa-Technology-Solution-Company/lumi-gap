import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_data.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_section_frame.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';

/// True when no topic has a verdict to show. The section then says so once,
/// under its title, instead of repeating "Insufficient data" on every row.
bool homeTrendsAllInsufficient(List<HomeTrendTopic> topics) =>
    topics.isNotEmpty &&
    topics.every((t) => t.verdict == TrendVerdict.insufficient);

class HomeTrendList extends StatelessWidget {
  const HomeTrendList({required this.topics, required this.onOpen, super.key});

  final List<HomeTrendTopic> topics;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    final showVerdicts = !homeTrendsAllInsufficient(topics);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: homeCardDecoration(lumi),
      child: Column(
        children: [
          for (var i = 0; i < topics.length; i++) ...[
            if (i > 0) Divider(height: 1, color: lumi.line),
            InkWell(
              onTap: onOpen,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 56),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      // The line is only drawn next to a verdict: counts from
                      // a corpus the API could not test would look like a
                      // trend the API did not conclude. A blank keeps the
                      // names aligned when other rows have a line.
                      if (showVerdicts) ...[
                        if (topics[i].verdict == TrendVerdict.insufficient ||
                            !LumiSparkline.canDraw(_values(topics[i])))
                          const SizedBox(width: 64)
                        else
                          LumiSparkline(
                            values: _values(topics[i]),
                            color: trendVerdictStyle(topics[i].verdict, lumi)
                                .color,
                            width: 64,
                            height: 24,
                          ),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              topics[i].topic,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodyLarge,
                            ),
                            // Under the name, so a long topic keeps the
                            // full row width.
                            if (showVerdicts) ...[
                              const SizedBox(height: 4),
                              TrendVerdictLabel(verdict: topics[i].verdict),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(Icons.chevron_right, size: 20, color: lumi.muted),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

List<double> _values(HomeTrendTopic t) =>
    [for (final y in t.yearlyBreakdown) y.count.toDouble()];

/// "Trending now" on Home: one card per topic, scrolling sideways. The
/// verdict, the % per year and the line all come from the API's
/// classification; a topic it could not test shows its papers only.
class HomeTrendingCards extends StatelessWidget {
  const HomeTrendingCards({
    required this.topics,
    required this.onOpen,
    super.key,
  });

  final List<HomeTrendTopic> topics;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    // With no verdict anywhere the section caption says so once; the cards
    // then carry no "Insufficient data" pill each.
    final showVerdicts = !homeTrendsAllInsufficient(topics);
    // Cards as tall as the tallest one, never clipped at large text.
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      clipBehavior: Clip.none,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < topics.length; i++) ...[
              if (i > 0) const SizedBox(width: 12),
              SizedBox(
                width: 248,
                child: _TrendCard(
                  topic: topics[i],
                  showVerdict: showVerdicts,
                  onOpen: onOpen,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TrendCard extends StatelessWidget {
  const _TrendCard({
    required this.topic,
    required this.showVerdict,
    required this.onOpen,
  });

  final HomeTrendTopic topic;
  final bool showVerdict;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final pct = topic.classification.shownChangePct;
    final values = _values(topic);
    final showLine = topic.verdict != TrendVerdict.insufficient &&
        LumiSparkline.canDraw(values);
    final papers = topic.totalPapers > 0
        ? context.plural(
            topic.totalPapers,
            one: '{{count}} paper',
            other: '{{count}} papers',
            args: {'count': formatNumber(topic.totalPapers)},
          )
        : null;
    final caption = [
      if (pct != null) context.t('per year'),
      ?papers,
    ].join(' · ');

    return Material(
      color: lumi.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: lumi.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (showVerdict) ...[
                TrendVerdictPill(verdict: topic.verdict),
                const SizedBox(height: 10),
              ],
              Text(
                topic.topic,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleMedium,
              ),
              const Spacer(),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (pct != null)
                          Text(
                            pct > 0
                                ? '+${pct.toStringAsFixed(1)}%'
                                : '${pct.toStringAsFixed(1)}%',
                            style: theme.textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                        if (caption.isNotEmpty)
                          Text(
                            caption,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: lumi.foregroundSecondary),
                          ),
                      ],
                    ),
                  ),
                  if (showLine) ...[
                    const SizedBox(width: 8),
                    LumiSparkline(
                      values: values,
                      color: trendVerdictStyle(topic.verdict, lumi).color,
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
