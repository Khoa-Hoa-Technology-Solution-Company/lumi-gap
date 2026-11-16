import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_section_frame.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
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

/// True when no topic has a verdict to show. The section then says so once,
/// under its title, instead of repeating "Insufficient data" on every row.
bool homeTrendsAllInsufficient(List<HomeTrendTopic> topics) =>
    topics.isNotEmpty &&
    topics.every((t) => t.verdict == TrendVerdict.insufficient);

class HomeTrendList extends StatelessWidget {
  const HomeTrendList({required this.topics, required this.onOpen, super.key});

  final List<HomeTrendTopic> topics;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    final showVerdicts = !homeTrendsAllInsufficient(topics);
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
                      // The line is only drawn next to a verdict: counts from
                      // a corpus the API could not test would look like a
                      // trend the API did not conclude. A blank keeps the
                      // names aligned when other rows have a line.
                      if (showVerdicts) ...[
                        if (topics[i].verdict == TrendVerdict.insufficient)
                          const SizedBox(width: 64)
                        else
                          HomeSparkline(points: topics[i].yearlyBreakdown),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              topics[i].topic,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodyLarge,
                            ),
                            // Under the name, so a long topic keeps the
                            // full row width.
                            if (showVerdicts) ...[
                              const SizedBox(height: 4),
                              TrendVerdictLabel(verdict: topics[i].verdict),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(Icons.chevron_right, size: 20, color: lumi.muted),
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
