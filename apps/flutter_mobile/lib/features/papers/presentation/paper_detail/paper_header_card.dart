import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_avatar.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';

/// Title, source line, badges and the first authors of a paper.
class PaperHeaderCard extends StatelessWidget {
  const PaperHeaderCard({required this.paper, super.key});

  final Paper paper;

  /// Authors shown on the card; the rest open in a sheet.
  static const int shownAuthors = 3;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final source = [
      if ((paper.journalName ?? '').trim().isNotEmpty) paper.journalName!.trim(),
      if (paper.publicationYear > 0) '${paper.publicationYear}',
    ].join(' · ');

    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(paper.title, style: theme.textTheme.titleLarge),
          if (source.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              source,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: lumi.foregroundSecondary),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              LumiChip(
                label: context.plural(
                  paper.citationCount,
                  one: '{{count}} Citation',
                  other: '{{count}} Citations',
                  args: {'count': formatNumber(paper.citationCount)},
                ),
                tone: LumiChipTone.primary,
              ),
              if (paper.isAiAnalyzable)
                LumiChip(
                  label: context.t('AI Analyzable'),
                  icon: Icons.check_circle_outline,
                ),
              if (paper.openAccessUrl != null)
                LumiChip(
                  label: context.t('Open Access'),
                  tone: LumiChipTone.success,
                  icon: Icons.lock_open,
                ),
            ],
          ),
          if (paper.authors.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              context.t('AUTHORS'),
              style: context.type.labelMedium!.copyWith(color: lumi.muted),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final author in paper.authors.take(shownAuthors))
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: lumi.surfaceMuted,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      author.displayName,
                      style: context.type.bodySmall!
                          .copyWith(color: lumi.foreground),
                    ),
                  ),
                if (paper.authors.length > shownAuthors)
                  TextButton(
                    onPressed: () => unawaited(_showAllAuthors(context)),
                    child: Text(
                      context.t('View all ({{length}})', {
                        'length': paper.authors.length,
                      }),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _showAllAuthors(BuildContext context) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.6,
          maxChildSize: 0.9,
          builder: (context, controller) => ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Text(
                context.t('All Authors'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              for (final author in paper.authors)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: LumiAvatar(name: author.displayName),
                  title: Text(author.displayName),
                  subtitle: Text(
                    context.t('Author Position: {{position}}', {
                      'position': author.position,
                    }),
                  ),
                ),
            ],
          ),
        ),
      );
}
