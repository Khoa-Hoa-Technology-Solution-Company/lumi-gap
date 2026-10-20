import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_strings.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Deterministic trend context + "Read next" list. Loads on page open (no LLM, no button).
/// Stays silent on error or when the backend has nothing to show.
class QualityReadingContextCard extends ConsumerWidget {
  const QualityReadingContextCard({required this.paperId, this.topic, this.query, this.onOpenPaper, super.key});

  final String paperId;
  final String? topic;
  final String? query;
  final void Function(String paperId)? onOpenPaper;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(qualityStringsProvider);
    final ctx = ref.watch(readingContextProvider(ReadingContextQuery(paperId, topic: topic, query: query)));
    return ctx.when(
      loading: () => const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
      error: (_, _) => const SizedBox.shrink(),
      data: (data) {
        if (data.trend == null && data.related.isEmpty) return const SizedBox.shrink();
        final trend = data.trend;
        final scheme = Theme.of(context).colorScheme;
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (trend != null) ...[
                  Text(s.trendContext, style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text(trend.topic, style: TextStyle(color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 8),
                  QualityTrendSparkline(trend: trend),
                  if (trend.paperYear != null)
                    Text('${s.thisPaper}: ${trend.paperYear}', style: TextStyle(fontSize: 12, color: scheme.tertiary)),
                  if (trend.partialYear != null)
                    Text('${trend.partialYear} ${s.partialYearNote}', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _Stat(label: s.totalPapers, value: '${trend.totalPapers}'),
                      if (trend.growthRatePct != null) _Stat(label: s.growth, value: _pct(trend.growthRatePct!)),
                      if (trend.cagr3yPct != null) _Stat(label: s.cagr3y, value: _pct(trend.cagr3yPct!)),
                      if (trend.momentum != null) _Stat(label: s.momentum, value: trend.momentum!.toStringAsFixed(2)),
                    ],
                  ),
                ],
                if (data.related.isNotEmpty) ...[
                  QualitySectionTitle(s.readNext),
                  for (final r in data.related)
                    InkWell(
                      onTap: () => onOpenPaper != null ? onOpenPaper!(r.id) : context.push('/paper/${r.id}'),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 56),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(r.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    Text(
                                      [
                                        s.relatedReason(r.reason),
                                        if (r.year != null) '${r.year}',
                                        if (r.sharedTopics.isNotEmpty) r.sharedTopics.take(2).join(', '),
                                      ].join(' · '),
                                      style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(Icons.chevron_right, size: 20),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  static String _pct(double v) => '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
