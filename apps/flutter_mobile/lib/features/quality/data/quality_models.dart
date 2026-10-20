// Dart mirror of packages/shared-types/src/quality.ts. Parsing is lenient: a
// missing or malformed field never throws, so an old or partial payload still renders.
import 'package:meta/meta.dart';

Map<String, dynamic>? _map(Object? v) => v is Map<String, dynamic> ? v : null;
List<Map<String, dynamic>> _maps(Object? v) =>
    v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];
String _str(Object? v, [String fallback = '']) => v == null ? fallback : v.toString();
String? _strOrNull(Object? v) => v?.toString();
double? _num(Object? v) => v is num ? v.toDouble() : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
List<String> _strings(Object? v) => v is List ? v.map((e) => e.toString()).toList() : const [];
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;

@immutable
class QualityQuote {
  const QualityQuote({required this.sourceId, required this.quote});

  factory QualityQuote.fromJson(Map<String, dynamic> json) =>
      QualityQuote(sourceId: _str(json['sourceId']), quote: _str(json['quote']));

  static QualityQuote? tryParse(Object? v) {
    final m = _map(v);
    return m == null ? null : QualityQuote.fromJson(m);
  }

  static List<QualityQuote> list(Object? v) => _maps(v).map(QualityQuote.fromJson).toList();

  final String sourceId;
  final String quote;
}

@immutable
class QualityAnchor {
  const QualityAnchor({required this.score, required this.description});

  final int score;
  final String description;
}

@immutable
class QualityCriterionDef {
  const QualityCriterionDef({required this.id, required this.title, required this.question, required this.anchors});

  factory QualityCriterionDef.fromJson(Map<String, dynamic> json) => QualityCriterionDef(
        id: _str(json['id']),
        title: _str(json['title']),
        question: _str(json['question']),
        anchors: _maps(json['anchors'])
            .map((a) => QualityAnchor(score: _int(a['score']) ?? 0, description: _str(a['description'])))
            .toList(),
      );

  final String id;
  final String title;
  final String question;
  final List<QualityAnchor> anchors;

  QualityAnchor? anchorFor(int? score) {
    for (final a in anchors) {
      if (a.score == score) return a;
    }
    return null;
  }
}

@immutable
class QualityRubric {
  const QualityRubric({
    required this.version,
    required this.targetKind,
    required this.scope,
    required this.criteria,
    required this.limitations,
  });

  factory QualityRubric.fromJson(Map<String, dynamic> json) => QualityRubric(
        version: _str(json['version']),
        targetKind: _str(json['targetKind']),
        scope: _str(json['scope']),
        criteria: _maps(json['criteria']).map(QualityCriterionDef.fromJson).toList(),
        limitations: _strings(json['limitations']),
      );

  final String version;
  final String targetKind;
  final String scope;
  final List<QualityCriterionDef> criteria;
  final List<String> limitations;

  QualityCriterionDef? criterion(String id) {
    for (final c in criteria) {
      if (c.id == id) return c;
    }
    return null;
  }
}

@immutable
class QualitySource {
  const QualitySource({required this.id, required this.title, required this.kind, this.paperId, this.truncated = false});

  factory QualitySource.fromJson(Map<String, dynamic> json) => QualitySource(
        id: _str(json['id']),
        title: _str(json['title']),
        kind: _str(json['kind']),
        paperId: _strOrNull(json['paperId']),
        truncated: json['truncated'] == true,
      );

  final String id;
  final String title;
  final String kind;
  final String? paperId;
  final bool truncated;
}

@immutable
class QualityCriterionAssessment {
  const QualityCriterionAssessment({
    required this.id,
    required this.score,
    required this.assessed,
    required this.finding,
    required this.evidence,
    required this.missingEvidence,
    required this.improvement,
  });

  factory QualityCriterionAssessment.fromJson(Map<String, dynamic> json) {
    final score = _int(json['score']);
    return QualityCriterionAssessment(
      id: _str(json['id']),
      score: score,
      assessed: json['status'] != 'insufficient_evidence' && score != null,
      finding: _str(json['finding']),
      evidence: QualityQuote.list(json['evidence']),
      missingEvidence: _strings(json['missingEvidence']),
      improvement: _str(json['improvement']),
    );
  }

  final String id;
  final int? score;
  final bool assessed;
  final String finding;
  final List<QualityQuote> evidence;
  final List<String> missingEvidence;
  final String improvement;
}

@immutable
class QualityAction {
  const QualityAction({
    required this.criterionId,
    required this.priority,
    required this.action,
    required this.why,
    required this.expectedOutcome,
  });

  factory QualityAction.fromJson(Map<String, dynamic> json) => QualityAction(
        criterionId: _str(json['criterionId']),
        priority: _str(json['priority'], 'medium'),
        action: _str(json['action']),
        why: _str(json['why']),
        expectedOutcome: _str(json['expectedOutcome']),
      );

