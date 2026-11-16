import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// A line of real yearly values. Fewer than [minPoints] values draw nothing:
/// a line through two points would suggest a trend that was never tested.
///
/// Decorative: the figures it shows are always written next to it.
class LumiSparkline extends StatelessWidget {
  const LumiSparkline({
    required this.values,
    required this.color,
    this.width = 72,
    this.height = 32,
    this.fill = false,
    super.key,
  });

  /// Oldest first.
  final List<double> values;
  final Color color;

  /// Null stretches to the available width.
  final double? width;
  final double height;

  /// Tints the area under the line.
  final bool fill;

  static const int minPoints = 3;

  /// Whether [values] are enough to draw a line at all.
  static bool canDraw(List<double> values) => values.length >= minPoints;

  @override
  Widget build(BuildContext context) {
    if (!canDraw(values)) return const SizedBox.shrink();
    return ExcludeSemantics(
      child: SizedBox(
        width: width ?? double.infinity,
        height: height,
        child: CustomPaint(
          painter: _SparklinePainter(
            values: values,
            color: color,
            fill: fill ? color.withValues(alpha: 0.12) : null,
          ),
        ),
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter({required this.values, required this.color, this.fill});

  final List<double> values;
  final Color color;
  final Color? fill;

  @override
  void paint(Canvas canvas, Size size) {
    const inset = 2.0;
    final maxV = values.reduce((a, b) => a > b ? a : b);
    final minV = values.reduce((a, b) => a < b ? a : b);
    final span = maxV - minV == 0 ? 1.0 : maxV - minV;
    Offset at(int i) => Offset(
          inset + i / (values.length - 1) * (size.width - 2 * inset),
          (size.height - inset) -
              (values[i] - minV) / span * (size.height - 2 * inset),
        );

    final line = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < values.length; i++) {
      line.lineTo(at(i).dx, at(i).dy);
    }
    if (fill != null) {
      final area = Path.from(line)
        ..lineTo(at(values.length - 1).dx, size.height)
        ..lineTo(at(0).dx, size.height)
        ..close();
      canvas.drawPath(area, Paint()..color = fill!);
    }
    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_SparklinePainter old) =>
      old.color != color || old.fill != fill || !_sameValues(old.values);

  bool _sameValues(List<double> other) {
    if (other.length != values.length) return false;
    for (var i = 0; i < values.length; i++) {
      if (other[i] != values[i]) return false;
    }
    return true;
  }
}

/// A figure that leads a card: small label, big value, unit after it.
class LumiHeroMetric extends StatelessWidget {
  const LumiHeroMetric({
    required this.value,
    this.label,
    this.unit,
    this.valueColor,
    super.key,
  });

  final String value;
  final String? label;
  final String? unit;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null)
          Text(
            label!,
            style: theme.textTheme.titleSmall
                ?.copyWith(color: lumi.foregroundSecondary),
          ),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.end,
          spacing: 8,
          children: [
            Text(
              value,
              style: theme.textTheme.displaySmall?.copyWith(
                color: valueColor ?? lumi.foreground,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            if (unit != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  unit!,
                  style: theme.textTheme.bodyLarge
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
