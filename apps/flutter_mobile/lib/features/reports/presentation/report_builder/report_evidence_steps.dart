import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:go_router/go_router.dart';

/// "2024 · 12 cites": a missing year is left out, never "N/A".
String _paperFacts(BuildContext context, ReportEvidencePaper p) => [
      if (p.year != null && p.year! > 0) '${p.year}',
      context.plural(
        p.citations,
        one: '{{count}} cite',
        other: '{{count}} cites',
      ),
    ].join(' · ');

class _Note extends StatelessWidget {
  const _Note(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: context.lumi.surfaceMuted,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, size: 18, color: context.lumi.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: context.lumi.foreground),
              ),
            ),
          ],
        ),
      );
}

class _PaperRow extends StatelessWidget {
  const _PaperRow({required this.paper, this.leading, this.relevance});

  final ReportEvidencePaper paper;
  final Widget? leading;
  final double? relevance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final facts = [
      _paperFacts(context, paper),
      if (relevance != null)
        context.t('Relevance: {{score}}', {
          'score': relevance!.toStringAsFixed(2),
        }),
    ].join(' · ');
    return Row(
      children: [
        ?leading,
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  paper.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(height: 2),
                Text(
                  facts,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ],
            ),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.open_in_new, size: 18),
          color: lumi.primary,
          tooltip: context.t('Open paper detail'),
          onPressed: () => unawaited(context.push('/paper/${paper.id}')),
        ),
      ],
    );
  }
}

/// Step 2: the papers retrieval found for the question.
class ReportPreviewStep extends StatelessWidget {
  const ReportPreviewStep({
    required this.papers,
    required this.onBack,
    required this.onNext,
    super.key,
  });

  final List<ReportEvidencePaper> papers;
  final VoidCallback onBack;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Evidence found'),
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            context.t(
              '{{length}} papers match your question.',
              {'length': papers.length},
            ),
            style: theme.textTheme.bodySmall
                ?.copyWith(color: context.lumi.foregroundSecondary),
          ),
          const SizedBox(height: 12),
          _Note(
            context.t(
              'An added paper becomes evidence the report can cite. It does not force a conclusion.',
            ),
          ),
          const SizedBox(height: 8),
          if (papers.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                context.t(
                  'No papers retrieved. Try broadening your research question.',
                ),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.lumi.foregroundSecondary,
                ),
              ),
            )
          else
            for (final p in papers) _PaperRow(paper: p, relevance: p.score),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onBack,
                  child: Text(context.t('Back to setup')),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: papers.isEmpty ? null : onNext,
                  child: Text(context.t('Edit evidence')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Step 3: keep or drop each paper, then generate.
class ReportEditStep extends StatelessWidget {
  const ReportEditStep({
    required this.papers,
    required this.selectedIds,
    required this.creating,
    required this.onToggle,
    required this.onBack,
    required this.onGenerate,
    super.key,
  });

  final List<ReportEvidencePaper> papers;
  final Set<String> selectedIds;
  final bool creating;
  final void Function(String id, {required bool selected}) onToggle;
  final VoidCallback onBack;
  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final none = selectedIds.isEmpty;
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.t('Choose the evidence'),
                  style: theme.textTheme.titleMedium,
                ),
              ),
              Text(
                context.t('Selected: {{selected}}/{{total}}', {
                  'selected': selectedIds.length,
                  'total': papers.length,
                }),
                style: theme.textTheme.labelMedium
                    ?.copyWith(color: lumi.primary),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _Note(
            context.t(
              'Papers you deselect are left out of the report.',
            ),
          ),
          const SizedBox(height: 8),
          for (final p in papers)
            _PaperRow(
              paper: p,
              leading: Checkbox(
                value: selectedIds.contains(p.id),
                onChanged: creating
                    ? null
                    : (v) => onToggle(p.id, selected: v ?? false),
              ),
            ),
          // A grounded report needs evidence: none selected, nothing to send.
          if (none)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                context.t('Select at least one paper to ground the report.'),
                style: theme.textTheme.bodySmall?.copyWith(color: lumi.error),
              ),
            ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: creating ? null : onBack,
                  child: Text(context.t('Back')),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: creating || none ? null : onGenerate,
                  child: creating
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: lumi.onPrimary,
                          ),
                        )
                      : Text(context.t('Generate report')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
