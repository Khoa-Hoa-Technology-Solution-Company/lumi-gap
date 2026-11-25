import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/app_alert.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_data.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Emerging keyword signals (GET /trends/emerging): keywords that are new and
/// growing fast inside the IT scope. Kept apart from the topic verdicts on
/// purpose: it is an early signal on keywords, not a forecast.
class TrendsEmergingTab extends ConsumerWidget {
  const TrendsEmergingTab({required this.params, super.key});

  final TrendsOverviewParams params;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(trendEmergingProvider(params.scopeFilters));
    return query.when(
      data: (data) => _EmergingList(data: data),
      // A list of keyword cards is loading: skeleton cards in that shape.
      loading: () => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            context.t(
              'Looking for emerging keywords. The first time can take about 15 seconds.',
            ),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: context.lumi.foregroundSecondary,
            ),
          ),
          const SizedBox(height: 12),
          const LumiSkeleton(rows: 4, height: 96),
        ],
      ),
      // A readable reason and a retry, never the raw exception.
      error: (error, _) => LumiErrorState(
        message: context.t(failureMessageKey(error)),
        retrying: query.isLoading,
        onRetry: () => ref.invalidate(trendEmergingProvider(params.scopeFilters)),
      ),
    );
  }
}

class _EmergingList extends StatelessWidget {
  const _EmergingList({required this.data});

  final TrendEmergingResponse data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final e = data.earlierPeriod;
    final r = data.recentPeriod;
    final note = theme.textTheme.bodySmall?.copyWith(
      color: lumi.foregroundSecondary,
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AppAlert(
          tone: AppAlertTone.warning,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.t('Early signal, not a forecast'),
                style: theme.textTheme.titleSmall,
              ),
              const SizedBox(height: 4),
              Text(
                context.t(
                  'These are keywords, not topics, and they are separate from the topic verdicts. Nothing says a keyword will keep growing.',
                ),
                style: theme.textTheme.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text(
          context.t(
            'A keyword is a signal when it has at least {{min}} papers in {{rFrom}}–{{rTo}}, at least {{novelty}}% of its papers since {{eFrom}} fall in those years, and its share of papers rose significantly compared with {{eFrom}}–{{eTo}}.',
            {
              'min': data.minRecentPapers,
              'rFrom': r.yearFrom,
              'rTo': r.yearTo,
              'novelty': (data.noveltyShare * 100).round(),
              'eFrom': e.yearFrom,
              'eTo': e.yearTo,
            },
          ),
          style: note,
        ),
        const SizedBox(height: 6),
        Text(
          context.t('{{found}} signals among {{tested}} keywords tested', {
            'found': data.matchedCount,
            'tested': data.termsTested,
          }),
          style: theme.textTheme.labelLarge?.copyWith(
            color: lumi.foregroundSecondary,
          ),
        ),
        const SizedBox(height: 16),
        if (data.dataSource == 'local')
          LumiEmptyState(
            icon: Icons.cloud_off_outlined,
            compact: true,
            message: context.t(
              'Emerging signals need OpenAlex keyword counts; the local corpus cannot compute them.',
            ),
          )
        else if (data.keywords.isEmpty)
          LumiEmptyState(
            icon: Icons.search_off,
            compact: true,
            message: context.t(
              'No keyword meets every criterion in this scope.',
            ),
          )
        else
          for (final keyword in data.keywords) ...[
            _EmergingCard(
              keyword: keyword,
              lastCompleteYear: data.lastCompleteYear,
            ),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _EmergingCard extends StatelessWidget {
  const _EmergingCard({required this.keyword, required this.lastCompleteYear});

  final EmergingKeyword keyword;
  final int? lastCompleteYear;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    // The running year is still accumulating: the sparkline stops at the last
    // complete year.
    final complete = keyword.yearlyBreakdown
        .where((y) => lastCompleteYear == null || y.year <= lastCompleteYear!)
        .toList();
    final values = [for (final y in complete) y.count.toDouble()];
    return LumiCard(
      padding: const EdgeInsets.all(14),
      onTap: () => unawaited(
        context.push('/search?q=${Uri.encodeComponent(keyword.keyword)}'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  keyword.keyword,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              const SizedBox(width: 8),
              if (LumiSparkline.canDraw(values))
                LumiSparkline(values: values, color: lumi.success),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: [
              _Figure(
                label: context.t('Papers before → recent'),
                value:
                    '${formatNumber(keyword.earlierPapers)} → ${formatNumber(keyword.recentPapers)}',
              ),
              _Figure(
                label: context.t('Novelty'),
                value: '${(keyword.noveltyShare * 100).toStringAsFixed(0)}%',
              ),
              _Figure(
                label: context.t('Log odds ratio'),
                value: keyword.logOddsRatio.toStringAsFixed(2),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: type.labelSmall?.copyWith(color: context.lumi.muted),
        ),
        Text(value, style: type.labelLarge),
      ],
    );
  }
}
