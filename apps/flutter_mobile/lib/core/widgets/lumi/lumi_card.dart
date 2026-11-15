import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// The one card surface of the app: `surface` fill, `line` border, radius 8.
/// No shadow, so it reads the same in light and dark.
class LumiCard extends StatelessWidget {
  const LumiCard({
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  static const BorderRadius _radius = BorderRadius.all(Radius.circular(8));

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final content = Padding(padding: padding, child: child);
    return Material(
      color: lumi.surface,
      shape: RoundedRectangleBorder(
        borderRadius: _radius,
        side: BorderSide(color: lumi.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : InkWell(onTap: onTap, borderRadius: _radius, child: content),
    );
  }
}
