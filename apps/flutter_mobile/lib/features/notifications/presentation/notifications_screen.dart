import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        surfaceTintColor: Colors.transparent,
        actions: [
          TextButton.icon(
            onPressed: () async {
              await ref.read(notificationsApiProvider).markAllRead();
              ref.invalidate(notificationsProvider);
            },
            icon: const Icon(Icons.done_all_rounded, size: 18),
            label: const Text('Read all'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(notificationsProvider),
        child: query.when(
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(24),
                children: const [
                  AppEmptyState(
                    icon: Icons.notifications_none,
                    title: 'No notifications',
                    message: 'Research activity will appear here.',
                  ),
                ],
              );
            }
            final unreadCount = items.where((item) => !item.isRead).length;
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 112),
              itemCount: items.length + 1,
              separatorBuilder: (_, index) =>
                  SizedBox(height: index == 0 ? 14 : 10),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return _NotificationsHeader(
                    totalCount: items.length,
                    unreadCount: unreadCount,
                  );
                }
                final item = items[index - 1];
                return _NotificationCard(
                  item: item,
                  onTap: () async {
                    await ref.read(notificationsApiProvider).markRead(item.id);
                    ref.invalidate(notificationsProvider);
                    if (!context.mounted) return;
                    _openTarget(context, item);
                  },
                );
              },
            );
          },
          loading: () => const AppLoading(
            fullScreen: true,
            message: 'Loading notifications...',
          ),
          error: (error, _) => AppErrorState(message: error.toString()),
        ),
      ),
    );
  }

  void _openTarget(BuildContext context, AppNotification item) {
    if (item.targetKind == 'paper' && item.targetId != null) {
      unawaited(context.push('/paper/${item.targetId}'));
    }
    if (item.targetKind == 'report' && item.targetId != null) {
      unawaited(context.push('/report/${item.targetId}'));
    }
    if (item.targetKind == 'project' && item.targetId != null) {
      unawaited(context.push('/project/${item.targetId}'));
    }
    if (item.targetKind == 'gap') unawaited(context.push('/gaps'));
  }
}

class _NotificationsHeader extends StatelessWidget {
  const _NotificationsHeader({
    required this.totalCount,
    required this.unreadCount,
  });

  final int totalCount;
  final int unreadCount;

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
              color: const Color(0xFF1D4ED8).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.notifications_active_outlined,
              color: Color(0xFF1D4ED8),
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$unreadCount unread updates',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$totalCount total alerts from papers, projects, and reports.',
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

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.item, required this.onTap});

  final AppNotification item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final accent = _notificationColor(item);

    return Material(
      color: isDark ? const Color(0xFF111C2E) : Colors.white,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: item.isRead
                  ? (isDark ? const Color(0xFF26334A) : const Color(0xFFE2E8F0))
                  : accent.withValues(alpha: 0.38),
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: item.isRead ? Colors.transparent : accent,
                    borderRadius: const BorderRadius.horizontal(
                      left: Radius.circular(8),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: accent.withValues(
                          alpha: item.isRead ? 0.08 : 0.14,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        _notificationIcon(item),
                        color: accent,
                        size: 21,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  item.title,
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: item.isRead
                                        ? FontWeight.w700
                                        : FontWeight.w900,
                                    height: 1.25,
                                  ),
                                ),
                              ),
                              if (!item.isRead) ...[
                                const SizedBox(width: 8),
                                Container(
                                  width: 8,
                                  height: 8,
                                  margin: const EdgeInsets.only(top: 5),
                                  decoration: BoxDecoration(
                                    color: accent,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 5),
                          Text(
                            item.message,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurface.withValues(
                                alpha: 0.68,
                              ),
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _NotificationPill(
                                label: _notificationTypeLabel(item),
                                color: accent,
                              ),
                              _NotificationPill(
                                label: _relativeTime(item.createdAt),
                                color: const Color(0xFF64748B),
                                muted: true,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationPill extends StatelessWidget {
  const _NotificationPill({
    required this.label,
    required this.color,
    this.muted = false,
  });

  final String label;
  final Color color;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: muted ? 0.08 : 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: muted
              ? theme.colorScheme.onSurface.withValues(alpha: 0.58)
              : color,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

Color _notificationColor(AppNotification item) {
  final value = '${item.type ?? ''} ${item.targetKind ?? ''} ${item.title}'
      .toLowerCase();
  if (value.contains('project') || value.contains('team')) {
    return const Color(0xFF06B6D4);
  }
  if (value.contains('approve') || value.contains('level')) {
    return const Color(0xFF16A34A);
  }
  if (value.contains('pending')) return const Color(0xFFF59E0B);
  if (value.contains('report')) return const Color(0xFF8B5CF6);
  return const Color(0xFF1D4ED8);
}

IconData _notificationIcon(AppNotification item) {
  final value = '${item.type ?? ''} ${item.targetKind ?? ''} ${item.title}'
      .toLowerCase();
  if (value.contains('project') || value.contains('team')) {
    return Icons.forum_outlined;
  }
  if (value.contains('approve')) return Icons.verified_outlined;
  if (value.contains('pending')) return Icons.hourglass_top_outlined;
  if (value.contains('level')) return Icons.workspace_premium_outlined;
  if (value.contains('report')) return Icons.summarize_outlined;
  return Icons.notifications_outlined;
}

String _notificationTypeLabel(AppNotification item) {
  if (item.targetKind?.isNotEmpty == true) return item.targetKind!;
  if (item.type?.isNotEmpty == true) return item.type!;
  return item.isRead ? 'Read' : 'New';
}

String _relativeTime(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return 'recently';
  final diff = DateTime.now().difference(parsed.toLocal());
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return '${parsed.year}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')}';
}
