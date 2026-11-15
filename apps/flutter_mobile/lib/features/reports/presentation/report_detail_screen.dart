import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_panel.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ReportDetailScreen extends ConsumerWidget {
  const ReportDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(reportProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Report Detail'))),
      body: query.when(
        data: (report) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(report.topic ?? report.query, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Chip(label: Text(report.status)),
            if (report.errorMessage != null) Text(report.errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 16),
            MarkdownBody(data: report.markdown ?? context.t('No markdown yet. Keep the report worker running and refresh later.')),
            const Divider(height: 32),
            Text(context.t('Grounding papers'), style: Theme.of(context).textTheme.titleLarge),
            ...report.groundingPapers.map((paper) => ListTile(title: Text(paper.title), subtitle: Text('${paper.publicationYear}'), onTap: () => context.push('/paper/${paper.id}'))),
            const Divider(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(context.t('Identified Research Gaps'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
                GestureDetector(
                  onTap: () => context.push('/gaps?topic=${Uri.encodeComponent(report.topic ?? report.query)}'),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        context.t('View Gaps Board'),
                        style: context.type.bodySmall!.copyWith(
                          fontWeight: FontWeight.w600,
                          color: context.lumi.primary,
                        ),
                      ),
                      const SizedBox(width: 2),
                      Icon(Icons.chevron_right, size: 14, color: context.lumi.primary),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...report.researchGaps.map((gap) {
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: context.lumi.surface,
                  border: Border.all(
                    color: context.lumi.line,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.lightbulb_outline, size: 16, color: context.lumi.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            gap.title,
                            style: context.type.bodyMedium!.copyWith(
                              fontWeight: FontWeight.w600,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      gap.description,
                      style: context.type.bodySmall!.copyWith(
                        color: context.lumi.foregroundSecondary,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _ConfidenceBar(value: gap.confidence),
                  ],
                ),
              );
            }),
            const Divider(height: 32),
            QualityPanel(targetKind: 'report', targetId: id),
          ],
        ),
        loading: () => const LumiPageSkeleton(height: 140),
        error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
      ),
    );
  }
}

class _ConfidenceBar extends StatelessWidget {
  const _ConfidenceBar({required this.value});
  final double value;

  @override
  Widget build(BuildContext context) {
    final pct = (value * 100).round();

    final color = value >= 0.7
        ? context.lumi.success
        : value >= 0.4
            ? context.lumi.warning
            : context.lumi.error;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 80,
          height: 6,
          decoration: BoxDecoration(
            color: context.lumi.line,
            borderRadius: BorderRadius.circular(3),
          ),
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: value.clamp(0.0, 1.0),
            child: Container(
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          context.t('{{pct}}% confidence', {'pct': pct}),
          style: context.type.bodySmall!.copyWith(
            fontWeight: FontWeight.w600,
            color: context.lumi.muted,
          ),
        ),
      ],
    );
  }
}
