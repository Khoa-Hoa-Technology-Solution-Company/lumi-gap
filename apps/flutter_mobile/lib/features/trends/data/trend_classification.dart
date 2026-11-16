/// Trend verdict of a topic, decided by the API (Mann-Kendall test on the
/// topic's yearly share of its field). The app never derives a direction
/// itself: raw-count growth and momentum are descriptive figures only, and
/// the API marks them deprecated for ranking or labelling.
///
/// Same rules as the web (`apps/web/src/pages/trends.insights.ts`).
library;

/// Unknown or missing values are `insufficient`: a direction the API did not
/// conclude is never shown.
enum TrendVerdict {
  rising,
  declining,
  stable,
  insufficient;

  static TrendVerdict parse(Object? raw) {
    if (raw is String) {
      for (final v in values) {
        if (v.name == raw) return v;
      }
    }
    return TrendVerdict.insufficient;
  }
}

/// Only given for rising or declining topics.
enum TrendConfidence {
  high,
  medium;

  static TrendConfidence? parse(Object? raw) => switch (raw) {
        'high' => TrendConfidence.high,
        'medium' => TrendConfidence.medium,
        _ => null,
      };
}

class TrendClassification {
  const TrendClassification({
    required this.verdict,
    this.confidence,
    this.yearsUsed = 0,
    this.totalPapers = 0,
    this.relativeChangePct,
    this.reasons = const [],
  });

  factory TrendClassification.fromJson(Object? raw) {
    if (raw is! Map<String, dynamic>) return none;
    final verdict = TrendVerdict.parse(raw['verdict']);
    final change = raw['relativeChangePct'];
    return TrendClassification(
      verdict: verdict,
      // Confidence only means something with a direction.
      confidence: verdict == TrendVerdict.rising ||
              verdict == TrendVerdict.declining
          ? TrendConfidence.parse(raw['confidence'])
          : null,
      yearsUsed: (raw['yearsUsed'] as num?)?.toInt() ?? 0,
      totalPapers: (raw['totalPapers'] as num?)?.toInt() ?? 0,
      relativeChangePct:
          change is num && change.isFinite ? change.toDouble() : null,
      reasons: [
        for (final r in raw['reasons'] as List<dynamic>? ?? const [])
          if (r is String) r,
      ],
    );
  }

  /// What a topic without a classification is treated as.
  static const TrendClassification none =
      TrendClassification(verdict: TrendVerdict.insufficient);

  final TrendVerdict verdict;
  final TrendConfidence? confidence;

  /// Complete years the test used.
  final int yearsUsed;

  /// Topic papers in those years.
  final int totalPapers;

  /// Sen's slope over the median share, % per year. Shown only next to a
  /// verdict that is not `insufficient`.
  final double? relativeChangePct;
  final List<String> reasons;

  /// The % per year figure to show, or null when there is none to show.
  double? get shownChangePct =>
      verdict == TrendVerdict.insufficient ? null : relativeChangePct;
}

const Map<TrendVerdict, int> _verdictOrder = {
  TrendVerdict.rising: 0,
  TrendVerdict.stable: 1,
  TrendVerdict.declining: 2,
  TrendVerdict.insufficient: 3,
};

/// Web order: rising (largest change first), stable, declining (most
/// negative first), insufficient; then more papers first; then by name so
/// the order never depends on the API's order.
int compareByTrend(
  ({TrendClassification classification, int totalPapers, String topic}) a,
  ({TrendClassification classification, int totalPapers, String topic}) b,
) {
  final va = a.classification.verdict;
  final vb = b.classification.verdict;
  if (va != vb) return _verdictOrder[va]! - _verdictOrder[vb]!;
  final ca = a.classification.relativeChangePct ?? 0;
  final cb = b.classification.relativeChangePct ?? 0;
  if (va == TrendVerdict.rising && ca != cb) return cb.compareTo(ca);
  if (va == TrendVerdict.declining && ca != cb) return ca.compareTo(cb);
  if (a.totalPapers != b.totalPapers) {
    return b.totalPapers.compareTo(a.totalPapers);
  }
  return a.topic.compareTo(b.topic);
}
