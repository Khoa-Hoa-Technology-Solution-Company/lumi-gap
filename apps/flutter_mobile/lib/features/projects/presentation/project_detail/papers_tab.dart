import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_swipe_action.dart';
import 'package:flutter_mobile/core/widgets/undo_snackbar.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

enum _PaperAction { open, remove }

/// The project's papers. Swipe a row left (or long-press it) to take the
/// paper out of the project, with Undo: the row hides at once and the
/// server is asked only when the Undo window closes. The server may refuse
/// (screening history, gap evidence, private files): the row comes back
/// with the reason.
class ProjectPapersTab extends ConsumerStatefulWidget {
  const ProjectPapersTab({
    required this.project,
    required this.projectId,
    required this.ref,
    super.key,
  });

  final ProjectView project;
  final String projectId;

  /// Kept for the call sites; the tab reads providers through its own ref.
  final WidgetRef ref;

  @override
  ConsumerState<ProjectPapersTab> createState() => _ProjectPapersTabState();
}

class _ProjectPapersTabState extends ConsumerState<ProjectPapersTab> {
  /// Papers removed whose Undo window is open or whose request is in flight.
  final Set<String> _hidden = {};

  /// Commits the removal waiting in its Undo window. Only one can wait: a new
  /// removal replaces the snackbar, which commits the previous one.
  VoidCallback? _commitPending;
  late ScaffoldMessengerState _messenger;
  late ProviderContainer _container;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _messenger = ScaffoldMessenger.of(context);
    _container = ProviderScope.containerOf(context, listen: false);
  }

  @override
  void dispose() {
    // Leaving the tab or the screen sends a pending removal now.
    _commitPending?.call();
    super.dispose();
  }

  void _remove(ProjectPaperRef paper) {
    if (!_hidden.add(paper.id)) return;
    setState(() {});
    final locale = context.appLocale;
    _commitPending = showUndoSnackBar(
      _messenger,
      message: translate('Paper removed from project.', locale),
      undoLabel: translate('Undo', locale),
      onUndo: () {
        if (mounted) setState(() => _hidden.remove(paper.id));
      },
      onCommit: () => unawaited(_commit(paper, locale)),
    );
  }

  Future<void> _commit(ProjectPaperRef paper, AppLocale locale) async {
    try {
      await _container
          .read(projectsApiProvider)
          .removePaper(widget.projectId, paper.id);
    } on Object catch (e) {
      if (mounted) setState(() => _hidden.remove(paper.id));
      if (_messenger.mounted) {
        _messenger.showSnackBar(
          SnackBar(
            content: Text(translate('Failed to remove paper: {{e}}', locale, {
              'e': translate(failureMessageKey(e), locale),
            })),
          ),
        );
      }
    } finally {
      // The counts and lists show what the server has, either way.
      _container.invalidate(projectProvider(widget.projectId));
    }
  }

  Future<void> _showActions(ProjectPaperRef paper) async {
    final action = await showLumiActionSheet<_PaperAction>(
      context,
      title: paper.title,
      actions: [
        LumiSheetAction(
          value: _PaperAction.open,
          label: context.t('Open paper'),
          icon: Icons.open_in_new,
        ),
        LumiSheetAction(
          value: _PaperAction.remove,
          label: context.t('Remove from project'),
          icon: Icons.remove_circle_outline,
          destructive: true,
        ),
      ],
    );
    if (!mounted || action == null) return;
    switch (action) {
      case _PaperAction.open:
        unawaited(context.push('/paper/${paper.id}'));
      case _PaperAction.remove:
        unawaited(Haptics.destructive());
        _remove(paper);
    }
  }

  @override
  Widget build(BuildContext context) {
    final shown = [
      for (final p in widget.project.papers)
        if (!_hidden.contains(p.id)) p,
    ];

    return RefreshIndicator(
      onRefresh: () => ref.refresh(projectProvider(widget.projectId).future),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        // Room under the last row for the "Add paper" button.
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          if (shown.isEmpty)
            // Papers are added from search (each paper's "Add to project").
            LumiEmptyState(
              icon: Icons.article_outlined,
              message: context.t('No papers inside this project workspace yet.'),
              actionLabel: context.t('Search publications'),
              onAction: () => unawaited(context.push('/search')),
              compact: true,
            )
          else
            LumiRowGroup(
              children: [
                for (final paper in shown)
                  LumiSwipeAction(
                    key: ValueKey('project-paper-${paper.id}'),
                    label: context.t('Remove from project'),
                    icon: Icons.remove_circle_outline,
                    destructive: true,
                    removesItem: true,
                    onSwipe: () => _remove(paper),
                    child: LumiListRow(
                      icon: Icons.article_outlined,
                      iconInTile: true,
                      title: paper.title,
                      subtitle: context.t(
                        'Year: {{year}} · Citations: {{citations}}',
                        {
                          'year': paper.publicationYear ?? context.t('N/A'),
                          'citations': paper.citationCount ?? 0,
                        },
                      ),
                      onTap: () => unawaited(context.push('/paper/${paper.id}')),
                      onLongPress: () => unawaited(_showActions(paper)),
                      longPressHint: context.t('Show actions'),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
