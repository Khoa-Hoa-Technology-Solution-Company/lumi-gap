import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

enum LumiChipTone { neutral, primary, success, warning, error }

/// Small read-only label (role, stage, status). Radius 6, `labelMedium`.
///
/// Status tones are text in the status colour on the card surface with a
/// border; pass an [icon] with them so the meaning never depends on colour.
class LumiChip extends StatelessWidget {
  const LumiChip({
    required this.label,
    this.tone = LumiChipTone.neutral,
    this.icon,
    super.key,
  });

  final String label;
  final LumiChipTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final (Color background, Color foreground, Color? border) = switch (tone) {
      LumiChipTone.neutral => (
          lumi.surfaceMuted,
          lumi.foregroundSecondary,
          null,
        ),
      LumiChipTone.primary => (lumi.primarySoft, lumi.primary, null),
      LumiChipTone.success => (lumi.surface, lumi.success, lumi.line),
      LumiChipTone.warning => (lumi.surface, lumi.warning, lumi.line),
      LumiChipTone.error => (lumi.surface, lumi.error, lumi.line),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
        border: border == null ? null : Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: foreground),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .labelMedium
                  ?.copyWith(color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}
