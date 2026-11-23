import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/domain/paper_citation.dart';
import 'package:flutter_mobile/features/projects/presentation/add_to_project_sheet.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Save, add to project, cite, open the PDF.
class PaperActionsPanel extends ConsumerStatefulWidget {
  const PaperActionsPanel({
    required this.paper,
    required this.paperId,
    super.key,
  });

  final Paper paper;
  final String paperId;

  @override
  ConsumerState<PaperActionsPanel> createState() => _PaperActionsPanelState();
}

class _PaperActionsPanelState extends ConsumerState<PaperActionsPanel> {
  /// One save / unsave at a time: two quick taps would otherwise create two
  /// bookmarks, or delete one that is already gone.
  bool _savingBookmark = false;

  BookmarkTarget get _target => BookmarkTarget('paper', widget.paperId);

  Future<void> _toggleBookmark(bool isBookmarked, String? bookmarkId) async {
    if (_savingBookmark) return;
    setState(() => _savingBookmark = true);
    // The user may leave before the server answers; this widget's `ref` is
    // unusable then, so the refresh goes through the app's container.
    final container = ProviderScope.containerOf(context, listen: false);
    final target = _target;
    try {
      final api = container.read(bookmarksApiProvider);
      if (isBookmarked && bookmarkId != null) {
        await api.delete(bookmarkId);
      } else {
        await api.create(targetKind: 'paper', targetId: widget.paperId);
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t(failureMessageKey(e))),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      // Reload either way: after a failure the button shows what the server
      // really has. The saved list is reloaded too, so Search and Bookmarks
      // do not keep showing the old state.
      container
        ..invalidate(bookmarkStatusProvider(target))
        ..invalidate(bookmarksProvider);
      if (mounted) setState(() => _savingBookmark = false);
    }
  }

  Future<void> _showCitation() {
    final paper = widget.paper;
    final authors = [for (final a in paper.authors) a.displayName];
    final apa = apaCitation(
      authors: authors,
      title: paper.title,
      year: paper.publicationYear,
      journal: paper.journalName,
    );
    final mla = mlaCitation(
      authors: authors,
      title: paper.title,
      year: paper.publicationYear,
      journal: paper.journalName,
    );
    return showModalBottomSheet<void>(
      // Over the bottom navigation bar, dimming it too.
      useRootNavigator: true,
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (context) {
        final theme = Theme.of(context);
        Widget style(String label, String text) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(label, style: theme.textTheme.titleSmall),
                    ),
                    IconButton(
                      tooltip: context.t('Copy'),
                      icon: const Icon(Icons.copy_outlined, size: 20),
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: text));
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content:
                                Text(context.t('Citation copied to clipboard')),
                          ),
                        );
                      },
                    ),
                  ],
                ),
                SelectableText(text, style: theme.textTheme.bodySmall),
              ],
            );
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(context.t('Cite publication'), style: theme.textTheme.titleLarge),
              const SizedBox(height: 16),
              style(context.t('APA style:'), apa),
              const Divider(height: 24),
              style(context.t('MLA style:'), mla),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(bookmarkStatusProvider(_target)).value;
    final isBookmarked = status?.bookmarked ?? false;
    final fullText = widget.paper.openAccessUrl;

    // The bar under the paper: the three paper actions, then the main one,
    // "Open full text", when there is a free copy. One label per intent: the
    // full text is not offered twice ("PDF link" was the same URL).
    return Row(
        children: [
          PaperActionButton(
            icon: isBookmarked ? Icons.bookmark : Icons.bookmark_border,
            label: isBookmarked ? context.t('Saved') : context.t('Save'),
            active: isBookmarked,
            onTap: _savingBookmark
                ? null
                : () => unawaited(
                      _toggleBookmark(isBookmarked, status?.bookmarkId),
                    ),
          ),
          PaperActionButton(
            icon: Icons.create_new_folder_outlined,
            label: context.t('Add to project'),
            onTap: () => unawaited(
              showAddToProjectSheet(context, paperId: widget.paperId),
            ),
          ),
          PaperActionButton(
            icon: Icons.format_quote,
            label: context.t('Cite paper'),
            onTap: () => unawaited(_showCitation()),
          ),
          if (fullText != null) ...[
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: () => unawaited(launchUrl(Uri.parse(fullText))),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text(
                  context.t('Open full text'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ],
    );
  }
}

/// Icon over a label, a 48dp+ target with a ripple. Without [onTap] it is
/// disabled: dimmed, and announced as such.
class PaperActionButton extends StatelessWidget {
  const PaperActionButton({
    required this.icon,
    required this.label,
    this.active = false,
    this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final enabled = onTap != null;
    final color = !enabled
        ? lumi.muted.withValues(alpha: 0.6)
        : active
            ? lumi.primary
            : lumi.foregroundSecondary;
    return Expanded(
      child: Semantics(
        button: true,
        enabled: enabled,
        selected: active,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 8),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: color, size: 22),
                  const SizedBox(height: 6),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    style: Theme.of(context)
                        .textTheme
                        .labelMedium
                        ?.copyWith(color: color),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
