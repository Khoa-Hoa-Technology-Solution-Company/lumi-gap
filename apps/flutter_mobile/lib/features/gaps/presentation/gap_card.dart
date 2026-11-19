import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_closure_widgets.dart';

/// The three review states of a gap, worded like the tabs that list them.
/// Dismissing is a decision, not an error, so it is not drawn in red.
({String label, LumiChipTone tone}) gapStatusStyle(String status) =>
    switch (status) {
      'resolved' => (label: tk('Resolved'), tone: LumiChipTone.success),
      'dismissed' => (label: tk('Dismissed'), tone: LumiChipTone.neutral),
      _ => (label: tk('Active'), tone: LumiChipTone.primary),
    };

/// Confidence as a bar and a percentage. The colour bands follow the
/// filter's thresholds (40% and 70%); the number is always written.
class GapConfidenceBar extends StatelessWidget {
  const GapConfidenceBar({required this.value, super.key});

  final double value;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final v = value.clamp(0.0, 1.0);
    final color = v >= 0.7
        ? lumi.success
        : v >= 0.4
        ? lumi.warning
        : lumi.muted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 72,
          height: 6,
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(
            color: lumi.line,
            borderRadius: BorderRadius.circular(3),
          ),
          child: FractionallySizedBox(
            widthFactor: v,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Wraps rather than overflowing on a narrow screen with large text.
        Flexible(
          child: Text(
            context.t('{{pct}}% confidence', {'pct': (v * 100).round()}),
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: lumi.foregroundSecondary),
          ),
        ),
      ],
    );
  }
}

/// One gap in the list: what is missing, why it is believed (closure,
/// confidence, evidence). The card opens the gap's sheet, which holds the
/// review actions; the list is already filtered by status, so the card does
/// not repeat it.
class GapCard extends StatelessWidget {
  const GapCard({
    required this.gap,
    required this.onOpen,
    super.key,
  });

  final ResearchGapItem gap;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: lumi.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: lumi.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  gap.title,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium,
                ),
                if (gap.description.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    gap.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: lumi.foregroundSecondary,
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    GapClosureBadge(gap: gap),
                    GapConfidenceBar(value: gap.confidence),
                    Text(
                      context.plural(
                        gap.evidenceCount,
                        one: '{{count}} evidence paper',
                        other: '{{count}} evidence papers',
                      ),
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: lumi.foregroundSecondary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