  final String criterionId;
  final String priority;
  final String action;
  final String why;
  final String expectedOutcome;
}

@immutable
class QualityResearchQuestion {
  const QualityResearchQuestion({required this.criterionId, required this.question, required this.why});

  final String criterionId;
  final String question;
  final String why;
}

@immutable
class QualityFact {
  const QualityFact({required this.reported, this.unverified = false, this.value, this.evidence});

  /// Never throws; anything that is not a valid "reported" fact is "not reported".
  factory QualityFact.fromJson(Object? json) {
    final m = _map(json);
    final value = _strOrNull(m?['value']);
    final hasValue = value != null && value.isNotEmpty;
    final reported = m?['status'] == 'reported' && hasValue;
    final unverified = m?['status'] == 'unverified' && hasValue;
    return QualityFact(
      reported: reported,
      unverified: unverified,
      value: reported || unverified ? value : null,
      evidence: reported ? QualityQuote.tryParse(m?['evidence']) : null,
    );
  }

  final bool reported;

  /// The model gave a value but its quote could not be verified; never shown as "not stated".
  final bool unverified;
  bool get hasValue => reported || unverified;
  final String? value;
  final QualityQuote? evidence;
}

@immutable
class PaperReadingFacts {
  const PaperReadingFacts({
    required this.studyDesign,
    required this.sampleOrData,
    required this.setting,
    required this.measures,
    required this.keyResults,
    required this.authorStatedLimitations,
  });

  factory PaperReadingFacts.fromJson(Map<String, dynamic> json) => PaperReadingFacts(
        studyDesign: QualityFact.fromJson(json['studyDesign']),
        sampleOrData: QualityFact.fromJson(json['sampleOrData']),
        setting: QualityFact.fromJson(json['setting']),
        measures: QualityFact.fromJson(json['measures']),
        keyResults: _factList(json['keyResults']),
        authorStatedLimitations: _factList(json['authorStatedLimitations']),
      );

  static List<QualityFact> _factList(Object? v) =>
      v is List ? v.map(QualityFact.fromJson).where((f) => f.hasValue).toList() : const [];

  final QualityFact studyDesign;
  final QualityFact sampleOrData;
  final QualityFact setting;
  final QualityFact measures;
  final List<QualityFact> keyResults;
  final List<QualityFact> authorStatedLimitations;
}

@immutable
class ReadingPurpose {
  const ReadingPurpose({required this.purpose, required this.explanation});

  final String purpose;
  final String explanation;
}

@immutable
class PaperReadingGuidance {
  const PaperReadingGuidance({
    required this.purposes,
    required this.audience,
    required this.audienceReason,
    this.caution,
  });

  factory PaperReadingGuidance.fromJson(Map<String, dynamic> json) => PaperReadingGuidance(
        purposes: _maps(json['purposes'])
            .map((p) => ReadingPurpose(purpose: _str(p['purpose']), explanation: _str(p['explanation'])))
            .toList(),
        audience: _str(json['audience']),
        audienceReason: _str(json['audienceReason']),
        caution: _strOrNull(json['caution']),
      );

  final List<ReadingPurpose> purposes;
  final String audience;
  final String audienceReason;
  final String? caution;
}

@immutable
class QualityAssessment {
  const QualityAssessment({
    required this.rubric,
    required this.summary,
    required this.criteria,
    required this.actions,
    required this.researchQuestions,
    required this.limitations,
    required this.sources,
    this.facts,
    this.guidance,
  });

  factory QualityAssessment.fromJson(Map<String, dynamic> json) {
    final facts = _map(json['facts']);
    final guidance = _map(json['guidance']);
    return QualityAssessment(
      rubric: QualityRubric.fromJson(_map(json['rubric']) ?? const {}),
      summary: _str(json['summary']),
      criteria: _maps(json['criteria']).map(QualityCriterionAssessment.fromJson).toList(),
      actions: _maps(json['actions']).map(QualityAction.fromJson).toList(),
      researchQuestions: _maps(json['researchQuestions'])
          .map((q) => QualityResearchQuestion(
                criterionId: _str(q['criterionId']),
                question: _str(q['question']),
                why: _str(q['why']),
              ))
          .toList(),
      limitations: _strings(json['limitations']),
      sources: _maps(json['sources']).map(QualitySource.fromJson).toList(),
      facts: facts == null ? null : PaperReadingFacts.fromJson(facts),
      guidance: guidance == null ? null : PaperReadingGuidance.fromJson(guidance),
    );
  }

  final QualityRubric rubric;
  final String summary;
  final List<QualityCriterionAssessment> criteria;
  final List<QualityAction> actions;
  final List<QualityResearchQuestion> researchQuestions;
  final List<String> limitations;
  final List<QualitySource> sources;
  final PaperReadingFacts? facts;
  final PaperReadingGuidance? guidance;

