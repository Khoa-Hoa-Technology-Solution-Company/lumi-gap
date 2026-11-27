import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_swipe_action.dart';
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

  /// Marked read here but not yet confirmed by a reload: shown as read.
  final Set<String> _readLocally = {};

  bool _isRead(AppNotification item) =>
      item.isRead || _readLocally.contains(item.id);

  /// Swipe or sheet: mark one notification read without opening it. The row
  /// stays in the list (the backend has no delete); a failure shows it
  /// unread again.
  Future<void> _markRead(AppNotification item) async {
    if (_isRead(item)) return;
    setState(() => _readLocally.add(item.id));
    try {
      await ref.read(notificationsApiProvider).markRead(item.id);
      ref.invalidate(notificationsProvider);
    } on Object catch (e) {
      if (mounted) setState(() => _readLocally.remove(item.id));
      _showError(e);
    }
  }

  Future<void> _showActions(AppNotification item) async {
    final actions = [
      if (notificationRoute(item) != null)
        LumiSheetAction(
          value: 'open',
          label: context.t('Open'),
          icon: Icons.open_in_new,
        ),
      if (!_isRead(item))
        LumiSheetAction(
          value: 'read',
          label: context.t('Mark as read'),
          icon: Icons.done,
        ),
    ];
    // A read notification with no screen has nothing to offer.
    if (actions.isEmpty) return;
    final action = await showLumiActionSheet<String>(
      context,
      title: item.title,
      actions: actions,
    );
    if (!mounted) return;
    switch (action) {
      case 'open':
        await _open(item);
      case 'read':
        await _markRead(item);
    }
  }

  Future<void> _open(AppNotification item) async {
    // Open first: a failed "mark as read" must not keep the user from the
    // thing the notification is about.
    final route = notificationRoute(item);
    if (route != null) unawaited(context.push(route));
    await _markRead(item);
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(notificationsProvider);
    final unreadCount =
        query.value?.where((item) => !_isRead(item)).length ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Notifications')),
        surfaceTintColor: Colors.transparent,
        actions: [
          // An icon with a tooltip: a labelled button did not fit next to
          // the title on a narrow phone with large text.
          IconButton(
            tooltip: context.t('Read all'),
            // Nothing to do when everything is read already.
            onPressed: _markingAll || unreadCount == 0
                ? null
                : () => unawaited(_markAllRead()),
            icon: const Icon(Icons.done_all_rounded),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(notificationsProvider),
        child: _body(context, query),
      ),
    );
  }

  Widget _body(BuildContext context, AsyncValue<List<AppNotification>> query) {
    if (query.hasValue) {
      final items = query.requireValue;
      if (items.isEmpty) {
        return LumiEmptyState(
          icon: Icons.notifications_none,
          title: context.t('No notifications'),
          message: context.t('Research activity will appear here.'),
        );
      }
      final groups = groupNotificationsByDay(items, DateTime.now());
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          for (final (label, group) in groups) ...[
            LumiSectionHeader(title: context.t(label)),
            LumiRowGroup(
              children: [
                for (final item in group)
                  LumiSwipeAction(
                    key: ValueKey('notification-${item.id}'),
                    enabled: !_isRead(item),
                    label: context.t('Mark as read'),
                    icon: Icons.done,
                    onSwipe: () => unawaited(_markRead(item)),
                    child: _NotificationRow(
                      item: item,
                      read: _isRead(item),
                      onTap: () => unawaited(_open(item)),
                      onLongPress: () => unawaited(_showActions(item)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ],
      );
    }
    if (query.hasError) {
      return LumiErrorState(
        message: context.t(failureMessageKey(query.error!)),
        retrying: query.isLoading,
        onRetry: () => ref.invalidate(notificationsProvider),
      );
    }
    return const LumiPageSkeleton(rows: 5, height: 72);
  }
}

/// Notifications in day groups, newest first: "Today", "Yesterday",
/// "Earlier" (English keys). A date the app cannot read goes to "Earlier".
List<(String, List<AppNotification>)> groupNotificationsByDay(
  List<AppNotification> items,
  DateTime now,
) {
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  String bucket(AppNotification n) {
    final t = DateTime.tryParse(n.createdAt)?.toLocal();
    if (t == null) return tk('Earlier');
    final day = DateTime(t.year, t.month, t.day);
    if (!day.isBefore(today)) return tk('Today');
    if (day == yesterday) return tk('Yesterday');
    return tk('Earlier');
  }

  final order = [tk('Today'), tk('Yesterday'), tk('Earlier')];
  final byBucket = <String, List<AppNotification>>{};
  for (final n in items) {
    byBucket.putIfAbsent(bucket(n), () => []).add(n);
  }
  return [
    for (final key in order)
      if (byBucket[key] case final group?) (key, group),
  ];
}

/// Screen a notification opens, or null when the app has no screen for it.
String? notificationRoute(AppNotification item) {
  final id = item.targetId;
  final hasId = id != null && id.isNotEmpty;
  return switch (item.targetKind) {
    'paper' when hasId => '/paper/$id',
    'report' when hasId => '/report/$id',
    'project' when hasId => '/project/$id',
    'gap' || 'gap_analysis' || 'gap_direction' || 'gap_closure_check' =>
      '/gaps',
    'forum_post' when hasId => '/forum/post/${Uri.encodeComponent(id)}',
    'community' when hasId => '/communities/${Uri.encodeComponent(id)}',
    'review_request' when hasId =>
      '/review-requests/${Uri.encodeComponent(id)}',
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

/// Icon of what a notification is about, from its kind (never guessed from
/// its words).
IconData notificationIcon(String? targetKind) => switch (targetKind) {
      'paper' => Icons.article_outlined,
      'report' => Icons.description_outlined,
      'project' || 'project_chat' || 'project_synthesis' => Icons.folder_outlined,
      'community' => Icons.groups_outlined,
      'forum_post' => Icons.forum_outlined,
      'gap' ||
      'gap_analysis' ||
      'gap_direction' ||
      'gap_closure_check' =>
        Icons.lightbulb_outline,
      'submission' => Icons.upload_file,
      'review_request' || 'paper_review' => Icons.rate_review_outlined,
      'academic_profile' => Icons.person_outline,
      'keyword' || 'tag' || 'topic' => Icons.tag,
      'payment_order' => Icons.receipt_long_outlined,
      _ => Icons.notifications_outlined,
    };

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({
    required this.item,
    required this.read,
    required this.onTap,
    required this.onLongPress,
  });

  final AppNotification item;

  /// Read on the server or marked read here.
  final bool read;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final kind = notificationKindLabel(item.targetKind);
    final meta = [
      if (kind != null) context.t(kind),
      _relativeTime(context, item.createdAt),
    ].join(' · ');

    return Semantics(
      // Unread is said, not only shown as a dot.
      label: read ? null : context.t('Unread'),
      onLongPressHint: context.t('Show actions'),
      child: InkWell(
        onTap: onTap,
        onLongPress: () {
          unawaited(Haptics.select());
          onLongPress();
        },
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: read ? lumi.surfaceMuted : lumi.primarySoft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  notificationIcon(item.targetKind),
                  size: 20,
                  color: read ? lumi.foregroundSecondary : lumi.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight:
                            read ? FontWeight.w500 : FontWeight.w700,
                      ),
                    ),
                    if (item.message.trim().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        item.message,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: lumi.foregroundSecondary),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      meta,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: lumi.foregroundSecondary),
                    ),
                  ],
                ),
              ),
              if (!read) ...[
                const SizedBox(width: 8),
                Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.only(top: 6),
                  decoration: BoxDecoration(
                    color: lumi.primary,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _relativeTime(BuildContext context, String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return context.t('recently');
  return relativeTime(parsed.toLocal(), context.appLocale);
}
