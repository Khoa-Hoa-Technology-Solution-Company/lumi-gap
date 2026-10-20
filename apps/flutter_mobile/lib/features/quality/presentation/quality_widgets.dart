import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/quality/data/quality_models.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_strings.dart';

const ButtonStyle qualityButtonStyle = ButtonStyle(minimumSize: WidgetStatePropertyAll(Size(48, 48)));

class QualitySectionTitle extends StatelessWidget {
  const QualitySectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 6),
      child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
    );
  }
}

class QualityNotice extends StatelessWidget {
  const QualityNotice({required this.text, this.icon = Icons.info_outline, this.action, super.key});

  final String text;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: scheme.secondaryContainer, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: scheme.onSecondaryContainer),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: scheme.onSecondaryContainer, height: 1.35))),
          ?action,
        ],
      ),
    );
  }
}

/// "3/5" or the localized "insufficient evidence"; never a bare placeholder number.
class QualityScoreLabel extends StatelessWidget {
  const QualityScoreLabel({required this.s, required this.score, super.key});

  final Qs s;
  final int? score;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final has = score != null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: has ? scheme.primaryContainer : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        has ? '$score/5' : s.insufficient,
        style: TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 12,
          color: has ? scheme.onPrimaryContainer : scheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

/// Criterion row: title, short finding, score. Null-safe when the assessment is missing.
class QualityCriterionRow extends StatelessWidget {
  const QualityCriterionRow({
    required this.s,
    required this.criterionId,
    required this.title,
    this.assessment,
    this.onTap,
    super.key,
  });

  final Qs s;
  final String criterionId;
  final String title;
  final QualityCriterionAssessment? assessment;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final finding = assessment?.finding ?? '';
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (finding.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          finding,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 13, height: 1.3),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              QualityScoreLabel(s: s, score: assessment?.assessed == true ? assessment?.score : null),
              if (onTap != null) const Icon(Icons.chevron_right, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class QualityQuoteTile extends StatelessWidget {
  const QualityQuoteTile({required this.quote, required this.sourceTitle, super.key});

  final String quote;
  final String sourceTitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        border: Border(left: BorderSide(color: scheme.primary, width: 3)),
        borderRadius: const BorderRadius.horizontal(right: Radius.circular(8)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('“$quote”', style: const TextStyle(fontStyle: FontStyle.italic, height: 1.35)),
          if (sourceTitle.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(sourceTitle, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
            ),
        ],
      ),
    );
  }
}

class QualityActionTile extends StatelessWidget {
  const QualityActionTile({required this.s, required this.action, super.key});

  final Qs s;
  final QualityAction action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(s.priority(action.priority), style: TextStyle(fontSize: 11, color: scheme.primary, fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(action.action, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.35)),
            if (action.why.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('${s.why}: ${action.why}', style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35)),
            ],
            if (action.expectedOutcome.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('${s.expected}: ${action.expectedOutcome}', style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35)),
            ],
          ],
        ),
      ),
    );
  }
}

class _FactLine extends StatelessWidget {
  const _FactLine({required this.s, required this.label, required this.fact});

  final Qs s;
  final String label;
  final QualityFact fact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          Text(
            fact.hasValue ? fact.value! : s.notStated,
            style: TextStyle(
              height: 1.35,
              fontStyle: fact.hasValue ? FontStyle.normal : FontStyle.italic,
              color: fact.hasValue ? null : scheme.onSurfaceVariant,
            ),
          ),
          if (fact.unverified)
            Text(s.unverifiedQuote, style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Reading card: facts table with "not stated in abstract" for gaps.
class QualityFactsCard extends StatelessWidget {
  const QualityFactsCard({required this.s, required this.facts, super.key});

  final Qs s;
  final PaperReadingFacts facts;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FactLine(s: s, label: s.studyDesign, fact: facts.studyDesign),
        _FactLine(s: s, label: s.sampleOrData, fact: facts.sampleOrData),
        _FactLine(s: s, label: s.setting, fact: facts.setting),
        _FactLine(s: s, label: s.measures, fact: facts.measures),
        _FactList(s: s, label: s.keyResults, facts: facts.keyResults),
        _FactList(s: s, label: s.statedLimitations, facts: facts.authorStatedLimitations),
      ],
    );
  }
}

class _FactList extends StatelessWidget {
  const _FactList({required this.s, required this.label, required this.facts});

  final Qs s;
  final String label;
  final List<QualityFact> facts;

  @override
  Widget build(BuildContext context) {
    if (facts.isEmpty) return _FactLine(s: s, label: label, fact: const QualityFact(reported: false));
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          for (final f in facts)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('•  '),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(f.value ?? '', style: const TextStyle(height: 1.35)),
                        if (f.unverified)
                          Text(s.unverifiedQuote, style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: scheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class QualityGuidanceBlock extends StatelessWidget {
  const QualityGuidanceBlock({required this.s, required this.guidance, super.key});

  final Qs s;
  final PaperReadingGuidance guidance;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final p in guidance.purposes)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.purpose(p.purpose), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(p.explanation, style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35)),
              ],
            ),
          ),
        if (guidance.audience.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text.rich(
              TextSpan(children: [
                TextSpan(text: '${s.audience}: ', style: const TextStyle(fontWeight: FontWeight.w600)),
                TextSpan(text: s.audienceLabel(guidance.audience)),
                if (guidance.audienceReason.isNotEmpty) TextSpan(text: ' — ${guidance.audienceReason}'),
              ]),
              style: const TextStyle(height: 1.35),
            ),
          ),
        if (guidance.caution != null && guidance.caution!.isNotEmpty)
          QualityNotice(text: '${s.caution}: ${guidance.caution}', icon: Icons.warning_amber_rounded),
      ],
    );
  }
}

/// Trend sparkline with the paper's year marked. Falls back to numbers only when too short.
class QualityTrendSparkline extends StatelessWidget {
  const QualityTrendSparkline({required this.trend, super.key});

  final ReadingTrend trend;

  @override
  Widget build(BuildContext context) {
    final points = [...trend.yearly]..sort((a, b) => a.year.compareTo(b.year));
    if (points.length < 2) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final paperYear = trend.paperYear;
    return SizedBox(
      height: 72,
      child: LineChart(
        LineChartData(
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          titlesData: const FlTitlesData(show: false),
          lineTouchData: const LineTouchData(enabled: false),
          minY: 0,
          extraLinesData: ExtraLinesData(
            verticalLines: [
              if (paperYear != null)
                VerticalLine(x: paperYear.toDouble(), color: scheme.tertiary, dashArray: [4, 3]),
            ],
          ),
          lineBarsData: [
            LineChartBarData(
              spots: [for (final p in points) FlSpot(p.year.toDouble(), p.count.toDouble())],
              color: scheme.primary,
              dotData: FlDotData(
                checkToShowDot: (spot, _) => trend.partialYear != null && spot.x == trend.partialYear!.toDouble(),
                getDotPainter: (spot, percent, bar, index) =>
                    FlDotCirclePainter(radius: 4, color: scheme.surface, strokeWidth: 2, strokeColor: scheme.primary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
