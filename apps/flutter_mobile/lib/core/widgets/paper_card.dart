import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PaperCard extends ConsumerWidget {
  const PaperCard({
    required this.id,
    required this.title,
    required this.authors,
    required this.venueAndYear,
    required this.onTap,
    super.key,
    this.score,
    this.onBookmarkTap,
  });

  final String id;
  final String title;
  final String authors;
  final String venueAndYear;
  final String? score;
  final VoidCallback onTap;
  final VoidCallback? onBookmarkTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final lumi = context.lumi;

    final statusAsync = ref.watch(bookmarkStatusProvider(BookmarkTarget('paper', id)));
    final isBookmarked = statusAsync.value?.bookmarked ?? false;

    final cardBg = lumi.surface;
    final borderColor = lumi.line;
    final textColor = lumi.muted;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: borderColor),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: theme.textTheme.titleMedium,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (onBookmarkTap != null)
                      IconButton(
                        onPressed: onBookmarkTap,
                        tooltip: isBookmarked ? 'Remove bookmark' : 'Bookmark',
                        constraints:
                            const BoxConstraints(minWidth: 48, minHeight: 48),
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.standard,
                        icon: Icon(
                          isBookmarked ? Icons.bookmark : Icons.bookmark_border,
                          color: isBookmarked ? lumi.primary : textColor,
                          size: 24,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  authors,
                  style: theme.textTheme.bodySmall?.copyWith(color: textColor),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        venueAndYear,
                        style: theme.textTheme.labelMedium
                            ?.copyWith(color: textColor),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (score != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: lumi.primarySoft,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.insights_outlined, color: lumi.primary, size: 14),
                            const SizedBox(width: 4),
                            Text(
                              score!,
                              style: theme.textTheme.labelMedium
                                  ?.copyWith(color: lumi.primary),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
