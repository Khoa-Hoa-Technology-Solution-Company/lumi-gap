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
      context.t('Edit Pack'),
      context.t('Status'),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      decoration: BoxDecoration(
        color: lumi.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < labels.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.fromLTRB(4, 11, 4, 0),
                  color: step > i ? lumi.primary : lumi.line,
                ),
              ),
            // Flexible, with labels that may wrap: "Edit Pack" is much longer
            // in Vietnamese and fixed-width steps overflowed a narrow phone.
            Flexible(
              flex: 2,
              child: _StepNode(
                number: i + 1,
                label: labels[i],
                reached: step >= i + 1,
                current: step == i + 1,
              ),
            ),
          ],
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
  });

  final int number;
  final String label;
  final bool reached;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final text = Theme.of(context).textTheme;
    return Semantics(
      selected: current,
      child: Column(
        children: [
          Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: reached ? lumi.primary : lumi.line,
            ),
            child: Text(
              '$number',
              style: text.labelMedium?.copyWith(
                // On the accent when reached, readable on the neutral
                // circle when not.
                color: reached ? lumi.onPrimary : lumi.foreground,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text.labelMedium?.copyWith(
              // Not `muted`: on `surfaceMuted` it falls under 4.5:1.
              color: reached ? lumi.primary : lumi.foregroundSecondary,
              fontWeight: current ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
