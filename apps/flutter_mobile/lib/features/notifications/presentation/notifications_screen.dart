import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
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
        title: Text(context.t('Notifications')),
        surfaceTintColor: Colors.transparent,
        actions: [
          TextButton.icon(
            onPressed: () async {
              await ref.read(notificationsApiProvider).markAllRead();
              ref.invalidate(notificationsProvider);
            },
            icon: const Icon(Icons.done_all_rounded, size: 18),
            label: Text(context.t('Read all')),
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
                children: [
                  AppEmptyState(
                    icon: Icons.notifications_none,
                    title: context.t('No notifications'),
                    message: context.t('Research activity will appear here.'),
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
          loading: () => AppLoading(
            fullScreen: true,
            message: context.t('Loading notifications...'),
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
    final lumi = context.lumi;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: lumi.primarySoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: lumi.line),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: lumi.surface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              Icons.notifications_active_outlined,
              color: lumi.primary,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.t('{{unreadCount}} unread updates', {'unreadCount': unreadCount}),
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  context.t('{{totalCount}} total alerts from papers, projects, and reports.', {'totalCount': totalCount}),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: lumi.foregroundSecondary),
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
    final lumi = context.lumi;
    final accent = _notificationColor(item, lumi);

    return Material(
      color: lumi.surface,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: item.isRead ? lumi.line : accent,
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
                        color: lumi.surfaceMuted,
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
                                        ? FontWeight.w500
                                        : FontWeight.w700,
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
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: lumi.foregroundSecondary,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _NotificationPill(
                                label: context.t(_notificationTypeLabel(item)),
                                color: accent,
                              ),
                              _NotificationPill(
                                label: _relativeTime(context, item.createdAt),
                                color: lumi.muted,
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
    final lumi = context.lumi;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: lumi.surfaceMuted,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelMedium?.copyWith(
          color: muted ? lumi.foregroundSecondary : color,
        ),
      ),
    );
  }
}

Color _notificationColor(AppNotification item, LumiColors lumi) {
  final value = '${item.type ?? ''} ${item.targetKind ?? ''} ${item.title}'
      .toLowerCase();
  if (value.contains('approve') || value.contains('level')) return lumi.success;
  if (value.contains('pending')) return lumi.warning;
  if (value.contains('report')) return lumi.foregroundSecondary;
  return lumi.primary;
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
  return item.isRead ? tk('Read') : tk('New');
}

String _relativeTime(BuildContext context, String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return context.t('recently');
  return relativeTime(parsed.toLocal(), context.appLocale);
}
