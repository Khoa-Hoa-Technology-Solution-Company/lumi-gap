import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_section_frame.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';

/// 64x24 polyline of the yearly counts, in the primary colour.
class HomeSparkline extends StatelessWidget {
  const HomeSparkline({required this.points, super.key});

  final List<YearlyCount> points;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: CustomPaint(
        size: const Size(64, 24),
        painter: _SparklinePainter(
          points.map((p) => p.count.toDouble()).toList(),
          context.lumi.primary,
        ),
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter(this.values, this.color);

  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.75
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    if (values.length < 2) {
      final y = size.height / 2;
      canvas.drawLine(Offset(1, y), Offset(size.width - 1, y), paint);
      return;
    }
    final maxV = values.reduce((a, b) => a > b ? a : b);
    final minV = values.reduce((a, b) => a < b ? a : b);
    final span = maxV - minV == 0 ? 1 : maxV - minV;
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = 1 + i / (values.length - 1) * (size.width - 2);
      final y =
          (size.height - 1) - (values[i] - minV) / span * (size.height - 2);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_SparklinePainter old) =>
      old.color != color || !_same(old.values, values);

  bool _same(List<double> a, List<double> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

/// Text, colour and icon of a trend verdict (the API's Mann-Kendall
/// conclusion, same wording as the web). Colour is never the only signal:
/// every verdict has its own word, and "insufficient" has no arrow at all.
({String text, Color color, IconData icon}) trendVerdictStyle(
  TrendVerdict verdict,
  LumiColors lumi,
) => switch (verdict) {
  TrendVerdict.rising => (
    text: tk('Up'),
    color: lumi.success,
    icon: Icons.arrow_upward,
  ),
  TrendVerdict.declining => (
    text: tk('Down'),
    color: lumi.error,
    icon: Icons.arrow_downward,
  ),
  TrendVerdict.stable => (
    text: tk('Stable'),
    color: lumi.muted,
    icon: Icons.arrow_forward,
  ),
  TrendVerdict.insufficient => (
    text: tk('Insufficient data'),
    color: lumi.muted,
    icon: Icons.remove,
  ),
};

class HomeTrendLabel extends StatelessWidget {
  const HomeTrendLabel({required this.verdict, super.key});

  final TrendVerdict verdict;

  @override
  Widget build(BuildContext context) {
    final style = trendVerdictStyle(verdict, context.lumi);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(style.icon, size: 16, color: style.color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            context.t(style.text),
            textAlign: TextAlign.end,
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: style.color),
          ),
        ),
      ],
    );
  }
}

class HomeTrendList extends StatelessWidget {
  const HomeTrendList({required this.topics, required this.onOpen, super.key});

  final List<HomeTrendTopic> topics;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: homeCardDecoration(lumi),
      child: Column(
        children: [
          for (var i = 0; i < topics.length; i++) ...[
            if (i > 0) Divider(height: 1, color: lumi.line),
            InkWell(
              onTap: onOpen,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 56),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      HomeSparkline(points: topics[i].yearlyBreakdown),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          topics[i].topic,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyLarge,
                        ),
                      ),
                      const SizedBox(width: 8),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 120),
                        child: HomeTrendLabel(verdict: topics[i].verdict),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
