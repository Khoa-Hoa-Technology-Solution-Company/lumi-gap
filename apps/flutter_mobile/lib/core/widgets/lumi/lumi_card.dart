import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';

/// The one card surface of the app: `surface` fill, radius 20, a soft shadow
/// in light mode and a hairline border in dark mode (LumiElevation).
class LumiCard extends StatelessWidget {
  const LumiCard({
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.onLongPress,
    this.longPressHint,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// Opens the card's action sheet; keep a visible control for the same
  /// actions.
  final VoidCallback? onLongPress;
  final String? longPressHint;

  static const BorderRadius _radius =
      BorderRadius.all(Radius.circular(LumiElevation.cardRadius));

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final content = Padding(padding: padding, child: child);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: _radius,
        boxShadow: LumiElevation.card(Theme.of(context).brightness),
      ),
      child: Material(
      color: lumi.surface,
      shape: RoundedRectangleBorder(
        borderRadius: _radius,
        side: dark ? BorderSide(color: lumi.line) : BorderSide.none,
      ),
      clipBehavior: Clip.antiAlias,
      child: onTap == null && onLongPress == null
          ? content
          : Semantics(
              onLongPressHint: onLongPress == null ? null : longPressHint,
              child: InkWell(
                onTap: onTap,
                onLongPress: onLongPress == null
                    ? null
                    : () {
                        unawaited(Haptics.select());
                        onLongPress!();
                      },
                borderRadius: _radius,
                child: content,
              ),
            ),
      ),
    );
  }
}
