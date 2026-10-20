import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/quality/data/quality_models.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_strings.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_widgets.dart';

/// Project mode result: how one paper serves one project's research plan.
class QualityProjectResult extends StatelessWidget {
  const QualityProjectResult({required this.s, required this.assessment, this.addToProject, super.key});

  final Qs s;
  final QualityProjectAssessment assessment;

  /// Null when the paper is already in the project or the state is not known yet.
  final VoidCallback? addToProject;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final a = assessment;
    final screening = a.screening;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Chip(
              label: Text(s.verdict(a.verdict), style: const TextStyle(fontWeight: FontWeight.bold)),
              backgroundColor: scheme.primaryContainer,
            ),
          ],
        ),
        if (a.verdictReason.isNotEmpty) Text(a.verdictReason, style: const TextStyle(height: 1.4)),
        if (a.questionLinks.isNotEmpty) ...[
          QualitySectionTitle(s.planItemsHelped),
          for (final l in a.questionLinks)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.planItem, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.35)),
                  Text(l.contribution, style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35)),
                  const SizedBox(height: 4),
                  for (final e in l.evidence) QualityQuoteTile(quote: e.quote, sourceTitle: a.sourceTitle(e.sourceId)),
                ],
              ),
            ),
        ],
        if (a.reusable.isNotEmpty) ...[
          QualitySectionTitle(s.reusable),
          for (final r in a.reusable)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(TextSpan(children: [
                    TextSpan(text: '${s.reusableKind(r.kind)}: ', style: const TextStyle(fontWeight: FontWeight.w600)),
                    TextSpan(text: r.description),
                  ])),
                  if (r.evidence != null) QualityQuoteTile(quote: r.evidence!.quote, sourceTitle: a.sourceTitle(r.evidence!.sourceId)),
                ],
              ),
            ),
        ],
        if (a.tensions.isNotEmpty) ...[
          QualitySectionTitle(s.tensions),
          for (final t in a.tensions)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.description, style: const TextStyle(height: 1.35)),
                  for (final e in t.evidence) QualityQuoteTile(quote: e.quote, sourceTitle: a.sourceTitle(e.sourceId)),
                ],
              ),
            ),
        ],
        QualitySectionTitle(s.screening),
        Text(s.suggestion(screening.suggestion), style: const TextStyle(fontWeight: FontWeight.bold)),
        if (screening.reason.isNotEmpty) Text(screening.reason, style: const TextStyle(height: 1.35)),
        if (screening.criteria.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(s.yourCriteria, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          for (final c in screening.criteria) Text('• $c', style: const TextStyle(height: 1.35)),
        ],
        if (a.actions.isNotEmpty) ...[
          QualitySectionTitle(s.actions),
          for (final x in a.actions) QualityActionTile(s: s, action: x),
        ],
        if (a.limitations.isNotEmpty) ...[
          QualitySectionTitle(s.limitations),
          for (final l in a.limitations) Text('• $l', style: const TextStyle(height: 1.35)),
        ],
        if (addToProject != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: FilledButton.icon(
              style: qualityButtonStyle,
              onPressed: addToProject,
              icon: const Icon(Icons.add),
              label: Text(s.addToProject),
            ),
          ),
      ],
    );
  }
}
