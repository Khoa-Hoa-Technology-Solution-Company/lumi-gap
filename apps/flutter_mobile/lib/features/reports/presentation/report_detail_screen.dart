import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
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
      appBar: AppBar(title: const Text('Report Detail')),
      body: query.when(
        data: (report) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(report.topic ?? report.query, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Chip(label: Text(report.status)),
            if (report.errorMessage != null) Text(report.errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 16),
            MarkdownBody(data: report.markdown ?? 'No markdown yet. Keep the report worker running and refresh later.'),
            const Divider(height: 32),
            Text('Grounding papers', style: Theme.of(context).textTheme.titleLarge),
            ...report.groundingPapers.map((paper) => ListTile(title: Text(paper.title), subtitle: Text('${paper.publicationYear}'), onTap: () => context.push('/paper/${paper.id}'))),
            const Divider(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Identified Research Gaps', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                GestureDetector(
                  onTap: () => context.push('/gaps?topic=${Uri.encodeComponent(report.topic ?? report.query)}'),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'View Gaps Board',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF06B6D4),
                        ),
                      ),
                      SizedBox(width: 2),
                      Icon(Icons.chevron_right, size: 14, color: Color(0xFF06B6D4)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...report.researchGaps.map((gap) {
              final isDark = Theme.of(context).brightness == Brightness.dark;
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1A2332) : Colors.white,
                  border: Border.all(
                    color: isDark ? const Color(0xFF26334A) : const Color(0xFFE2E8F0),
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.lightbulb_outline, size: 16, color: Color(0xFF06B6D4)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            gap.title,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      gap.description,
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF64748B),
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
        loading: () => const AppLoading(fullScreen: true, message: 'Loading report...'),
        error: (error, _) => AppErrorState(message: error.toString()),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final color = value >= 0.7
        ? const Color(0xFF10B981)
        : value >= 0.4
            ? const Color(0xFFF59E0B)
            : const Color(0xFFEF4444);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 80,
          height: 6,
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF26334A) : const Color(0xFFE2E8F0),
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
          '$pct% confidence',
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: Color(0xFF94A3B8),
          ),
        ),
      ],
    );
  }
}
