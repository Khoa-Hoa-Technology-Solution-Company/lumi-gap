import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';

/// One swipe action on a list row (end to start), drawn under the row as it
/// slides: tone colour, icon and label, so the user sees what letting go will
/// do. Only for low-risk, reversible actions; the same action must also be
/// reachable from a visible control, and TalkBack gets it as a custom action.
///
/// [removesItem] true: the row slides out and [onSwipe] runs, which must
/// remove the item from the list synchronously (Dismissible asserts it).
/// false: [onSwipe] runs and the row slides back (an in-place change such as
/// "mark as read").
class LumiSwipeAction extends StatelessWidget {
  const LumiSwipeAction({
    required Key key,
    required this.child,
    required this.label,
    required this.icon,
    required this.onSwipe,
    this.removesItem = false,
    this.destructive = false,
    this.enabled = true,
  }) : super(key: key);

  final Widget child;
  final String label;
  final IconData icon;
  final VoidCallback onSwipe;
  final bool removesItem;
  final bool destructive;

  /// False: the row does not move and no custom action is exposed.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;
    final lumi = context.lumi;
    final tone = destructive ? lumi.error : lumi.primary;
    final onTone = destructive ? lumi.onError : lumi.onPrimary;
    return Semantics(
      customSemanticsActions: {CustomSemanticsAction(label: label): onSwipe},
      child: Dismissible(
        key: key!,
        direction: DismissDirection.endToStart,
        dismissThresholds: const {DismissDirection.endToStart: 0.4},
        onUpdate: (details) {
          if (details.reached && !details.previousReached) {
            unawaited(Haptics.commit());
          }
        },
        confirmDismiss: (_) async {
          if (removesItem) return true;
          onSwipe();
          return false;
        },
        onDismissed: (_) => onSwipe(),
        background: const SizedBox.shrink(),
        secondaryBackground: ColoredBox(
          color: tone,
          child: Align(
            alignment: AlignmentDirectional.centerEnd,
            child: Padding(
              padding: const EdgeInsetsDirectional.only(end: 24),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(color: onTone),
                  ),
                  const SizedBox(width: 8),
                  Icon(icon, color: onTone),
                ],
              ),
            ),
          ),
        ),
        child: child,
      ),
    );
  }
}
