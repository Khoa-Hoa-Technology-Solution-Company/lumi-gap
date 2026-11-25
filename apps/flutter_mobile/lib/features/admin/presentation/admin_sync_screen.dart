import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/admin/data/admin_api.dart';
import 'package:flutter_mobile/features/admin/presentation/admin_pipeline_tab.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AdminSyncScreen extends ConsumerStatefulWidget {
  const AdminSyncScreen({super.key});

  @override
  ConsumerState<AdminSyncScreen> createState() => _AdminSyncScreenState();
}

class _AdminSyncScreenState extends ConsumerState<AdminSyncScreen> {
  // Empty on purpose: a sync is costly, so its query is always typed.
  final searchText = TextEditingController();
  final yearFrom = TextEditingController(text: '2020');
  final maxPages = TextEditingController(text: '1');
  bool _syncing = false;
  bool _showSyncErrors = false;
  bool _embedding = false;

  @override
  void dispose() {
    searchText.dispose();
    yearFrom.dispose();
    maxPages.dispose();
    super.dispose();
  }

  Future<void> _sync() async {
    if (_syncing) return;
    final errors = syncFormErrors(
      searchText: searchText.text,
      yearFrom: yearFrom.text,
      maxPages: maxPages.text,
    );
    if (errors.isNotEmpty) {
      setState(() => _showSyncErrors = true);
      return;
    }
    setState(() => _syncing = true);
    try {
      await ref.read(adminApiProvider).triggerSync(
            searchText: searchText.text.trim(),
            yearFrom: int.parse(yearFrom.text.trim()),
            maxPages: int.parse(maxPages.text.trim()),
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
    final errors = _showSyncErrors
        ? syncFormErrors(
            searchText: searchText.text,
            yearFrom: yearFrom.text,
            maxPages: maxPages.text,
          )
        : const <String, String>{};
    String? err(String field) =>
        errors[field] == null ? null : context.t(errors[field]!);

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
                Text(context.t('New sync'), style: context.type.bodySmall!.copyWith( fontWeight: FontWeight.w600, color: context.lumi.muted)),
                const SizedBox(height: 12),
                TextField(
                  controller: searchText,
                  onChanged: (_) {
                    if (_showSyncErrors) setState(() {});
                  },
                  decoration: InputDecoration(
                    labelText: context.t('Search text (e.g. quantum computing)'),
                    errorText: err('searchText'),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: yearFrom,
                        onChanged: (_) {
                          if (_showSyncErrors) setState(() {});
                        },
                        decoration: InputDecoration(
                          labelText: context.t('Year from'),
                          errorText: err('yearFrom'),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: maxPages,
                        onChanged: (_) {
                          if (_showSyncErrors) setState(() {});
                        },
                        decoration: InputDecoration(
                          labelText: context.t('Max pages'),
                          errorText: err('maxPages'),
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
                    label: Text(context.t('Start OpenAlex sync'), style: TextStyle(color: context.lumi.onPrimary, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(context.t('Sync runs history'), style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,)),
        const SizedBox(height: 10),
        runs.when(
          data: (items) => Column(
            children: items.map((run) {
              final (statusKey, statusTone) = syncRunStatus(run.status);
              // The shared chip: its tone pairs are contrast-tested.
              final chipTone = switch (statusTone) {
                SyncRunTone.success => LumiChipTone.success,
                SyncRunTone.error => LumiChipTone.error,
                SyncRunTone.active => LumiChipTone.primary,
                SyncRunTone.neutral => LumiChipTone.neutral,
              };

              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
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
                  trailing: LumiChip(label: context.t(statusKey), tone: chipTone),
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
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: theme.dividerColor),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(context.t('Embeddings'), style: context.type.bodySmall!.copyWith( fontWeight: FontWeight.w600, color: context.lumi.muted)),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(context.t('Embedding coverage'), style: const TextStyle(fontWeight: FontWeight.w600)),
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
                            label: Text(context.t('Trigger embedding job'), style: TextStyle(color: context.lumi.onPrimary, fontWeight: FontWeight.w600)),
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

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    if (user?.role != UserRole.admin) {
      return Scaffold(
        appBar: AppBar(title: Text(context.t('Admin sync'))),
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
          title: Text(context.t('Admin sync')),
          bottom: TabBar(
            // Scrolls instead of clipping labels on a narrow screen.
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            // On the blue app bar.
            indicatorColor: context.tints.onHero,
            labelColor: context.tints.onHero,
            unselectedLabelColor: context.tints.onHeroSoft,
            dividerHeight: 0,
            tabs: [
              Tab(text: context.t('Sync runs')),
              Tab(text: context.t('Embeddings')),
              Tab(text: context.t('Pipeline health')),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildSyncTab(ref, theme, isDark),
            _buildEmbeddingsTab(ref, theme, isDark),
            const AdminPipelineTab(),
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

/// Errors of the sync form, by field, as `context.t` keys. Same bounds as
/// the API (`trigger-sync.schema.ts`); a field that does not parse is an
/// error, never silently replaced by the server's default.
Map<String, String> syncFormErrors({
  required String searchText,
  required String yearFrom,
  required String maxPages,
}) {
  final errors = <String, String>{};
  if (searchText.trim().isEmpty) {
    errors['searchText'] = tk('Enter what to search for.');
  }
  final year = int.tryParse(yearFrom.trim());
  if (year == null || year < 1900 || year > 2100) {
    errors['yearFrom'] = tk('Enter a year between 1900 and 2100.');
  }
  final pages = int.tryParse(maxPages.trim());
  if (pages == null || pages < 1 || pages > 50) {
    errors['maxPages'] = tk('Enter a number from 1 to 50.');
  }
  return errors;
}
