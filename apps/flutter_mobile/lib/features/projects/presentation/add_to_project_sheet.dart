import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// "Add to project" for one paper, opened from the paper detail screen and
/// from a search result.
///
/// The messenger, router and provider container are taken from the screen
/// that opens the sheet: the sheet is closed before the request finishes,
/// and its own context and `ref` are disposed by then. Feedback shown
/// through them would never appear, and Riverpod throws on a disposed `ref`.
Future<void> showAddToProjectSheet(
  BuildContext context, {
  required String paperId,
}) {
  final messenger = ScaffoldMessenger.of(context);
  final router = GoRouter.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final lumi = context.lumi;
  return showModalBottomSheet<void>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
    context: context,
    builder: (sheetContext) => _AddToProjectSheet(
      onPick: (project) async {
        Navigator.pop(sheetContext);
        try {
          await container.read(projectsApiProvider).addPaper(project.id, paperId);
          container
            ..invalidate(projectsProvider)
            ..invalidate(projectProvider(project.id));
          messenger.showSnackBar(
            SnackBar(content: Text(trNow('Added paper to project'))),
          );
        } on Object catch (e) {
          messenger.showSnackBar(
            SnackBar(
              content: Text(trNow(failureMessageKey(e))),
              backgroundColor: lumi.error,
            ),
          );
        }
      },
      onCreate: () {
        Navigator.pop(sheetContext);
        router.go('/projects');
      },
    ),
  );
}

class _AddToProjectSheet extends ConsumerWidget {
  const _AddToProjectSheet({required this.onPick, required this.onCreate});

  final Future<void> Function(ProjectView project) onPick;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    final theme = Theme.of(context);
    final lumi = context.lumi;

    final Widget body;
    if (projects.hasValue) {
      final list = projects.requireValue;
      body = list.isEmpty
          ? LumiEmptyState(
              icon: Icons.folder_open,
              message: context.t(
                'No projects yet. Create one to group papers and work with your team.',
              ),
              actionLabel: context.t('Create project'),
              onAction: onCreate,
              compact: true,
            )
          : Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: list.length,
                itemBuilder: (context, index) {
                  final project = list[index];
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: lumi.primarySoft,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(Icons.folder_outlined,
                          color: lumi.primary, size: 20),
                    ),
                    title: Text(
                      project.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    // The list payload sends the real number beside an empty
                    // `papers` array.
                    subtitle: Text(
                      context.plural(
                        project.paperCount,
                        one: '{{count}} paper',
                        other: '{{count}} papers',
                      ),
                    ),
                    trailing: Icon(Icons.add, color: lumi.primary),
                    onTap: () => unawaited(onPick(project)),
                  );
                },
              ),
            );
    } else if (projects.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(projects.error!)),
        retrying: projects.isLoading,
        onRetry: () => ref.invalidate(projectsProvider),
        inline: true,
      );
    } else {
      body = const LumiSkeleton(height: 56);
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    context.t('Add to project'),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  tooltip: context.t('Close'),
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 8),
            body,
          ],
        ),
      ),
    );
  }
}
