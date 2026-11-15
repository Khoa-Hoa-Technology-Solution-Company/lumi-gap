import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/admin/data/admin_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AdminSyncScreen extends ConsumerStatefulWidget {
  const AdminSyncScreen({super.key});

  @override
  ConsumerState<AdminSyncScreen> createState() => _AdminSyncScreenState();
}

class _AdminSyncScreenState extends ConsumerState<AdminSyncScreen> {
  // i18n-ignore: default search query sent to OpenAlex, not UI text
  final searchText = TextEditingController(text: 'large language models');
  final yearFrom = TextEditingController(text: '2020');
  final maxPages = TextEditingController(text: '1');
  bool _syncing = false;
  bool _embedding = false;

  @override
  void dispose() {
    searchText.dispose();
    yearFrom.dispose();
    maxPages.dispose();
    super.dispose();
  }

  Future<void> _sync() async {
    setState(() => _syncing = true);
    try {
      await ref.read(adminApiProvider).triggerSync(
            searchText: searchText.text.trim(),
            yearFrom: int.tryParse(yearFrom.text),
            maxPages: int.tryParse(maxPages.text),
          );
      ref.invalidate(syncRunsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Sync run triggered successfully.'))),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Failed to trigger sync: {{e}}', {'e': context.t(failureMessageKey(e))})), backgroundColor: context.lumi.error),
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _triggerEmbedding() async {
    setState(() => _embedding = true);
    try {
      await ref.read(adminApiProvider).triggerEmbedding();
      ref.invalidate(embeddingStatusProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Embedding calculation started.'))),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Failed to start embedding: {{e}}', {'e': context.t(failureMessageKey(e))})), backgroundColor: context.lumi.error),
        );
      }
    } finally {
      if (mounted) setState(() => _embedding = false);
    }
  }

  Widget _buildSyncTab(WidgetRef ref, ThemeData theme, bool isDark) {
    final runs = ref.watch(syncRunsProvider);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.t('TRIGGER NEW SYNC'), style: context.type.bodySmall!.copyWith( fontWeight: FontWeight.w600, color: context.lumi.muted)),
                const SizedBox(height: 12),
                TextField(
                  controller: searchText,
                  decoration: InputDecoration(
                    labelText: context.t('Search text (e.g. quantum computing)'),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: yearFrom,
                        decoration: InputDecoration(
                          labelText: context.t('Year from'),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: maxPages,
                        decoration: InputDecoration(
                          labelText: context.t('Max pages'),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: context.lumi.primary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: _syncing ? null : _sync,
                    icon: _syncing
                        ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: context.lumi.surface))
                        : Icon(Icons.sync, color: context.lumi.surface),
                    label: Text(context.t('Start OpenAlex Sync'), style: TextStyle(color: context.lumi.onPrimary, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(context.t('Sync Runs History'), style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,)),
        const SizedBox(height: 10),
        runs.when(
          data: (items) => Column(
            children: items.map((run) {
              final (statusKey, statusTone) = syncRunStatus(run.status);
              final statusColor = switch (statusTone) {
                SyncRunTone.success => context.lumi.success,
                SyncRunTone.error => context.lumi.error,
                SyncRunTone.active => context.lumi.primary,
                SyncRunTone.neutral => context.lumi.muted,
              };

              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(color: theme.dividerColor),
                ),
                child: ListTile(
                  title: Text(run.searchText, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 4),
                      Text(context.t('Fetched: {{totalFetched}} · Inserted: {{totalInserted}}', {'totalFetched': run.totalFetched, 'totalInserted': run.totalInserted})),
                      if (run.errorMessage != null) ...[
                        const SizedBox(height: 4),
                        Text(run.errorMessage!, style: context.type.bodySmall!.copyWith(color: context.lumi.error,)),
                      ],
                    ],
                  ),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      context.t(statusKey),
                      style: context.type.bodySmall!.copyWith(color: statusColor, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          loading: () => const LumiSkeleton(rows: 3),
          error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
        ),
      ],
    );
  }

  Widget _buildEmbeddingsTab(WidgetRef ref, ThemeData theme, bool isDark) {
    final statusQuery = ref.watch(embeddingStatusProvider);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        statusQuery.when(
          data: (status) {
            final pct = status.analyzable > 0 ? (status.embedded / status.analyzable) * 100 : 0.0;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: BorderSide(color: theme.dividerColor),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(context.t('EMBEDDING CALCULATIONS'), style: context.type.bodySmall!.copyWith( fontWeight: FontWeight.w600, color: context.lumi.muted)),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(context.t('Embedding Coverage'), style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text('${pct.toStringAsFixed(1)}%', style: TextStyle(fontWeight: FontWeight.w600, color: context.lumi.primary)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        LinearProgressIndicator(
                          value: pct / 100,
                          backgroundColor: theme.dividerColor,
                          color: context.lumi.primary,
                          minHeight: 8,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            Column(
                              children: [
                                Text(context.t('Analyzable'), style: context.type.bodySmall!.copyWith( color: context.lumi.muted)),
                                const SizedBox(height: 4),
                                Text('${status.analyzable}', style: context.type.bodyLarge!.copyWith( fontWeight: FontWeight.w600)),
                              ],
                            ),
                            Column(
                              children: [
                                Text(context.t('Embedded'), style: context.type.bodySmall!.copyWith( color: context.lumi.muted)),
                                const SizedBox(height: 4),
                                Text('${status.embedded}', style: context.type.bodyLarge!.copyWith( fontWeight: FontWeight.w600, color: context.lumi.success)),
                              ],
                            ),
                            Column(
                              children: [
                                Text(context.t('Pending'), style: context.type.bodySmall!.copyWith( color: context.lumi.muted)),
                                const SizedBox(height: 4),
                                Text('${status.pending}', style: context.type.bodyLarge!.copyWith( fontWeight: FontWeight.w600, color: context.lumi.warning)),
                              ],
                            ),
                          ],
                        ),
                        const Divider(height: 32),
                        SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: context.lumi.primary,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: _embedding ? null : _triggerEmbedding,
                            icon: Icon(Icons.memory_outlined, color: context.lumi.onPrimary),
                            label: Text(context.t('Trigger Embedding Job'), style: TextStyle(color: context.lumi.onPrimary, fontWeight: FontWeight.w600)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () => const LumiSkeleton(rows: 1, height: 220),
          error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
        ),
      ],
    );
  }

  Widget _buildPipelineTab(WidgetRef ref, ThemeData theme, bool isDark) {
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
                      borderRadius: BorderRadius.circular(8),
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
                                Text(context.t('Redis Database'), style: context.type.bodySmall!.copyWith( color: context.lumi.muted)),
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
                      borderRadius: BorderRadius.circular(8),
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
                                Text(context.t('Active Workers'), style: context.type.bodySmall!.copyWith( color: context.lumi.muted)),
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

            Text(context.t('Queue Worker Backlogs'), style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,)),
            const SizedBox(height: 10),
            ...status.queues.map((q) {
              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
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
              Text(context.t('Pipeline Diagnostics'), style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,)),
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

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    if (user?.role != UserRole.admin) {
      return Scaffold(
        appBar: AppBar(title: Text(context.t('Admin System Workbench'))),
        body: Center(child: Text(context.t('Access denied. Admin role required.'), style: TextStyle(color: context.lumi.error))),
      );
    }

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        // The theme's app bar: a transparent one made Android draw light
        // status bar icons over the light page.
        appBar: AppBar(
          title: Text(context.t('System Workbench')),
          bottom: TabBar(
            // Scrolls instead of clipping labels on a narrow screen.
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            indicatorColor: context.lumi.primary,
            labelColor: context.lumi.primary,
            unselectedLabelColor: context.lumi.muted,
            tabs: [
              Tab(text: context.t('Sync Runs')),
              Tab(text: context.t('Embeddings')),
              Tab(text: context.t('Pipeline Health')),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildSyncTab(ref, theme, isDark),
            _buildEmbeddingsTab(ref, theme, isDark),
            _buildPipelineTab(ref, theme, isDark),
          ],
        ),
      ),
    );
  }
}

enum SyncRunTone { success, error, active, neutral }

/// Label (an English key for `context.t`) and tone of a sync run status.
/// The backend sends running, succeeded, failed or cancelled; anything else
/// is shown as unknown rather than as a raw code.
(String, SyncRunTone) syncRunStatus(String status) =>
    switch (status.trim().toLowerCase()) {
      'succeeded' || 'completed' => (tk('Succeeded'), SyncRunTone.success),
      'failed' => (tk('Failed'), SyncRunTone.error),
      'running' || 'queued' => (tk('Running'), SyncRunTone.active),
      'cancelled' || 'canceled' => (tk('Cancelled'), SyncRunTone.neutral),
      _ => (tk('Unknown'), SyncRunTone.neutral),
    };

enum QueueHealth { healthy, backlogged, failing }

/// A queue with failed jobs is never shown as healthy: failures come first,
/// then a backlog. The count is checked too, in case a payload has the
/// number but not the flag.
QueueHealth queueHealth(PipelineQueueStatus q) {
  if (q.hasFailures || q.failed > 0) return QueueHealth.failing;
  if (q.isBacklogged) return QueueHealth.backlogged;
  return QueueHealth.healthy;
}