  QualityCriterionAssessment? criterion(String id) {
    for (final c in criteria) {
      if (c.id == id) return c;
    }
    return null;
  }

  String sourceTitle(String sourceId) {
    for (final s in sources) {
      if (s.id == sourceId) return s.title;
    }
    return sourceId;
  }
}

@immutable
class QualityEvaluation {
  const QualityEvaluation({
    required this.relevance,
    required this.groundedness,
    required this.completeness,
    required this.overall,
    required this.rationale,
    this.model = '',
    this.evaluatedAt,
    this.details,
    this.freshness,
  });

  factory QualityEvaluation.fromJson(Map<String, dynamic> json) {
    final details = _map(json['details']);
    return QualityEvaluation(
      relevance: _num(json['relevance']),
      groundedness: _num(json['groundedness']),
      completeness: _num(json['completeness']),
      overall: _num(json['overall']),
      rationale: _str(json['rationale']),
      model: _str(json['model']),
      evaluatedAt: _date(json['evaluatedAt']) ?? _date(json['createdAt']),
      details: details == null ? null : QualityAssessment.fromJson(details),
      freshness: _strOrNull(json['freshness']),
    );
  }

  final double? relevance;
  final double? groundedness;
  final double? completeness;
  final double? overall;
  final String rationale;
  final String model;
  final DateTime? evaluatedAt;
  final QualityAssessment? details;
  final String? freshness;

  bool get isOutdated => freshness == 'outdated';
  bool get isLegacy => freshness == 'legacy' || details == null;
}

@immutable
class ProjectQuestionLink {
  const ProjectQuestionLink({required this.planItem, required this.contribution, required this.evidence});

  final String planItem;
  final String contribution;
  final List<QualityQuote> evidence;
}

@immutable
class ProjectReusable {
  const ProjectReusable({required this.kind, required this.description, this.evidence});

  final String kind;
  final String description;
  final QualityQuote? evidence;
}

@immutable
class ProjectTension {
  const ProjectTension({required this.description, required this.evidence});

  final String description;
  final List<QualityQuote> evidence;
}

@immutable
class ProjectScreening {
  const ProjectScreening({required this.suggestion, required this.reason, required this.criteria});

  final String suggestion; // include | exclude | undecided
  final String reason;
  final List<String> criteria;
}

@immutable
class QualityProjectAssessment {
  const QualityProjectAssessment({
    required this.projectId,
    required this.projectTitle,
    required this.verdict,
    required this.verdictReason,
    required this.questionLinks,
    required this.reusable,
    required this.tensions,
    required this.screening,
    required this.actions,
    required this.limitations,
    required this.sources,
  });

  factory QualityProjectAssessment.fromJson(Map<String, dynamic> json) {
    final project = _map(json['project']) ?? const {};
    final screening = _map(json['screening']) ?? const {};
    return QualityProjectAssessment(
      projectId: _str(project['id']),
      projectTitle: _str(project['title']),
      verdict: _str(json['verdict'], 'background'),
      verdictReason: _str(json['verdictReason']),
      questionLinks: _maps(json['questionLinks'])
          .map((l) => ProjectQuestionLink(
                planItem: _str(l['planItem']),
                contribution: _str(l['contribution']),
                evidence: QualityQuote.list(l['evidence']),
              ))
          .toList(),
      reusable: _maps(json['reusable'])
          .map((r) => ProjectReusable(
                kind: _str(r['kind']),
                description: _str(r['description']),
                evidence: QualityQuote.tryParse(r['evidence']),
              ))
          .toList(),
      tensions: _maps(json['tensions'])
          .map((t) => ProjectTension(description: _str(t['description']), evidence: QualityQuote.list(t['evidence'])))
          .toList(),
      screening: ProjectScreening(
        suggestion: _str(screening['suggestion'], 'undecided'),
        reason: _str(screening['reason']),
        criteria: _strings(screening['criteria']),
      ),
      actions: _maps(json['actions']).map(QualityAction.fromJson).toList(),
      limitations: _strings(json['limitations']),
      sources: _maps(json['sources']).map(QualitySource.fromJson).toList(),
    );
  }

  final String projectId;
  final String projectTitle;
  final String verdict; // core | supporting | background | not_relevant
  final String verdictReason;
  final List<ProjectQuestionLink> questionLinks;
  final List<ProjectReusable> reusable;
  final List<ProjectTension> tensions;
  final ProjectScreening screening;
  final List<QualityAction> actions;
  final List<String> limitations;
  final List<QualitySource> sources;

  String sourceTitle(String sourceId) {
    for (final s in sources) {
      if (s.id == sourceId) return s.title;
    }
    return sourceId;
  }
}

