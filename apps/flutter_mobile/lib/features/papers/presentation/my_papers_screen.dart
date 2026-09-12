import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
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
        title: const Text('My Papers'),
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Submit paper',
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
                  title: 'No papers yet',
                  message: 'Submit a paper request to start.',
                  actionLabel: 'Submit paper',
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
        loading: () => const AppLoading(
          fullScreen: true,
          message: 'Loading your papers...',
        ),
        error: (error, _) => AppErrorState(message: error.toString()),
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
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF111C2E) : const Color(0xFFEEF7FF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isDark ? const Color(0xFF26334A) : const Color(0xFFD7E9FF),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFF06B6D4).withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.library_books_outlined,
              color: Color(0xFF0891B2),
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$count submitted ${count == 1 ? 'paper' : 'papers'}',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Track review state, year, and paper details here.',
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
    final isDark = theme.brightness == Brightness.dark;
    final status = paper.paperStatus ?? paper.dataStatus;
    final statusColor = _statusColor(status);

    return Material(
      color: isDark ? const Color(0xFF111C2E) : Colors.white,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isDark ? const Color(0xFF26334A) : const Color(0xFFE2E8F0),
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
                        fontWeight: FontWeight.w800,
                        height: 1.28,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _StatusPill(
                          label: _statusLabel(status),
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
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w900,
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
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF172338) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: isDark ? const Color(0xFF26334A) : const Color(0xFFE2E8F0),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: const Color(0xFF64748B)),
          const SizedBox(width: 5),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
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
  if (normalized.contains('pending')) return 'Pending review';
  if (normalized.contains('approve') || normalized.contains('active')) {
    return 'Approved';
  }
  if (normalized.contains('reject')) return 'Rejected';
  if (normalized.contains('download')) return 'Downloaded';
  return normalized.isEmpty ? 'Unknown' : normalized;
}

Color _statusColor(String status) {
  final normalized = status.toLowerCase();
  if (normalized.contains('pending')) return const Color(0xFFF59E0B);
  if (normalized.contains('approve') || normalized.contains('active')) {
    return const Color(0xFF16A34A);
  }
  if (normalized.contains('reject')) return const Color(0xFFDC2626);
  if (normalized.contains('download')) return const Color(0xFF1D4ED8);
  return const Color(0xFF64748B);
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
