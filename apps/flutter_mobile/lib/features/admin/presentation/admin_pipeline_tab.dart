import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/admin/data/admin_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Pipeline health: Redis, workers, queue backlogs and diagnostics.
class AdminPipelineTab extends ConsumerWidget {
  const AdminPipelineTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    final pipelineQuery = ref.watch(pipelineStatusProvider);

    return pipelineQuery.when(
      data: (status) {
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // General health cards
            Row(
              children: [
                Expanded(
                  child: Card(
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(color: theme.dividerColor),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Icon(
                            status.redisOk ? Icons.check_circle : Icons.error,
                            color: status.redisOk ? context.lumi.success : context.lumi.error,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(context.t('Redis database'), style: context.type.bodySmall!.copyWith( color: context.lumi.muted)),
                                Text(status.redisOk ? context.t('Connected') : context.t('Offline'), style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600,)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Card(
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(color: theme.dividerColor),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Icon(Icons.engineering, color: context.lumi.primary, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(context.t('Active workers'), style: context.type.bodySmall!.copyWith( color: context.lumi.muted)),
                                Text('${status.workers.alive} / ${status.workers.expected}', style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600,)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            Text(context.t('Queue worker backlogs'), style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,)),
            const SizedBox(height: 10),
            ...status.queues.map((q) {
              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: theme.dividerColor),
                ),
                child: ListTile(
                  title: Text(q.label, style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,)),
                  subtitle: Text(context.t('Waiting: {{waiting}} · Active: {{active}} · Failed: {{failed}}', {'waiting': q.waiting, 'active': q.active, 'failed': q.failed})),
                  trailing: switch (queueHealth(q)) {
                    QueueHealth.failing => Icon(
                        Icons.error_outline,
                        color: context.lumi.error,
                        size: 20,
                        semanticLabel: context.t('Has failed jobs'),
                      ),
                    QueueHealth.backlogged => Icon(
                        Icons.warning_amber_rounded,
                        color: context.lumi.warning,
                        size: 20,
                        semanticLabel: context.t('Backlogged'),
                      ),
                    QueueHealth.healthy => Icon(
                        Icons.check,
                        color: context.lumi.success,
                        size: 20,
                        semanticLabel: context.t('Healthy'),
                      ),
                  },
                ),
              );
            }),
            const SizedBox(height: 20),

            if (status.recommendations.isNotEmpty) ...[
              Text(context.t('Pipeline diagnostics'), style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,)),
              const SizedBox(height: 10),
              ...status.recommendations.map((rec) {
                final color = rec.severity == 'critical'
                    ? context.lumi.error
                    : rec.severity == 'warning'
                        ? context.lumi.warning
                        : context.lumi.primary;

                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.08),
                    border: Border.all(color: color.withValues(alpha: 0.2)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, color: color, size: 18),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(rec.title, style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600, color: color)),
                            const SizedBox(height: 2),
                            Text(rec.description, style: context.type.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ],
        );
      },
      loading: () => const LumiPageSkeleton(rows: 5, height: 72),
      error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
    );
  }
}

enum QueueHealth { healthy, backlogged, failing }

/// A queue with failed jobs is never shown as healthy: failures come first,
/// then a backlog. The count is checked too, in case a payload has the
/// number but not the flag.
QueueHealth queueHealth(PipelineQueueStatus q) {
  if (q.hasFailures || q.failed > 0) return QueueHealth.failing;
  if (q.isBacklogged) return QueueHealth.backlogged;
  return QueueHealth.healthy;
}
