import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
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
          const SnackBar(content: Text('Sync run triggered successfully.')),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to trigger sync: $e'), backgroundColor: Colors.red),
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
          const SnackBar(content: Text('Embedding calculation started.')),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to start embedding: $e'), backgroundColor: Colors.red),
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
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('TRIGGER NEW SYNC', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
                const SizedBox(height: 12),
                TextField(
                  controller: searchText,
                  decoration: InputDecoration(
                    labelText: 'Search text (e.g. quantum computing)',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: yearFrom,
                        decoration: InputDecoration(
                          labelText: 'Year from',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: maxPages,
                        decoration: InputDecoration(
                          labelText: 'Max pages',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
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
                      backgroundColor: const Color(0xFF06B6D4),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: _syncing ? null : _sync,
                    icon: _syncing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.sync, color: Colors.white),
                    label: const Text('Start OpenAlex Sync', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        const Text('Sync Runs History', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 10),
        runs.when(
          data: (items) => Column(
            children: items.map((run) {
              final statusColor = run.status == 'completed'
                  ? const Color(0xFF10B981)
                  : run.status == 'failed'
                      ? const Color(0xFFEF4444)
                      : const Color(0xFFF59E0B);

              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: theme.dividerColor),
                ),
                child: ListTile(
                  title: Text(run.searchText, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 4),
                      Text('Fetched: ${run.totalFetched} · Inserted: ${run.totalInserted}'),
                      if (run.errorMessage != null) ...[
                        const SizedBox(height: 4),
                        Text(run.errorMessage!, style: const TextStyle(color: Colors.red, fontSize: 11)),
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
                      run.status.toUpperCase(),
                      style: TextStyle(color: statusColor, fontSize: 9, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          loading: () => const AppLoading(message: 'Loading runs...'),
          error: (error, _) => AppErrorState(message: error.toString()),
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
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: theme.dividerColor),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('EMBEDDING CALCULATIONS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Embedding Coverage', style: TextStyle(fontWeight: FontWeight.bold)),
                            Text('${pct.toStringAsFixed(1)}%', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF06B6D4))),
                          ],
                        ),
                        const SizedBox(height: 8),
                        LinearProgressIndicator(
                          value: pct / 100,
                          backgroundColor: theme.dividerColor,
                          color: const Color(0xFF06B6D4),
                          minHeight: 8,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            Column(
                              children: [
                                const Text('Analyzable', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                                const SizedBox(height: 4),
                                Text('${status.analyzable}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              ],
                            ),
                            Column(
                              children: [
                                const Text('Embedded', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                                const SizedBox(height: 4),
                                Text('${status.embedded}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                              ],
                            ),
                            Column(
                              children: [
                                const Text('Pending', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                                const SizedBox(height: 4),
                                Text('${status.pending}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFFF59E0B))),
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
                              backgroundColor: const Color(0xFF8B5CF6),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: _embedding ? null : _triggerEmbedding,
                            icon: const Icon(Icons.bolt, color: Colors.white),
                            label: const Text('Trigger Embedding Job', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () => const AppLoading(message: 'Loading embedding status...'),
          error: (error, _) => AppErrorState(message: error.toString()),
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
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: theme.dividerColor),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Icon(
                            status.redisOk ? Icons.check_circle : Icons.error,
                            color: status.redisOk ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Redis Database', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                                Text(status.redisOk ? 'Connected' : 'Offline', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
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
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: theme.dividerColor),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.engineering, color: Color(0xFF06B6D4), size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Active Workers', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                                Text('${status.workers.alive} / ${status.workers.expected}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
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

            const Text('Queue Worker Backlogs', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            const SizedBox(height: 10),
            ...status.queues.map((q) {
              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: theme.dividerColor),
                ),
                child: ListTile(
                  title: Text(q.label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  subtitle: Text('Waiting: ${q.waiting} · Active: ${q.active} · Failed: ${q.failed}'),
                  trailing: q.isBacklogged
                      ? const Icon(Icons.warning, color: Colors.orange, size: 20)
                      : const Icon(Icons.check, color: Colors.green, size: 20),
                ),
              );
            }),
            const SizedBox(height: 20),

            if (status.recommendations.isNotEmpty) ...[
              const Text('Pipeline Diagnostics', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(height: 10),
              ...status.recommendations.map((rec) {
                final color = rec.severity == 'critical'
                    ? const Color(0xFFEF4444)
                    : rec.severity == 'warning'
                        ? const Color(0xFFF59E0B)
                        : const Color(0xFF06B6D4);

                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.08),
                    border: Border.all(color: color.withValues(alpha: 0.2)),
                    borderRadius: BorderRadius.circular(12),
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
                            Text(rec.title, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: color)),
                            const SizedBox(height: 2),
                            Text(rec.description, style: const TextStyle(fontSize: 11)),
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
      loading: () => const AppLoading(message: 'Loading pipeline status...'),
      error: (error, _) => AppErrorState(message: error.toString()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    if (user?.role != UserRole.admin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Admin System Workbench')),
        body: const Center(child: Text('Access denied. Admin role required.', style: TextStyle(color: Colors.red))),
      );
    }

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: isDark ? const Color(0xFF0F1B2D) : theme.scaffoldBackgroundColor,
        appBar: AppBar(
          title: const Text('System Workbench', style: TextStyle(fontWeight: FontWeight.bold)),
          backgroundColor: Colors.transparent,
          elevation: 0,
          bottom: const TabBar(
            indicatorColor: Color(0xFF06B6D4),
            labelColor: Color(0xFF06B6D4),
            unselectedLabelColor: Color(0xFF94A3B8),
            tabs: [
              Tab(text: 'Sync Runs'),
              Tab(text: 'Embeddings'),
              Tab(text: 'Pipeline Health'),
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
