import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class MyPapersScreen extends ConsumerWidget {
  const MyPapersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(myPapersProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('My Papers')),
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: context.t('Submit paper'),
            onPressed: () => context.push('/submit-paper'),
            icon: const Icon(Icons.add_circle_outline),
          ),
        ],
      ),
      body: query.when(
        data: (papers) {
          if (papers.isEmpty) {
            return ListView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
              children: [
                AppEmptyState(
                  icon: Icons.archive_outlined,
                  title: context.t('No papers yet'),
                  message: context.t('Submit a paper request to start.'),
                  actionLabel: context.t('Submit paper'),
                  onAction: () => context.push('/submit-paper'),
                ),
              ],
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(myPapersProvider),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              itemBuilder: (context, index) {
                if (index == 0) return _PapersHeader(count: papers.length);
                final paper = papers[index - 1];
                return _PaperRequestCard(
                  paper: paper,
                  onTap: () => context.push('/paper/${paper.id}'),
                );
              },
              separatorBuilder: (_, index) =>
                  SizedBox(height: index == 0 ? 14 : 10),
              itemCount: papers.length + 1,
            ),
          );
        },
        loading: () => const LumiPageSkeleton(height: 104),
        error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
      ),
    );
  }
}

class _PapersHeader extends StatelessWidget {
  const _PapersHeader({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.lumi.primarySoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: context.lumi.primarySoft,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: context.lumi.primarySoft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              Icons.library_books_outlined,
              color: context.lumi.primary,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.plural(count, one: '{{count}} submitted paper', other: '{{count}} submitted papers'),
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  context.t('Track review state, year, and paper details here.'),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.64),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PaperRequestCard extends StatelessWidget {
  const _PaperRequestCard({required this.paper, required this.onTap});

  final Paper paper;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = paper.paperStatus ?? paper.dataStatus;
    final statusColor = _statusColor(context, status);

    return Material(
      color: context.lumi.surface,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: context.lumi.line,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_statusIcon(status), color: statusColor, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      paper.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.28,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _StatusPill(
                          label: context.t(_statusLabel(status)),
                          color: statusColor,
                        ),
                        _MiniMeta(
                          icon: Icons.calendar_today_outlined,
                          label: '${paper.publicationYear}',
                        ),
                        if ((paper.paperKind ?? '').isNotEmpty)
                          _MiniMeta(
                            icon: Icons.article_outlined,
                            label: paper.paperKind!,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right_rounded,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.42),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _MiniMeta extends StatelessWidget {
  const _MiniMeta({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: context.lumi.surfaceMuted,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: context.lumi.line,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: context.lumi.foregroundSecondary),
          const SizedBox(width: 5),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.68),
            ),
          ),
        ],
      ),
    );
  }
}

String _statusLabel(String status) {
  final normalized = status.toLowerCase().replaceAll('_', ' ');
  if (normalized.contains('pending')) return tk('Pending review');
  if (normalized.contains('approve') || normalized.contains('active')) {
    return tk('Approved');
  }
  if (normalized.contains('reject')) return tk('Rejected');
  if (normalized.contains('download')) return tk('Downloaded');
  return normalized.isEmpty ? tk('Unknown') : normalized;
}

Color _statusColor(BuildContext context, String status) {
  final normalized = status.toLowerCase();
  if (normalized.contains('pending')) return context.lumi.warning;
  if (normalized.contains('approve') || normalized.contains('active')) {
    return context.lumi.success;
  }
  if (normalized.contains('reject')) return context.lumi.error;
  if (normalized.contains('download')) return context.lumi.primary;
  return context.lumi.foregroundSecondary;
}

IconData _statusIcon(String status) {
  final normalized = status.toLowerCase();
  if (normalized.contains('pending')) return Icons.hourglass_top_rounded;
  if (normalized.contains('approve') || normalized.contains('active')) {
    return Icons.verified_outlined;
  }
  if (normalized.contains('reject')) return Icons.report_gmailerrorred_outlined;
  if (normalized.contains('download')) return Icons.download_done_outlined;
  return Icons.article_outlined;
}
