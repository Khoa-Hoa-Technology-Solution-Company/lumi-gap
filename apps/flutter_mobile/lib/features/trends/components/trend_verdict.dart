import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/trends/data/trend_classification.dart';

/// Word, colour and icon of a trend verdict, same words as the web badge.
/// Colour is never the only signal: every verdict has its own word and icon.
({String text, Color color, IconData icon}) trendVerdictStyle(
  TrendVerdict verdict,
  LumiColors lumi,
) =>
    switch (verdict) {
      TrendVerdict.rising => (
          text: tk('Rising'),
          color: lumi.success,
          icon: Icons.trending_up,
        ),
      TrendVerdict.declining => (
          text: tk('Declining'),
          color: lumi.error,
          icon: Icons.trending_down,
        ),
      TrendVerdict.stable => (
          text: tk('Stable'),
          color: lumi.muted,
          icon: Icons.trending_flat,
        ),
      TrendVerdict.insufficient => (
          text: tk('Insufficient data'),
          color: lumi.muted,
          icon: Icons.help_outline,
        ),
    };

/// "Rising · +4.2% per year": the change is only shown with a verdict that
/// has one, never next to "Insufficient data".
String? trendChangeText(BuildContext context, TrendClassification c) {
  final pct = c.shownChangePct;
  if (pct == null) return null;
  final value = pct > 0 ? '+${pct.toStringAsFixed(1)}' : pct.toStringAsFixed(1);
  return context.t('{{value}}% per year', {'value': value});
}

/// The verdict as an icon and a word, with the confidence when there is one.
class TrendVerdictLabel extends StatelessWidget {
  const TrendVerdictLabel({
    required this.verdict,
    this.confidence,
    super.key,
  });

  final TrendVerdict verdict;
  final TrendConfidence? confidence;

  @override
  Widget build(BuildContext context) {
    final style = trendVerdictStyle(verdict, context.lumi);
    final text = [
      context.t(style.text),
      if (confidence != null)
        context.t(
          confidence == TrendConfidence.high
              ? 'High confidence'
              : 'Medium confidence',
        ),
    ].join(' · ');
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(style.icon, size: 16, color: style.color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            text,
            style: Theme.of(context)
                .textTheme
                .labelMedium
                ?.copyWith(color: style.color),
          ),
        ),
      ],
    );
  }
}
