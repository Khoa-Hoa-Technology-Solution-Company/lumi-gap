import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// One paper in a list: optional topic chip, title (up to three lines),
/// authors, then venue / year / citations.
///
/// A field that is null or blank is left out instead of printing "Unknown",
/// and the card is only as tall as what it shows. The bookmark button is a
/// 48dp target in the top-right corner, level with the first title line.
class PaperCard extends ConsumerWidget {
  const PaperCard({
    required this.id,
    required this.title,
    required this.onTap,
    super.key,
    this.authors,
    this.venueAndYear,
    this.chip,
    this.score,
    this.onBookmarkTap,
  });

  final String id;
  final String title;
  final String? authors;
  final String? venueAndYear;

  /// Topic or "why you see this" label above the title.
  final String? chip;
  final String? score;
  final VoidCallback onTap;
  final VoidCallback? onBookmarkTap;

  static bool _has(String? s) => s != null && s.trim().isNotEmpty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final hasBookmark = onBookmarkTap != null;

    final isBookmarked = hasBookmark &&
        (ref
                .watch(bookmarkStatusProvider(BookmarkTarget('paper', id)))
                .value
                ?.bookmarked ??
            false);

    const radius = BorderRadius.all(Radius.circular(8));
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
          onTap: onTap,
          borderRadius: radius,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_has(chip))
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: LumiChip(label: chip!),
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Padding(
                      // 12 + half a 24dp title line = the centre of the
                      // 48dp bookmark button next to it.
                      padding: EdgeInsets.fromLTRB(
                        16,
                        _has(chip) ? 8 : 16,
                        hasBookmark ? 0 : 16,
                        0,
                      ),
                      child: Text(
                        title,
                        style: theme.textTheme.titleMedium,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  if (hasBookmark)
                    Padding(
                      padding: EdgeInsets.only(
                        top: _has(chip) ? 0 : 4,
                        right: 4,
                      ),
                      child: IconButton(
                        onPressed: onBookmarkTap,
                        tooltip: isBookmarked
                            ? context.t('Remove bookmark')
                            : context.t('Bookmark'),
                        isSelected: isBookmarked,
                        constraints: const BoxConstraints(
                          minWidth: 48,
                          minHeight: 48,
                        ),
                        icon: Icon(
                          isBookmarked
                              ? Icons.bookmark
                              : Icons.bookmark_border,
                          color: isBookmarked ? lumi.primary : lumi.muted,
                          size: 24,
                        ),
                      ),
                    ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_has(authors))
                      Text(
                        authors!,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: lumi.foregroundSecondary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    if (_has(venueAndYear) || score != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: _has(venueAndYear)
                                ? Text(
                                    venueAndYear!,
                                    style: theme.textTheme.bodySmall
                                        ?.copyWith(color: lumi.muted),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  )
                                : const SizedBox.shrink(),
                          ),
                          if (score != null) ...[
                            const SizedBox(width: 8),
                            LumiChip(
                              label: score!,
                              tone: LumiChipTone.primary,
                              icon: Icons.bar_chart,
                            ),
                          ],
                        ],
                      ),
                    ],
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
