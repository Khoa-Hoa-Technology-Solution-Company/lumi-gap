import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

enum AppAlertTone { error, warning, success }

/// Inline message: tone-coloured border, an icon, and always text, so the
/// meaning never relies on colour alone. Announced to screen readers.
class AppAlert extends StatelessWidget {
  const AppAlert({
    required this.tone,
    required this.child,
    super.key,
  });

  final AppAlertTone tone;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final (color, icon) = switch (tone) {
      AppAlertTone.error => (lumi.error, Icons.error_outline),
      AppAlertTone.warning => (lumi.warning, Icons.warning_amber_outlined),
      AppAlertTone.success => (lumi.success, Icons.check_circle_outline),
    };
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: lumi.surface,
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(icon, size: 20, color: color),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DefaultTextStyle.merge(
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: lumi.foreground,
                    ),
                child: child,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
