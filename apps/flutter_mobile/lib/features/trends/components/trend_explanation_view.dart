import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:go_router/go_router.dart';

/// An AI explanation of a trend: summary, the reasons, the cautions, what
/// to do next, and the figures it was based on.
class TrendExplanationView extends StatelessWidget {
  const TrendExplanationView({
    required this.explanation,
    required this.topic,
    super.key,
  });

  final TrendExplanationResponse explanation;

  /// The topic the explanation is about; actions search and report on it.
  final String? topic;

  Future<void> _copy(BuildContext context) async {
    final text = context.t('Topic: {{selectedTopic}}\n\nSummary:\n{{summary}}', {
      'selectedTopic': topic ?? '',
      'summary': explanation.summary,
    });
    await Clipboard.setData(ClipboardData(text: text));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(context.t('Explanation copied to clipboard'))),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final t = topic?.trim() ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.t('AI Summary Rationale'), style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        LumiCard(
          child: MarkdownBody(
            data: explanation.summary,
            styleSheet: MarkdownStyleSheet(
              p: theme.textTheme.bodyMedium
                  ?.copyWith(height: 1.5, color: lumi.foreground),
            ),
          ),
        ),
        const SizedBox(height: 16),
        _Bullets(
          title: context.t('Why it matters'),
          items: explanation.whyItMatters,
          icon: Icons.lightbulb_outline,
        ),
        _Bullets(
          title: context.t('Cautions & Limitations'),
          items: explanation.cautions,
          icon: Icons.warning_amber_outlined,
        ),
        _Bullets(
          title: context.t('Suggested Actions'),
          items: explanation.suggestedActions,
          icon: Icons.task_alt_outlined,
        ),
        if (explanation.metricTrace.isNotEmpty) ...[
          Text(
            context.t('Metric Trace Evidence'),
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          for (final trace in explanation.metricTrace)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: LumiCard(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            trace.label,
                            style: theme.textTheme.labelMedium
                                ?.copyWith(color: lumi.foregroundSecondary),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          trace.value,
                          style: theme.textTheme.labelLarge
                              ?.copyWith(color: lumi.primary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(trace.explanation, style: theme.textTheme.bodySmall),
                    if (trace.source.trim().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        context.t('Source: {{source}}', {'source': trace.source}),
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: lumi.foregroundSecondary),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          const SizedBox(height: 8),
        ],
        if (t.isNotEmpty) ...[
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => unawaited(
                    context.push('/search?q=${Uri.encodeComponent(t)}'),
                  ),
                  icon: const Icon(Icons.search, size: 18),
                  label: Text(context.t('Search Papers')),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => unawaited(
                    context.push('/reports?topic=${Uri.encodeComponent(t)}'),
                  ),
                  icon: const Icon(Icons.description_outlined, size: 18),
                  label: Text(context.t('Generate Report')),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
        ],
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () => unawaited(_copy(context)),
            icon: const Icon(Icons.copy, size: 18),
            label: Text(context.t('Copy Explanation Text')),
          ),
        ),
      ],
    );
  }
}

class _Bullets extends StatelessWidget {
  const _Bullets({required this.title, required this.items, required this.icon});

  final String title;
  final List<String> items;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: lumi.primary, size: 18),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: theme.textTheme.titleSmall)),
            ],
          ),
          const SizedBox(height: 6),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(left: 26, bottom: 4),
              // i18n-ignore: a bullet before text the API wrote
              child: Text('• $item', style: theme.textTheme.bodyMedium),
            ),
        ],
      ),
    );
  }
}
