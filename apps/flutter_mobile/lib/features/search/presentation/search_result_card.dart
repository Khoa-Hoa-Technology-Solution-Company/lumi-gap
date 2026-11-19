import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';

/// One search hit: title, authors, a line of facts and a save button. The
/// row opens the paper, where adding to a project and citing are.
class SearchResultCard extends StatelessWidget {
  const SearchResultCard({
    required this.paper,
    required this.saved,
    required this.savingBookmark,
    required this.onBookmarkTap,
    required this.onTap,
    super.key,
  });

  final Paper paper;

  /// Null while the reader's bookmarks are not loaded: the icon then makes
  /// no claim either way.
  final bool? saved;
  final bool savingBookmark;
  final VoidCallback onBookmarkTap;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final authors = paper.authors.map((a) => a.displayName).join(', ');
    final venue = paper.journalName?.trim() ?? '';
    // Only what the paper really has: a missing year or venue is left out.
    final meta = [
      if (paper.publicationYear > 0) '${paper.publicationYear}',
      if (venue.isNotEmpty) venue,
      context.plural(
        paper.citationCount,
        one: '{{count}} citation',
        other: '{{count}} citations',
      ),
    ].join(' · ');
    final isSaved = saved ?? false;

    const radius = BorderRadius.all(Radius.circular(12));
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: lumi.surface,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: lumi.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 4, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            paper.title,
                            style: theme.textTheme.titleMedium,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        // Imported papers keep the stored default 0, which
                        // means "not measured": no chip rather than "0.00".
                        if (paper.dataQualityScore > 0) ...[
                          const SizedBox(width: 8),
                          Tooltip(
                            message: context.t('Data quality score'),
                            child: LumiChip(
                              label: paper.dataQualityScore.toStringAsFixed(2),
                              tone: LumiChipTone.primary,
                              icon: Icons.bar_chart,
                            ),
                          ),
                        ],
                        IconButton(
                          isSelected: isSaved,
                          icon: Icon(
                            isSaved ? Icons.bookmark : Icons.bookmark_outline,
                            color: isSaved
                                ? lumi.primary
                                : lumi.foregroundSecondary,
                          ),
                          tooltip: isSaved
                              ? context.t('Remove bookmark')
                              : context.t('Save Paper'),
                          onPressed: savingBookmark ? null : onBookmarkTap,
                        ),
                      ],
                    ),
                    if (authors.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        authors,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: lumi.foregroundSecondary),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          meta,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: lumi.foregroundSecondary),
                        ),
                        if (paper.openAccessUrl != null)
                          LumiChip(
                            label: context.t('Open Access'),
                            tone: LumiChipTone.success,
                            icon: Icons.lock_open,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
