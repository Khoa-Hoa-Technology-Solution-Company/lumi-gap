import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  /// True while "Read all" runs, so a second tap cannot send it twice.
  bool _markingAll = false;

  void _showError(Object error) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.t(failureMessageKey(error))),
        backgroundColor: context.lumi.error,
      ),
    );
  }

  Future<void> _markAllRead() async {
    if (_markingAll) return;
    setState(() => _markingAll = true);
    try {
      await ref.read(notificationsApiProvider).markAllRead();
    } on Object catch (e) {
      _showError(e);
    } finally {
      // Reload either way: after a failure the list shows what the server
      // really has.
      ref.invalidate(notificationsProvider);
      if (mounted) setState(() => _markingAll = false);
    }
  }

  Future<void> _open(AppNotification item) async {
    // Open first: a failed "mark as read" must not keep the user from the
    // thing the notification is about.
    final route = notificationRoute(item);
    if (route != null) unawaited(context.push(route));
    if (item.isRead) return;
    try {
      await ref.read(notificationsApiProvider).markRead(item.id);
      ref.invalidate(notificationsProvider);
    } on Object catch (e) {
      _showError(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(notificationsProvider);
    final unreadCount =
        query.value?.where((item) => !item.isRead).length ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Notifications')),
        surfaceTintColor: Colors.transparent,
        actions: [
          TextButton.icon(
            // Nothing to do when everything is read already.
            onPressed: _markingAll || unreadCount == 0
                ? null
                : () => unawaited(_markAllRead()),
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
                  onTap: () => unawaited(_open(item)),
                );
              },
            );
          },
          loading: () => const LumiPageSkeleton(rows: 5, height: 104),
          error: (error, _) =>
              AppErrorState(message: context.t(failureMessageKey(error))),
        ),
      ),
    );
  }
}

/// Screen a notification opens, or null when the app has no screen for it
/// (communities and forum posts live on the web only).
String? notificationRoute(AppNotification item) {
  final id = item.targetId;
  final hasId = id != null && id.isNotEmpty;
  return switch (item.targetKind) {
    'paper' when hasId => '/paper/$id',
    'report' when hasId => '/report/$id',
    'project' when hasId => '/project/$id',
    'gap' || 'gap_analysis' || 'gap_direction' || 'gap_closure_check' =>
      '/gaps',
    _ => null,
  };
}

/// Readable name of what a notification is about, as an English key for
/// `context.t`. Null for a kind this app does not know: an internal code
/// such as "forum_post" is never shown to the user.
String? notificationKindLabel(String? targetKind) => switch (targetKind) {
      'paper' => tk('Paper'),
      'report' => tk('Report'),
      'project' || 'project_chat' || 'project_synthesis' => tk('Project'),
      'community' => tk('Community'),
      'forum_post' => tk('Discussion'),
      'gap' ||
      'gap_analysis' ||
      'gap_direction' ||
      'gap_closure_check' =>
        tk('Research gap'),
      'submission' => tk('Submission'),
      'review_request' || 'paper_review' => tk('Review'),
      'academic_profile' => tk('Profile'),
      'keyword' || 'tag' || 'topic' => tk('Topic'),
      'author' => tk('Author'),
      'payment_order' => tk('Payment'),
      _ => null,
    };

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
                  context.plural(totalCount, one: '{{count}} notification in total', other: '{{count}} notifications in total'),
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
                                        : FontWeight.w600,
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
                              if (notificationKindLabel(item.targetKind)
                                  case final kind?)
                                _NotificationPill(
                                  label: context.t(kind),
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

String _relativeTime(BuildContext context, String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return context.t('recently');
  return relativeTime(parsed.toLocal(), context.appLocale);
}
