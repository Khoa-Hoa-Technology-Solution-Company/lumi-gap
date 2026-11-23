import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';

/// One tappable row of a list or menu, at least 56dp tall: icon, title,
/// optional description, optional value, then a chevron when it navigates.
///
/// Put several in a [LumiRowGroup] to get one card with dividers.
class LumiListRow extends StatelessWidget {
  const LumiListRow({
    required this.title,
    this.icon,
    this.iconInTile = false,
    this.subtitle,
    this.value,
    this.trailing,
    this.onTap,
    this.onLongPress,
    this.longPressHint,
    this.destructive = false,
    this.showChevron = true,
    super.key,
  });

  final String title;
  final IconData? icon;

  /// Icon inside a 40x40 `primarySoft` tile (entry points) instead of a
  /// plain 24dp icon (menus).
  final bool iconInTile;
  final String? subtitle;

  /// Short current value shown before the chevron ("System default").
  final String? value;
  final Widget? trailing;
  final VoidCallback? onTap;

  /// Opens the row's action sheet. The same actions must stay reachable from
  /// a visible control.
  final VoidCallback? onLongPress;

  /// What TalkBack says a long-press does ("Show actions").
  final String? longPressHint;

  /// Title and icon in the error colour (sign out, delete).
  final bool destructive;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final titleColor = destructive ? lumi.error : lumi.foreground;
    final iconColor = destructive ? lumi.error : lumi.foregroundSecondary;

    Widget? leading;
    if (icon != null) {
      leading = iconInTile
          ? Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: lumi.primarySoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 20, color: lumi.primary),
            )
          : Icon(icon, size: 24, color: iconColor);
    }

    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 56),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            if (leading != null) ...[leading, const SizedBox(width: 12)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium
                        ?.copyWith(color: titleColor),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: lumi.foregroundSecondary),
                    ),
                ],
              ),
            ),
            if (value != null) ...[
              const SizedBox(width: 8),
              // A fixed cap, not a flex share: the value stays at the end of
              // the row and the title keeps the rest of the width.
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 140),
                child: Text(
                  value!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ),
            ],
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            if (trailing == null && onTap != null && showChevron) ...[
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, size: 20, color: lumi.muted),
            ],
          ],
        ),
      ),
    );

    final longPress = onLongPress;
    if (onTap == null && longPress == null) return row;
    return Semantics(
      button: onTap != null,
      onLongPressHint: longPress == null ? null : longPressHint,
      child: InkWell(
        onTap: onTap,
        onLongPress: longPress == null
            ? null
            : () {
                unawaited(Haptics.select());
                longPress();
              },
        child: row,
      ),
    );
  }
}

/// Rows in one bordered card, separated by hairlines inset from the start
/// edge: the list form of every screen (one card per item is for featured
/// content only).
class LumiRowGroup extends StatelessWidget {
  const LumiRowGroup({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final brightness = Theme.of(context).brightness;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(LumiElevation.cardRadius),
        boxShadow: LumiElevation.card(brightness),
      ),
      child: Material(
      color: lumi.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(LumiElevation.cardRadius),
        side: brightness == Brightness.dark
            ? BorderSide(color: lumi.line)
            : BorderSide.none,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(height: 1, indent: 16, color: lumi.line),
            children[i],
          ],
        ],
      ),
      ),
    );
  }
}
