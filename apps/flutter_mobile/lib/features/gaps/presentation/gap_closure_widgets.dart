import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';

/// Rounds [bound] x 100 UP to one decimal, e.g. 0.1533 -> 15.4 and 0.15 -> 15.0.
/// The small epsilon keeps binary noise (0.15 * 1000 = 150.00000000000003) from rounding up a whole step.
double closureRiskPercent(double bound) {
  final clamped = bound.clamp(0.0, 1.0);
  final tenths = (clamped * 1000 - 1e-9).ceil();
  return (tenths < 0 ? 0 : tenths) / 10;
}

/// "15.4" for a bound of 0.1533.
String formatClosureRiskPercent(double bound) =>
    closureRiskPercent(bound).toStringAsFixed(1);

/// "0.1534" for a bound of 0.15331: rounded UP at four decimals so the shown
/// bound is never below the real one.
String formatClosureBound(double bound) {
  final clamped = bound.clamp(0.0, 1.0);
  final units = (clamped * 10000 - 1e-9).ceil();
  return ((units < 0 ? 0 : units) / 10000).toStringAsFixed(4);
}

/// "2026-10-15" in the device time zone.
String formatClosureDate(DateTime value) {
  final local = value.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)}';
}

/// "AI" or "Human-confirmed"; null when the check does not name a judge.
String? closureJudgeLabel(String? judgeKind) {
  switch (judgeKind?.toUpperCase()) {
    case 'AI':
      return 'AI';
    case 'HUMAN':
      return 'Human-confirmed';
    default:
      return null;
  }
}

/// Text, icon and colours of the closure badge for one gap.
@immutable
class ClosureBadgeSpec {
  const ClosureBadgeSpec({
    required this.label,
    required this.semanticsLabel,
    required this.icon,
    required this.lightColor,
    required this.darkColor,
  });

  /// Maps a gap to its badge. "Open" shows the false-novelty risk only when
  /// the bound is known.
  factory ClosureBadgeSpec.forGap(ResearchGapItem gap) {
    switch (gap.closureStatus) {
      case GapClosureStatus.closed:
        return const ClosureBadgeSpec(
          label: 'Already answered',
          semanticsLabel:
              'Closure check: already answered by an existing paper',
          icon: Icons.do_not_disturb_on_outlined,
          lightColor: Color(0xFFB91C1C),
          darkColor: Color(0xFFFCA5A5),
        );
      case GapClosureStatus.openCertified:
        final bound = gap.latestClosureCheck?.bound;
        if (bound == null) {
          return const ClosureBadgeSpec(
            label: 'Open',
            semanticsLabel: 'Closure check: open, certified',
            icon: Icons.verified_outlined,
            lightColor: Color(0xFF047857),
            darkColor: Color(0xFF6EE7B7),
          );
        }
        final percent = formatClosureRiskPercent(bound);
        return ClosureBadgeSpec(
          label: 'Open · risk ≤ $percent%',
          semanticsLabel:
              'Closure check: open, false-novelty risk at most $percent percent',
          icon: Icons.verified_outlined,
          lightColor: const Color(0xFF047857),
          darkColor: const Color(0xFF6EE7B7),
        );
      case GapClosureStatus.abstain:
        return const ClosureBadgeSpec(
          label: 'Needs review',
          semanticsLabel:
              'Closure check: needs review, no decision could be made',
          icon: Icons.rate_review_outlined,
          lightColor: Color(0xFF92400E),
          darkColor: Color(0xFFFCD34D),
        );
      case GapClosureStatus.notChecked:
        return const ClosureBadgeSpec(
          label: 'Not checked',
          semanticsLabel: 'Closure check: not checked yet',
          icon: Icons.help_outline,
          lightColor: Color(0xFF475569),
          darkColor: Color(0xFFCBD5E1),
        );
    }
  }

  final String label;
  final String semanticsLabel;
  final IconData icon;
  final Color lightColor;
  final Color darkColor;

  Color color({required bool isDark}) => isDark ? darkColor : lightColor;
}

/// Small pill with an icon and text (never colour alone) for the closure
/// result of a gap.
class GapClosureBadge extends StatelessWidget {
  const GapClosureBadge({super.key, required this.gap});

  final ResearchGapItem gap;

  @override
  Widget build(BuildContext context) {
    final spec = ClosureBadgeSpec.forGap(gap);
    final color = spec.color(
      isDark: Theme.of(context).brightness == Brightness.dark,
    );

    return Semantics(
      label: spec.semanticsLabel,
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            border: Border.all(color: color.withValues(alpha: 0.4)),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(spec.icon, size: 14, color: color),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  spec.label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Closure check" block of the gap detail sheet. Read-only: screening and
/// decisions happen on the web app.
class GapClosureSection extends StatelessWidget {
  const GapClosureSection({super.key, required this.gap});

  final ResearchGapItem gap;

  static const webNote = 'Screening and decisions are done on the web app.';

  @override
  Widget build(BuildContext context) {
    final check = gap.latestClosureCheck;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mutedColor = isDark
        ? const Color(0xFFCBD5E1)
        : const Color(0xFF475569);
    final judge = closureJudgeLabel(check?.judgeKind);
    final bound = check?.bound;
    final decidedAt = check?.decidedAt;
    final progress = _progressNote(check);

    final rows = <Widget>[
      if (bound != null)
        _row(
          'Bound',
          'B ≤ ${formatClosureBound(bound)} (false-novelty risk)',
          mutedColor,
        ),
      if (judge != null) _row('Judge', judge, mutedColor),
      if (decidedAt != null)
        _row('Decided', formatClosureDate(decidedAt), mutedColor),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Closure check',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            color: mutedColor,
          ),
        ),
        const SizedBox(height: 8),
        GapClosureBadge(gap: gap),
        if (progress != null) ...[
          const SizedBox(height: 8),
          Text(progress, style: const TextStyle(fontSize: 12, height: 1.4)),
        ],
        if (rows.isNotEmpty) ...[const SizedBox(height: 8), ...rows],
        const SizedBox(height: 8),
        Text(
          webNote,
          style: TextStyle(
            fontSize: 12,
            fontStyle: FontStyle.italic,
            height: 1.4,
            color: mutedColor,
          ),
        ),
      ],
    );
  }

  /// A check can be running or failed without a decision yet; say so instead
  /// of showing only "Not checked".
  static String? _progressNote(GapClosureSummary? check) {
    switch (check?.status.toUpperCase()) {
      case 'QUEUED':
      case 'SEARCHING':
      case 'SCREENING':
        return 'A closure check is in progress.';
      case 'FAILED':
        return 'The last closure check failed.';
      default:
        return null;
    }
  }

  Widget _row(String label, String value, Color labelColor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: TextStyle(fontSize: 12, color: labelColor),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
