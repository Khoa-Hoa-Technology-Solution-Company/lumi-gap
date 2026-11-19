import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_trend_list.dart';
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
      loading: () => AppLoading(
        message: context.t(
          'Looking for emerging keywords. The first time can take about 15 seconds.',
        ),
      ),
      error: (error, _) => AppErrorState(message: error.toString()),
    );
  }
}

class _EmergingList extends StatelessWidget {
  const _EmergingList({required this.data});

  final TrendEmergingResponse data;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final e = data.earlierPeriod;
    final r = data.recentPeriod;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: lumi.warning.withValues(alpha: 0.1),
            border: Border.all(color: lumi.warning.withValues(alpha: 0.4)),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, color: lumi.warning, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.t('Early signal, not a forecast'),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      context.t(
                        'These are keywords, not topics, and they are separate from the topic verdicts. Nothing says a keyword will keep growing.',
                      ),
                      style: const TextStyle(fontSize: 12, height: 1.4),
                    ),
                  ],
                ),
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
          style: TextStyle(
            fontSize: 12,
            height: 1.4,
            color: lumi.foregroundSecondary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          context.t('{{found}} signals among {{tested}} keywords tested', {
            'found': data.matchedCount,
            'tested': data.termsTested,
          }),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: lumi.foregroundSecondary,
          ),
        ),
        const SizedBox(height: 16),
        if (data.dataSource == 'local')
          _Empty(
            text: context.t(
              'Emerging signals need OpenAlex keyword counts; the local corpus cannot compute them.',
            ),
          )
        else if (data.keywords.isEmpty)
          _Empty(
            text: context.t('No keyword meets every criterion in this scope.'),
          )
        else
          for (final keyword in data.keywords) ...[
            _EmergingCard(
              keyword: keyword,
              recentFrom: r.yearFrom,
              lastCompleteYear: data.lastCompleteYear,
            ),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 24),
    child: Text(
      text,
      textAlign: TextAlign.center,
      style: TextStyle(fontStyle: FontStyle.italic, color: context.lumi.muted),
    ),
  );
}

class _EmergingCard extends StatelessWidget {
  const _EmergingCard({
    required this.keyword,
    required this.recentFrom,
    required this.lastCompleteYear,
  });

  final EmergingKeyword keyword;
  final int recentFrom;
  final int? lastCompleteYear;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    // The running year is still accumulating: the sparkline stops at the last complete year.
    final complete = keyword.yearlyBreakdown
        .where((y) => lastCompleteYear == null || y.year <= lastCompleteYear!)
        .toList();
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: lumi.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: lumi.line),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => unawaited(
          context.push('/search?q=${Uri.encodeComponent(keyword.keyword)}'),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      keyword.keyword,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  HomeSparkline(points: complete),
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
                    value:
                        '${(keyword.noveltyShare * 100).toStringAsFixed(0)}%',
                  ),
                  _Figure(
                    label: context.t('Log odds ratio'),
                    value: keyword.logOddsRatio.toStringAsFixed(2),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: TextStyle(fontSize: 10, color: context.lumi.muted)),
      Text(
        value,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
      ),
    ],
  );
}