@immutable
class QualityProjectEvaluation {
  const QualityProjectEvaluation({
    required this.projectId,
    required this.assessment,
    required this.model,
    this.evaluatedAt,
    this.outdated = false,
  });

  static QualityProjectEvaluation? tryParse(Object? v) {
    final json = _map(v);
    final assessment = _map(json?['assessment']);
    if (json == null || assessment == null) return null;
    return QualityProjectEvaluation(
      projectId: _str(json['projectId']),
      assessment: QualityProjectAssessment.fromJson(assessment),
      model: _str(json['model']),
      evaluatedAt: _date(json['evaluatedAt']),
      outdated: json['freshness'] == 'outdated',
    );
  }

  final String projectId;
  final QualityProjectAssessment assessment;
  final String model;
  final DateTime? evaluatedAt;
  final bool outdated;
}

enum QualityTaskStatus { queued, running, completed, failed }

@immutable
class QualityEvaluationTask {
  const QualityEvaluationTask({
    required this.status,
    this.jobId,
    this.evaluation,
    this.projectEvaluation,
    this.error,
    this.errorCode,
  });

  static QualityEvaluationTask? tryParse(Object? v) {
    final json = _map(v);
    if (json == null) return null;
    final evaluation = _map(json['evaluation']);
    return QualityEvaluationTask(
      status: switch (json['status']) {
        'running' => QualityTaskStatus.running,
        'completed' => QualityTaskStatus.completed,
        'failed' => QualityTaskStatus.failed,
        _ => QualityTaskStatus.queued,
      },
      jobId: _strOrNull(json['jobId']),
      evaluation: evaluation == null ? null : QualityEvaluation.fromJson(evaluation),
      projectEvaluation: QualityProjectEvaluation.tryParse(json['projectEvaluation']),
      error: _strOrNull(json['error']),
      errorCode: _strOrNull(json['errorCode']),
    );
  }

  final QualityTaskStatus status;
  final String? jobId;
  final QualityEvaluation? evaluation;
  final QualityProjectEvaluation? projectEvaluation;
  final String? error;
  final String? errorCode;

  bool get isPending => status == QualityTaskStatus.queued || status == QualityTaskStatus.running;
}

@immutable
class RelatedPaper {
  const RelatedPaper({
    required this.id,
    required this.title,
    required this.reason,
    required this.sharedTopics,
    this.year,
    this.citations,
  });

  final String id;
  final String title;
  final int? year;
  final int? citations;
  final String reason; // same_topic_newer | same_topic_most_cited | semantic_neighbor
  final List<String> sharedTopics;
}

@immutable
class ReadingTrend {
  const ReadingTrend({
    required this.topic,
    required this.source,
    required this.totalPapers,
    required this.yearly,
    this.growthRatePct,
    this.cagr3yPct,
    this.momentum,
    this.paperYear,
    this.partialYear,
  });

  final String topic;
  final String source; // requested | paper_topic
  final int totalPapers;
  final double? growthRatePct;
  final double? cagr3yPct;
  final double? momentum;
  final List<({int year, int count})> yearly;
  final int? paperYear;

  /// Current incomplete year in [yearly]; its count is partial.
  final int? partialYear;
}

@immutable
class PaperReadingContext {
  const PaperReadingContext({required this.paperId, required this.related, this.trend, this.requestedTopic});

  factory PaperReadingContext.fromJson(Map<String, dynamic> json) {
    final trend = _map(json['trend']);
    return PaperReadingContext(
      paperId: _str(json['paperId']),
      requestedTopic: _strOrNull(json['requestedTopic']),
      trend: trend == null
          ? null
          : ReadingTrend(
              topic: _str(trend['topic']),
              source: _str(trend['source']),
              totalPapers: _int(trend['totalPapers']) ?? 0,
              growthRatePct: _num(trend['growthRatePct']),
              cagr3yPct: _num(trend['cagr3yPct']),
              momentum: _num(trend['momentum']),
              paperYear: _int(trend['paperYear']),
              partialYear: _int(trend['partialYear']),
              yearly: _maps(trend['yearlyBreakdown'])
                  .map((y) => (year: _int(y['year']) ?? 0, count: _int(y['count']) ?? 0))
                  .where((y) => y.year > 0)
                  .toList(),
            ),
      related: _maps(json['related'])
          .map((r) => RelatedPaper(
                id: _str(r['id']),
                title: _str(r['title']),
                year: _int(r['publicationYear']),
                citations: _int(r['citationCount']),
                reason: _str(r['reason']),
                sharedTopics: _strings(r['sharedTopics']),
              ))
          .where((r) => r.id.isNotEmpty)
          .toList(),
    );
  }

  final String paperId;
  final String? requestedTopic;
  final ReadingTrend? trend;
  final List<RelatedPaper> related;
}
