import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/features/trends/data/trend_classification.dart';

/// Word, colour and icon of a trend verdict, same words as the web badge.
/// Colour is never the only signal: every verdict has its own word and icon.
({String text, Color color, IconData icon}) trendVerdictStyle(
  TrendVerdict verdict,
  LumiColors lumi,
) => switch (verdict) {
  TrendVerdict.rising => (
    text: tk('Rising'),
    color: lumi.success,
    icon: Icons.trending_up,
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

/// "+4.2% per year": only with a verdict that has a direction, never next to
/// "Stable" or "Insufficient data". Saturated and past-peak topics show their
/// recent change.
String? trendChangeText(BuildContext context, TrendClassification? c) {
  if (c == null || !c.verdict.hasDirection) return null;
  final pct = c.headlineChangePct;
  if (pct == null) return null;
  final value = formatSigned(pct);
  return c.verdict == TrendVerdict.saturated ||
          c.verdict == TrendVerdict.pastPeak
      ? context.t('{{value}}% per year in recent years', {'value': value})
      : context.t('{{value}}% per year', {'value': value});
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
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: style.color),
          ),
        ),
      ],
    );
  }
}

/// The verdict as a small pill: a light tint of the verdict colour, the icon
/// in that colour and the word in the text colour, so it reads in light and
/// dark whatever the verdict.
class TrendVerdictPill extends StatelessWidget {
  const TrendVerdictPill({required this.verdict, super.key});

  final TrendVerdict verdict;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final style = trendVerdictStyle(verdict, lumi);
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 3, 10, 3),
      // Opaque: the tint over the card colour, so the pill also reads on
      // the blue feature card.
      decoration: BoxDecoration(
        color: Color.alphaBlend(style.color.withValues(alpha: 0.1), lumi.surface),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: 16, color: style.color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              context.t(style.text),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(
                context,
              ).textTheme.labelLarge?.copyWith(color: lumi.foreground),
            ),
          ),
        ],
      ),
    );
  }
}

/// Name of a size band (tertile of total papers among the topics of the IT scope).
String trendSizeBandLabel(String band) => switch (band) {
  'small' => tk('Small topics'),
  'medium' => tk('Medium topics'),
  _ => tk('Large topics'),
};

/// "Clear change" pill: the topic's change is anomalous for topics of its size
/// (Tukey fences), in the direction of its verdict. Descriptive only.
class TrendClearPill extends StatelessWidget {
  const TrendClearPill({super.key});

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Tooltip(
      message: context.t(
        'Its change is anomalous for topics of its size (Tukey fences)',
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: lumi.primarySoft,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          context.t('Clear change'),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: lumi.primary,
          ),
        ),
      ),
    );
  }
}

/// "Application topic" pill: layer 3 of the IT scope, a topic from another
/// field that the project team added to the scope.
class TrendApplicationPill extends StatelessWidget {
  const TrendApplicationPill({super.key});

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Tooltip(
      message: context.t(
        'Layer 3 of the IT scope: an application topic from another field, chosen by the project team',
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: lumi.success.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          context.t('Application topic'),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: lumi.success,
          ),
        ),
      ),
    );
  }
}
