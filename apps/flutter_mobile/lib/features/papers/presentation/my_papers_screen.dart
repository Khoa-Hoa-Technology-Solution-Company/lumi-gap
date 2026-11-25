import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/domain/paper_request_state.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The papers the user requested or uploaded, with where each one stands.
/// Submitting a new one starts here: this is its one entry in the app.
class MyPapersScreen extends ConsumerWidget {
  const MyPapersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(myPapersProvider);
    final theme = Theme.of(context);
    final lumi = context.lumi;
    void submit() => unawaited(context.push('/submit-paper'));

    final Widget body;
    if (query.hasValue) {
      final papers = query.requireValue;
      body = papers.isEmpty
          ? LumiEmptyState(
              icon: Icons.description_outlined,
              title: context.t('No papers yet'),
              message: context.t('Submit a paper request to start.'),
              actionLabel: context.t('Submit paper'),
              onAction: submit,
            )
          : ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 96),
              children: [
                Text(
                  context.plural(
                    papers.length,
                    one: '{{count}} submitted paper',
                    other: '{{count}} submitted papers',
                  ),
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
                const SizedBox(height: 12),
                LumiRowGroup(
                  children: [
                    for (final paper in papers)
                      _PaperRequestRow(
                        paper: paper,
                        onTap: () =>
                            unawaited(context.push('/paper/${paper.id}')),
                      ),
                  ],
                ),
              ],
            );
    } else if (query.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(query.error!)),
        retrying: query.isLoading,
        onRetry: () => ref.invalidate(myPapersProvider),
      );
    } else {
      body = const LumiPageSkeleton(height: 88);
    }

    return Scaffold(
      appBar: AppBar(title: Text(context.t('My papers'))),
      // The empty list carries the same action in its message.
      floatingActionButton: query.value?.isNotEmpty ?? false
          ? FloatingActionButton.extended(
              onPressed: submit,
              icon: const Icon(Icons.add),
              label: Text(context.t('Submit paper')),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myPapersProvider),
        child: body,
      ),
    );
  }
}

class _PaperRequestRow extends StatelessWidget {
  const _PaperRequestRow({required this.paper, required this.onTap});

  final Paper paper;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final state = PaperRequestState.of(
      paperStatus: paper.paperStatus,
      dataStatus: paper.dataStatus,
    );
    final reason = paper.rejectionReason?.trim() ?? '';
    final meta = [
      if (paper.publicationYear > 0) '${paper.publicationYear}',
      if ((paper.paperKind ?? '').trim().isNotEmpty) paper.paperKind!.trim(),
    ].join(' · ');

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 12, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    paper.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      LumiChip(
                        label: context.t(state.label),
                        tone: state.tone,
                        icon: state.icon,
                      ),
                      if (meta.isNotEmpty)
                        Text(
                          meta,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: lumi.foregroundSecondary),
                        ),
                    ],
                  ),
                  // Why it was refused, as the reviewer wrote it.
                  if (state == PaperRequestState.rejected && reason.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      context.t('Reason: {{reason}}', {'reason': reason}),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: lumi.foreground),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, size: 20, color: lumi.muted),
          ],
        ),
      ),
    );
  }
}
