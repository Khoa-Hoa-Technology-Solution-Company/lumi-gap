import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_members_screen.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

/// Tab positions in the project screen.
abstract final class ProjectTabs {
  static const int overview = 0;
  static const int papers = 1;
  static const int chat = 2;
  static const int outputs = 3;
}

/// A count only once it is known: "0" while loading or after a failed
/// request would state something false. A dash means "not known".
String knownCount(AsyncValue<int> count) =>
    count.hasValue ? count.requireValue.toString() : '—';

final ProviderFamily<AsyncValue<int>, String> projectReportsCountProvider =
    Provider.autoDispose.family<AsyncValue<int>, String>(
  (ref, projectId) => ref
      .watch(reportsProvider(ReportsParams(projectId: projectId)))
      .whenData((r) => r.reports.length),
);

final ProviderFamily<AsyncValue<int>, String> projectGapsCountProvider =
    Provider.autoDispose.family<AsyncValue<int>, String>(
  (ref, projectId) => ref
      .watch(gapsProvider(GapsListParams(projectId: projectId)))
      .whenData((g) => g.data.length),
);

/// The project at a glance on the dark header, above the tabs: the viewer's
/// role, the full title, what it is about, and four counts, each opening
/// what it counts. [compact] (keyboard open) keeps only the title.
class ProjectHeader extends ConsumerWidget {
  const ProjectHeader({
    required this.project,
    this.compact = false,
    super.key,
  });

  final ProjectView project;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final tints = context.tints;
    final description = project.description?.trim() ?? '';
    final isOwner = project.viewerIsOwner;
    final reports = knownCount(ref.watch(projectReportsCountProvider(project.id)));
    final gaps = knownCount(ref.watch(projectGapsCountProvider(project.id)));
    void tab(int i) => DefaultTabController.of(context).animateTo(i);

    final title = Semantics(
      header: true,
      child: Text(
        project.title,
        maxLines: compact ? 1 : 2,
        overflow: TextOverflow.ellipsis,
        style: (compact ? theme.textTheme.titleLarge : theme.textTheme.headlineSmall)
            ?.copyWith(color: tints.onInk, fontWeight: FontWeight.w800),
      ),
    );

    return ColoredBox(
      color: tints.ink,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: compact
            ? title
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (isOwner != null) ...[
                    DecoratedBox(
                      // White pill on the blue: the owner's in the brand
                      // colour, a member's in grey.
                      decoration: BoxDecoration(
                        color: tints.onHero,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        child: Text(
                          isOwner ? context.t('Owner') : context.t('Member'),
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: isOwner
                                ? LumiColors.light.primary
                                : LumiColors.light.foregroundSecondary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  title,
                  const SizedBox(height: 6),
                  Text(
                    description.isEmpty ? context.t('No description yet.') : description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: tints.onInkSoft,
                      fontStyle: description.isEmpty ? FontStyle.italic : FontStyle.normal,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final (i, stat) in [
                        (
                          project.paperCount.toString(),
                          context.t('Papers'),
                          () => tab(ProjectTabs.papers),
                        ),
                        (
                          project.memberCount.toString(),
                          context.t('Members'),
                          () => unawaited(
                                Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) =>
                                        ProjectMembersScreen(projectId: project.id),
                                  ),
                                ),
                              ),
                        ),
                        // Reports and gaps are both listed under Outputs.
                        (reports, context.t('Reports'), () => tab(ProjectTabs.outputs)),
                        (gaps, context.t('Gaps'), () => tab(ProjectTabs.outputs)),
                      ].indexed) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(
                          child: Material(
                            color: tints.heroTile,
                            borderRadius: BorderRadius.circular(16),
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                              onTap: stat.$3,
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(minHeight: 56),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        stat.$1,
                                        style: theme.textTheme.titleLarge?.copyWith(
                                          color: tints.onInk,
                                          fontWeight: FontWeight.w800,
                                          fontFeatures: const [FontFeature.tabularFigures()],
                                        ),
                                      ),
                                      Text(
                                        stat.$2,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: theme.textTheme.labelMedium
                                            ?.copyWith(color: tints.onInkSoft),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}
