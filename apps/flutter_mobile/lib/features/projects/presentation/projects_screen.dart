import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/create_project_sheet.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

enum ProjectFilter { all, mine, joined }

/// Whether the signed-in user owns [project]: the server's `accessRole`
/// first, the owner id as a fallback for payloads without it. Null when
/// neither is known.
bool? ownsProject(ProjectView project, String? userId) {
  final fromRole = project.viewerIsOwner;
  if (fromRole != null) return fromRole;
  final owner = project.ownerId;
  if (userId == null || owner == null || owner.isEmpty) return null;
  return owner == userId;
}

/// "Mine" is a project the user owns; "Joined" is one they are in without
/// owning it. Ownership comes from the API, never from a guess.
List<ProjectView> filterProjects(
  List<ProjectView> projects,
  ProjectFilter filter,
  String? userId,
) =>
    switch (filter) {
      ProjectFilter.all => projects,
      ProjectFilter.mine =>
        projects.where((p) => ownsProject(p, userId) ?? false).toList(),
      ProjectFilter.joined =>
        projects.where((p) => ownsProject(p, userId) == false).toList(),
    };

/// The filters only make sense when the signed-in user is known and every
/// project says who owns it. Otherwise only the full list is shown.
bool canFilterProjects(List<ProjectView> projects, String? userId) =>
    projects.every((p) => ownsProject(p, userId) != null);

class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen> {
  ProjectFilter _filter = ProjectFilter.all;

  /// True while the create sheet is open, so a second tap on "Create
  /// project" cannot stack a second sheet.
  bool _sheetOpen = false;

  Future<void> _openCreateSheet() async {
    if (_sheetOpen) return;
    _sheetOpen = true;
    try {
      final project = await showCreateProjectSheet(context);
      if (project == null || !mounted) return;
      ref.invalidate(projectsProvider);
      if (project.id.isNotEmpty) {
        await context.push('/project/${project.id}');
      }
    } finally {
      _sheetOpen = false;
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(projectsProvider);
    try {
      await ref.read(projectsProvider.future);
    } on Object catch (_) {
      // The list shows its own error state with a retry.
    }
  }

  @override
  Widget build(BuildContext context) {
    final projects = ref.watch(projectsProvider);
    final userId = ref.watch(currentUserProvider)?.id;

    final Widget body;
    if (projects.hasValue) {
      final all = projects.requireValue;
      final filterable = canFilterProjects(all, userId);
      final filter = filterable ? _filter : ProjectFilter.all;
      final shown = filterProjects(all, filter, userId);
      body = Column(
        children: [
          if (filterable && all.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: SizedBox(
                width: double.infinity,
                child: SegmentedButton<ProjectFilter>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(
                      value: ProjectFilter.all,
                      label: Text(context.t('All')),
                    ),
                    ButtonSegment(
                      value: ProjectFilter.mine,
                      label: Text(context.t('Mine')),
                    ),
                    ButtonSegment(
                      value: ProjectFilter.joined,
                      label: Text(context.t('Joined')),
                    ),
                  ],
                  selected: {filter},
                  onSelectionChanged: (s) => setState(() => _filter = s.single),
                ),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: shown.isEmpty
                  ? _EmptyProjects(filter: filter, onCreate: _openCreateSheet)
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      itemCount: shown.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (context, i) => _ProjectCard(
                        project: shown[i],
                        isOwner: filterable ? ownsProject(shown[i], userId) : null,
                        onTap: () => unawaited(
                          context.push('/project/${shown[i].id}'),
                        ),
                      ),
                    ),
            ),
          ),
        ],
      );
    } else if (projects.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(projects.error!)),
        retrying: projects.isLoading,
        onRetry: () => ref.invalidate(projectsProvider),
      );
    } else {
      // Clipped, not scrollable: on a short screen the last placeholder is
      // simply cut off.
      body = const SingleChildScrollView(
        physics: NeverScrollableScrollPhysics(),
        padding: EdgeInsets.all(16),
        child: LumiSkeleton(rows: 4, height: 104),
      );
    }

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(context.t('Projects')),
        actions: [
          IconButton(
            tooltip: context.t('Create project'),
            onPressed: () => unawaited(_openCreateSheet()),
            icon: const Icon(Icons.add),
          ),
          const NotificationBell(),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(child: body),
    );
  }
}

class _EmptyProjects extends StatelessWidget {
  const _EmptyProjects({required this.filter, required this.onCreate});

  final ProjectFilter filter;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final (String message, bool canCreate) = switch (filter) {
      ProjectFilter.all => (
          context.t('No projects yet. Create one to group papers and work with your team.'),
          true,
        ),
      ProjectFilter.mine => (
          context.t('You have not created a project yet.'),
          true,
        ),
      ProjectFilter.joined => (
          context.t('You have not joined a project yet.'),
          false,
        ),
    };
    // Scrollable so pull-to-refresh works on an empty list too.
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: LumiEmptyState(
            icon: Icons.folder_open,
            message: message,
            actionLabel: canCreate ? context.t('Create project') : null,
            onAction: canCreate ? onCreate : null,
          ),
        ),
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({
    required this.project,
    required this.isOwner,
    required this.onTap,
  });

  final ProjectView project;

  /// Null when ownership is not known: no role chip is shown then.
  final bool? isOwner;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final description = project.description?.trim() ?? '';

    return LumiCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  project.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium,
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, size: 20, color: lumi.muted),
            ],
          ),
          if (description.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: lumi.foregroundSecondary),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (isOwner != null)
                LumiChip(
                  label: isOwner!
                      ? context.t('Owner')
                      : context.t('Member'),
                  tone: isOwner!
                      ? LumiChipTone.primary
                      : LumiChipTone.neutral,
                ),
              Text(
                [
                  context.plural(
                    project.paperCount,
                    one: '{{count}} paper',
                    other: '{{count}} papers',
                  ),
                  context.plural(
                    project.memberCount,
                    one: '{{count}} member',
                    other: '{{count}} members',
                  ),
                ].join(' · '),
                style: theme.textTheme.bodySmall?.copyWith(color: lumi.muted),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
