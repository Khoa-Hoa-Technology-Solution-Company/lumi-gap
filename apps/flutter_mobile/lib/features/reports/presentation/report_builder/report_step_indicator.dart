import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// The four steps of building a report, with the current one and those
/// before it filled in.
class ReportStepIndicator extends StatelessWidget {
  const ReportStepIndicator({required this.step, super.key});

  /// 1 setup, 2 preview, 3 edit the pack, 4 status.
  final int step;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final labels = [
      context.t('Setup'),
      context.t('Preview'),
      context.t('Edit pack'),
      context.t('Status'),
    ];
    // Four columns of the same width across the track: each circle sits in
    // the middle of its column with its label centred under it, so the
    // steps are balanced whatever the width or language. The connector runs
    // from the centre of one circle to the next, behind them.
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      decoration: BoxDecoration(
        color: lumi.surfaceMuted,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: _StepNode(
                number: i + 1,
                label: labels[i],
                reached: step >= i + 1,
                current: step == i + 1,
                // `muted`, not `line`: in dark mode `line` is the colour of
                // the track itself and the connector disappeared.
                lineBefore: i == 0
                    ? null
                    : (step >= i + 1 ? lumi.primary : lumi.muted),
                lineAfter: i == labels.length - 1
                    ? null
                    : (step >= i + 2 ? lumi.primary : lumi.muted),
              ),
            ),
        ],
      ),
    );
  }
}

class _StepNode extends StatelessWidget {
  const _StepNode({
    required this.number,
    required this.label,
    required this.reached,
    required this.current,
    this.lineBefore,
    this.lineAfter,
  });

  final int number;
  final String label;
  final bool reached;
  final bool current;

  /// Colour of the connector to the previous / next step; null at the ends.
  final Color? lineBefore;
  final Color? lineAfter;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final text = Theme.of(context).textTheme;
    return Semantics(
      selected: current,
      child: Column(
        children: [
          SizedBox(
            height: 24,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 2,
                        color: lineBefore ?? Colors.transparent,
                      ),
                    ),
                    const SizedBox(width: 24),
                    Expanded(
                      child: Container(
                        height: 2,
                        color: lineAfter ?? Colors.transparent,
                      ),
                    ),
                  ],
                ),
                _circle(lumi, text),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: _label(lumi, text),
          ),
        ],
      ),
    );
  }

  Widget _circle(LumiColors lumi, TextTheme text) => Container(
    width: 24,
    height: 24,
    alignment: Alignment.center,
    // A step not reached yet is an outlined circle on the card colour,
    // seen on the track in light and dark (non-text 3:1).
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: reached ? lumi.primary : lumi.surface,
      border: reached ? null : Border.all(color: lumi.muted),
    ),
    child: Text(
      '$number',
      style: text.labelMedium?.copyWith(
        // On the accent when reached, readable on the neutral
        // circle when not.
        color: reached ? lumi.onPrimary : lumi.foreground,
      ),
    ),
  );

  Widget _label(LumiColors lumi, TextTheme text) => Text(
    label,
    textAlign: TextAlign.center,
    maxLines: 2,
    overflow: TextOverflow.ellipsis,
    style: text.labelMedium?.copyWith(
      // Not `muted`: on `surfaceMuted` it falls under 4.5:1.
      color: reached ? lumi.primary : lumi.foregroundSecondary,
      fontWeight: current ? FontWeight.w700 : FontWeight.w500,
    ),
  );
}
