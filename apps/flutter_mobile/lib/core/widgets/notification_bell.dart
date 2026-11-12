import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Badge text for an unread count: hidden at 0, "9+" above 9.
String? unreadBadgeText(int unread) {
  if (unread <= 0) return null;
  return unread > 9 ? '9+' : '$unread';
}

/// Screen-reader and tooltip text, e.g. "Notifications, 3 unread".
String notificationBellLabel(int unread, AppLocale locale) => unread <= 0
    ? translate('Notifications', locale)
    : translate('Notifications, {{count}} unread', locale, {'count': unread});

/// Bell for the AppBar of the three main tabs. The count comes from the same
/// [notificationsProvider] the notifications screen invalidates after marking
/// items read, so the badge refreshes itself.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(notificationsProvider).maybeWhen(
          data: (items) => items.where((item) => !item.isRead).length,
          orElse: () => 0,
        );
    final lumi = context.lumi;
    final text = unreadBadgeText(unread);
    final label = notificationBellLabel(unread, context.appLocale);

    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: () => unawaited(context.push('/notifications')),
      child: Tooltip(
        message: label,
        child: SizedBox(
          width: 48,
          height: 48,
          child: InkResponse(
            onTap: () => unawaited(context.push('/notifications')),
            radius: 24,
            child: Center(
              child: Badge(
                isLabelVisible: text != null,
                label: Text(text ?? ''),
                backgroundColor: lumi.error,
                textColor: lumi.onError,
                largeSize: 18,
                alignment: AlignmentDirectional.topEnd,
                child: Icon(
                  Icons.notifications_outlined,
                  size: 24,
                  color: lumi.foreground,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
