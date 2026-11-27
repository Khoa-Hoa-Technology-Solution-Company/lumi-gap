import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// One choice in a [showLumiActionSheet].
class LumiSheetAction<T> {
  const LumiSheetAction({
    required this.value,
    required this.label,
    required this.icon,
    this.destructive = false,
    this.enabled = true,
  });

  final T value;
  final String label;
  final IconData icon;

  /// Shown in the error colour, after a divider, at the end of the sheet.
  final bool destructive;
  final bool enabled;
}

/// The actions of one item, as a Material 3 bottom sheet: what a long-press
/// or an overflow button opens. Returns the chosen value, or null when the
/// sheet is dismissed (drag down, tap outside, Android back).
///
/// Destructive actions are always listed last, after a divider, whatever
/// order they were given in.
Future<T?> showLumiActionSheet<T>(
  BuildContext context, {
  required List<LumiSheetAction<T>> actions,
  String? title,
}) {
  final normal = [for (final a in actions) if (!a.destructive) a];
  final destructive = [for (final a in actions) if (a.destructive) a];
  return showModalBottomSheet<T>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (context) {
      final lumi = context.lumi;
      final theme = Theme.of(context);
      Widget row(LumiSheetAction<T> a) {
        final color = !a.enabled
            ? lumi.muted
            : a.destructive
                ? lumi.error
                : lumi.foreground;
        return ListTile(
          minTileHeight: 56,
          enabled: a.enabled,
          leading: Icon(a.icon, color: color),
          title: Text(
            a.label,
            style: theme.textTheme.titleMedium?.copyWith(color: color),
          ),
          onTap: a.enabled ? () => Navigator.of(context).pop(a.value) : null,
        );
      }

      return SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ),
            for (final a in normal) row(a),
            if (normal.isNotEmpty && destructive.isNotEmpty)
              Divider(height: 1, color: lumi.line),
            for (final a in destructive) row(a),
          ],
        ),
      );
    },
  );
}
