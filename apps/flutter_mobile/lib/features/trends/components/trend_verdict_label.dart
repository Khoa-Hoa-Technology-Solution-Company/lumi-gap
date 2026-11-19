import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';

/// Text, colour and icon of a trend verdict (the API's Mann-Kendall
/// conclusion on the yearly share, same wording as the web). Colour is never
/// the only signal: every verdict has its own word and icon, and
/// "insufficient" has no arrow at all.
({String text, Color color, IconData icon}) trendVerdictStyle(
  TrendVerdict verdict,
  LumiColors lumi,
) => switch (verdict) {
  TrendVerdict.rising => (
    text: tk('Up'),
    color: lumi.success,
    icon: Icons.arrow_upward,
  ),
  TrendVerdict.saturated => (
    text: tk('Saturated'),
    color: lumi.warning,
    icon: Icons.vertical_align_top,
  ),
  TrendVerdict.pastPeak => (
    text: tk('Past its peak'),
    color: lumi.warning,
    icon: Icons.south_east,
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

/// One sentence on what the verdict means, as on the web.
String trendVerdictMeaning(TrendVerdict verdict) => switch (verdict) {
  TrendVerdict.rising => tk(
    'Its share of publications grew clearly over the years.',
  ),
  TrendVerdict.saturated => tk(
    'Its share grew over the window but has levelled off near its peak in recent years.',
  ),
  TrendVerdict.pastPeak => tk(
    'Its share grew over the window but has since fallen to less than half of its peak.',
  ),
  TrendVerdict.declining => tk(
    'Its share of publications shrank clearly over the years.',
  ),
  TrendVerdict.stable => tk('No clear change in its share of publications.'),
  TrendVerdict.insufficient => tk(
    'Too few complete years or papers for a trend verdict.',
  ),
};

/// The change figure shown next to a verdict ("+4.2% per year"), or null when
/// the verdict has none (stable, insufficient, or no figure from the API).
String? trendChangeText(BuildContext context, TrendClassification? c) {
  if (c == null) return null;
  if (c.verdict == TrendVerdict.stable ||
      c.verdict == TrendVerdict.insufficient) {
    return null;
  }
  final value = c.headlineChangePct;
  if (value == null) return null;
  final text = formatSigned(value);
  return c.verdict == TrendVerdict.saturated ||
          c.verdict == TrendVerdict.pastPeak
      ? context.t('{{value}}% per year in recent years', {'value': text})
      : context.t('{{value}}% per year', {'value': text});
}

/// Icon + word of a verdict, in the verdict's colour.
class TrendVerdictLabel extends StatelessWidget {
  const TrendVerdictLabel({required this.verdict, super.key});

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
