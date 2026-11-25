/// Trend verdict of a topic, decided by the API (Mann-Kendall test on the
/// topic's yearly share of the Information Technology scope, spec
/// 2026-11-14). The app never derives a direction itself: raw-count growth is
/// a descriptive figure only.
///
/// Same rules as the web (`apps/web/src/features/trends`) and the backend
/// (`trend.verdict.ts`).
library;

/// Unknown or missing values are `insufficient`: a direction the API did not
/// conclude is never shown.
enum TrendVerdict {
  rising('rising'),
  saturated('saturated'),
  pastPeak('past_peak'),
  declining('declining'),
  stable('stable'),
  insufficient('insufficient');

  const TrendVerdict(this.apiName);

  /// The value the API sends (`past_peak`, not `pastPeak`).
  final String apiName;

  static TrendVerdict parse(Object? raw) {
    if (raw is String) {
      for (final v in values) {
        if (v.apiName == raw) return v;
      }
    }
    return TrendVerdict.insufficient;
  }

  /// Verdicts that carry a direction, hence a confidence and a change figure.
  bool get hasDirection =>
      this != TrendVerdict.stable && this != TrendVerdict.insufficient;
}

/// Only given for rising, saturated, past-peak and declining topics.
enum TrendConfidence {
  high,
  medium;

  static TrendConfidence? parse(Object? raw) => switch (raw) {
    'high' => TrendConfidence.high,
    'medium' => TrendConfidence.medium,
    _ => null,
  };
}

/// The single trend conclusion of a topic (packages/shared-types
/// TrendClassification). Only the fields the app shows are kept.
class TrendClassification {
  const TrendClassification({
    required this.verdict,
    this.confidence,
    this.yearsUsed = 0,
    this.totalPapers = 0,
    this.pValue,
    this.qValue,
    this.senSlope,
    this.relativeChangePct,
    this.recentRelativeChangePct,
    this.peakRatio,
    this.reasons = const [],
  });

  /// [none] when [raw] is not an object.
  factory TrendClassification.fromJson(Object? raw) => tryParse(raw) ?? none;

  /// Null when [raw] is not an object: the topic then has no conclusion.
  static TrendClassification? tryParse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final verdict = TrendVerdict.parse(raw['verdict']);
    final mk = raw['mannKendall'];
    return TrendClassification(
      verdict: verdict,
      // Confidence only means something with a direction.
      confidence: verdict.hasDirection
          ? TrendConfidence.parse(raw['confidence'])
          : null,
      yearsUsed: (raw['yearsUsed'] as num?)?.toInt() ?? 0,
      totalPapers: (raw['totalPapers'] as num?)?.toInt() ?? 0,
      pValue: mk is Map<String, dynamic> ? _finite(mk['pValue']) : null,
      qValue: _finite(raw['qValue']),
      senSlope: _finite(raw['senSlope']),
      relativeChangePct: _finite(raw['relativeChangePct']),
      recentRelativeChangePct: _finite(raw['recentRelativeChangePct']),
      peakRatio: _finite(raw['peakRatio']),
      reasons: [
        for (final r in raw['reasons'] as List<dynamic>? ?? const [])
          if (r is String) r,
      ],
    );
  }

  /// What a topic without a classification is treated as.
  static const TrendClassification none = TrendClassification(
    verdict: TrendVerdict.insufficient,
  );

  final TrendVerdict verdict;
  final TrendConfidence? confidence;

  /// Complete years the test used.
  final int yearsUsed;

  /// Topic papers in those years.
  final int totalPapers;
  final double? pValue;

  /// Benjamini-Hochberg q-value; only in the overview list.
  final double? qValue;

  /// Sen's slope of the share, percentage points per year.
  final double? senSlope;

  /// Sen's slope / median share x 100, % per year, over the whole window.
  final double? relativeChangePct;

  /// The same over the recent 5 years.
  final double? recentRelativeChangePct;

  /// Median share of the last 3 years / highest share of the window, 0..1.
  final double? peakRatio;
  final List<String> reasons;

  /// The change figure that goes with the verdict, as on the web: the recent
  /// change for saturated and past-peak topics, the whole window otherwise.
  double? get headlineChangePct =>
      verdict == TrendVerdict.saturated || verdict == TrendVerdict.pastPeak
      ? recentRelativeChangePct
      : relativeChangePct;

  /// The % per year figure to show, or null when there is none to show
  /// (never next to "Insufficient data").
  double? get shownChangePct =>
      verdict == TrendVerdict.insufficient ? null : headlineChangePct;
}

double? _finite(Object? raw) =>
    raw is num && raw.isFinite ? raw.toDouble() : null;

const Map<TrendVerdict, int> _verdictOrder = {
  TrendVerdict.rising: 0,
  TrendVerdict.saturated: 1,
  TrendVerdict.stable: 2,
  TrendVerdict.pastPeak: 3,
  TrendVerdict.declining: 4,
  TrendVerdict.insufficient: 5,
};

/// Backend and web order (`compareByTrend` in trend.verdict.ts): rising
/// (largest change first), saturated, stable, past its peak, declining (most
/// negative first), insufficient; then more papers first; then by name so the
/// order never depends on the API's order.
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
