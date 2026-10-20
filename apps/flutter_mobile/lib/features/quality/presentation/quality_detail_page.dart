import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/quality/data/quality_models.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_strings.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Full-screen detail. With [criterionId] it shows that one criterion; without it, every
/// criterion plus actions, research questions, limitations, sources and metadata.
class QualityDetailPage extends ConsumerWidget {
  const QualityDetailPage({required this.evaluation, this.criterionId, super.key});

  final QualityEvaluation evaluation;
  final String? criterionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(qualityStringsProvider);
    final details = evaluation.details;
    final ids = criterionId != null
        ? [criterionId!]
        : (details?.rubric.criteria.map((c) => c.id).toList() ?? details?.criteria.map((c) => c.id).toList() ?? <String>[]);
    final single = criterionId != null;

    return Scaffold(
      appBar: AppBar(title: Text(single ? _title(s, details, criterionId!) : s.detailTitle)),
      body: details == null
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: Text(evaluation.rationale.isEmpty ? s.legacyNotice : evaluation.rationale),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                if (!single && details.summary.isNotEmpty) Text(details.summary, style: const TextStyle(height: 1.4)),
                for (final id in ids) _CriterionSection(s: s, details: details, id: id, showHeading: !single),
                if (!single) ...[
                  if (details.actions.isNotEmpty) ...[
                    QualitySectionTitle(s.actions),
                    for (final a in details.actions) QualityActionTile(s: s, action: a),
                  ],
                  if (details.researchQuestions.isNotEmpty) ...[
                    QualitySectionTitle(s.researchQuestions),
                    for (final q in details.researchQuestions) _RqTile(s: s, q: q),
                  ],
                ],
                if (details.limitations.isNotEmpty) ...[
                  QualitySectionTitle(s.limitations),
                  for (final l in details.limitations) _Bullet(l),
                ],
                if (!single && details.sources.isNotEmpty) ...[
                  QualitySectionTitle(s.sources),
                  for (final src in details.sources) _Bullet(src.title.isEmpty ? src.id : src.title),
                ],
                QualitySectionTitle(s.about),
                _Meta(label: s.model, value: evaluation.model),
                if (evaluation.evaluatedAt != null)
                  _Meta(label: s.date, value: _formatDate(evaluation.evaluatedAt!.toLocal())),
                _Meta(label: s.rubricVersion, value: details.rubric.version),
                if (details.rubric.scope.isNotEmpty) _Meta(label: s.scope, value: details.rubric.scope),
              ],
            ),
    );
  }

  static String _title(Qs s, QualityAssessment? details, String id) {
    final def = details?.rubric.criterion(id);
    return (def != null && def.title.isNotEmpty) ? def.title : s.criterionTitle(id);
  }
}

/// Locale-neutral so no intl locale data initialisation is needed.
String _formatDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class _CriterionSection extends StatelessWidget {
  const _CriterionSection({required this.s, required this.details, required this.id, required this.showHeading});

  final Qs s;
  final QualityAssessment details;
  final String id;
  final bool showHeading;

  @override
  Widget build(BuildContext context) {
    final def = details.rubric.criterion(id);
    final a = details.criterion(id);
    final scheme = Theme.of(context).colorScheme;
    final anchor = a?.assessed == true ? def?.anchorFor(a?.score) : null;
    final actions = details.actions.where((x) => x.criterionId == id).toList();
    final questions = details.researchQuestions.where((x) => x.criterionId == id).toList();
    final title = (def != null && def.title.isNotEmpty) ? def.title : s.criterionTitle(id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showHeading)
          Padding(
            padding: const EdgeInsets.only(top: 20),
            child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          ),
        if (def != null && def.question.isNotEmpty) ...[
          QualitySectionTitle(s.question),
          Text(def.question, style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35)),
        ],
        QualitySectionTitle(s.score),
        Align(alignment: Alignment.centerLeft, child: QualityScoreLabel(s: s, score: a?.assessed == true ? a?.score : null)),
        if (anchor != null) ...[
          const SizedBox(height: 6),
          Text('${s.matchedAnchor}: ${anchor.description}', style: const TextStyle(height: 1.35)),
        ],
        if (a != null && a.finding.isNotEmpty) ...[
          QualitySectionTitle(s.finding),
          Text(a.finding, style: const TextStyle(height: 1.4)),
        ],
        if (a != null && a.evidence.isNotEmpty) ...[
          QualitySectionTitle(s.quotes),
          for (final e in a.evidence) QualityQuoteTile(quote: e.quote, sourceTitle: details.sourceTitle(e.sourceId)),
        ],
        if (a != null && a.missingEvidence.isNotEmpty) ...[
          QualitySectionTitle(s.missing),
          for (final m in a.missingEvidence) _Bullet(m),
        ],
        if (a != null && a.improvement.isNotEmpty) ...[
          QualitySectionTitle(s.howToUse),
          Text(a.improvement, style: const TextStyle(height: 1.4)),
        ],
        if (!showHeading && actions.isNotEmpty) ...[
          QualitySectionTitle(s.actions),
          for (final x in actions) QualityActionTile(s: s, action: x),
        ],
        if (!showHeading && questions.isNotEmpty) ...[
          QualitySectionTitle(s.researchQuestions),
          for (final q in questions) _RqTile(s: s, q: q),
        ],
      ],
    );
  }
}

class _RqTile extends StatelessWidget {
  const _RqTile({required this.s, required this.q});

  final Qs s;
  final QualityResearchQuestion q;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(q.question, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.35)),
          if (q.why.isNotEmpty)
            Text('${s.why}: ${q.why}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.35)),
        ],
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('•  '),
          Expanded(child: Text(text, style: const TextStyle(height: 1.35))),
        ],
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Text.rich(TextSpan(children: [
        TextSpan(text: '$label: ', style: const TextStyle(fontWeight: FontWeight.w600)),
        TextSpan(text: value.isEmpty ? '—' : value),
      ])),
    );
  }
}

/// Scoring scale readable before (or without) an evaluation.
class QualityRubricPage extends ConsumerWidget {
  const QualityRubricPage({required this.rubric, super.key});

  final QualityRubric rubric;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(qualityStringsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(s.rubric)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (rubric.scope.isNotEmpty) Text(rubric.scope, style: const TextStyle(height: 1.4)),
          for (final c in rubric.criteria) ...[
            Padding(
              padding: const EdgeInsets.only(top: 20),
              child: Text(c.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            ),
            Text(c.question, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.35)),
            const SizedBox(height: 6),
            for (final a in c.anchors) _Bullet('${a.score}/5 — ${a.description}'),
          ],
          if (rubric.limitations.isNotEmpty) ...[
            QualitySectionTitle(s.limitations),
            for (final l in rubric.limitations) _Bullet(l),
          ],
          QualitySectionTitle(s.rubricVersion),
          Text(rubric.version),
        ],
      ),
    );
  }
}
