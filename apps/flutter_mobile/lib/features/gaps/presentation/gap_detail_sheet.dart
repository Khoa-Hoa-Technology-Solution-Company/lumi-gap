import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_card.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_closure_widgets.dart';
import 'package:go_router/go_router.dart';

/// Everything about one gap, and what to do next.
///
/// The router is taken from the screen that opens the sheet: actions close
/// the sheet first, and its own context is gone by the time they navigate.
Future<void> showGapDetailSheet(
  BuildContext context, {
  required ResearchGapItem gap,
  required void Function(String status) onStatusChange,
}) {
  final router = GoRouter.of(context);
  return showModalBottomSheet<void>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) {
      void closeThen(VoidCallback action) {
        Navigator.pop(sheetContext);
        action();
      }

      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (context, controller) => _GapDetail(
          gap: gap,
          controller: controller,
          onOpenPaper: (id) =>
              closeThen(() => unawaited(router.push('/paper/$id'))),
          onSearch: () => closeThen(
            () => unawaited(
              router.push('/search?q=${Uri.encodeComponent(gap.topic)}'),
            ),
          ),
          onDraftProposal: () => closeThen(() {
            final topic = Uri.encodeComponent(gap.title);
            final query = Uri.encodeComponent(
              trNow(
                'A research proposal outline that addresses this gap: {{gap}}',
                {'gap': gap.title},
              ),
            );
            unawaited(router.push('/reports?topic=$topic&query=$query'));
          }),
          onStatusChange: (status) => closeThen(() => onStatusChange(status)),
        ),
      );
    },
  );
}

class _GapDetail extends StatelessWidget {
  const _GapDetail({
    required this.gap,
    required this.controller,
    required this.onOpenPaper,
    required this.onSearch,
    required this.onDraftProposal,
    required this.onStatusChange,
  });

  final ResearchGapItem gap;
  final ScrollController controller;
  final ValueChanged<String> onOpenPaper;
  final VoidCallback onSearch;
  final VoidCallback onDraftProposal;
  final ValueChanged<String> onStatusChange;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final status = gapStatusStyle(gap.status);

    Widget heading(String text) => Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 6),
          child: Text(text, style: theme.textTheme.titleSmall),
        );

    // Papers with details first; bare ids only when nothing else is known.
    final papers = gap.supportingPapers;
    final bareIds = papers.isEmpty ? gap.supportingPaperIds : const <String>[];

    return ListView(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: Text(gap.title, style: theme.textTheme.titleLarge)),
            const SizedBox(width: 8),
            LumiChip(label: context.t(status.label), tone: status.tone),
          ],
        ),
        if (gap.description.trim().isNotEmpty) ...[
          heading(context.t('Summary description')),
          Text(gap.description, style: theme.textTheme.bodyMedium),
        ],
        // Only the reasoning the API recorded; none is never made up.
        if (gap.rationale.trim().isNotEmpty) ...[
          heading(context.t('AI reasoning & grounding')),
          Text(gap.rationale, style: theme.textTheme.bodyMedium),
        ],
        heading(context.t('Validation metrics')),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            GapConfidenceLabel(level: gap.gapConfidence),
            if (gap.evidenceConfidence case final score?)
              GapConfidenceBar(value: score),
            Text(
              context.plural(
                gap.evidenceCount,
                one: '{{count}} evidence paper',
                other: '{{count}} evidence papers',
              ),
              style: theme.textTheme.labelMedium
                  ?.copyWith(color: lumi.foregroundSecondary),
            ),
          ],
        ),
        const SizedBox(height: 16),
        GapClosureSection(gap: gap),
        if (papers.isNotEmpty || bareIds.isNotEmpty) ...[
          heading(context.t('Grounding evidence papers')),
          for (final p in papers)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.article_outlined, color: lumi.primary),
              title: Text(
                p.title.trim().isEmpty
                    ? context.t('Supporting evidence paper')
                    : p.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                [
                  if (p.publicationYear != null) '${p.publicationYear}',
                  if ((p.journalName ?? '').trim().isNotEmpty) p.journalName!,
                  if (p.citationCount != null)
                    context.plural(
                      p.citationCount!,
                      one: '{{count}} cite',
                      other: '{{count}} cites',
                    ),
                ].join(' · '),
              ),
              onTap: () => onOpenPaper(p.id),
            ),
          for (final id in bareIds)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.article_outlined, color: lumi.primary),
              title: Text(context.t('Supporting evidence paper')),
              onTap: () => onOpenPaper(id),
            ),
        ],
        heading(context.t('Actions')),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onSearch,
                icon: const Icon(Icons.search, size: 18),
                label: Text(context.t('Search solutions')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                onPressed: onDraftProposal,
                icon: const Icon(Icons.edit_note, size: 18),
                label: Text(context.t('Draft proposal')),
              ),
            ),
          ],
        ),
        if (gap.status == 'active') ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onStatusChange('dismissed'),
                  icon: const Icon(Icons.close, size: 18),
                  label: Text(context.t('Reject gap')),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onStatusChange('resolved'),
                  icon: const Icon(Icons.check, size: 18),
                  label: Text(context.t('Validate gap')),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
