import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// Report states from the API (`ReportStatus` in shared-types).
enum ReportState {
  queued,
  generating,
  ready,
  failed,
  unknown;

  static ReportState parse(String raw) => switch (raw.trim().toLowerCase()) {
        'queued' => queued,
        'generating' => generating,
        'ready' => ready,
        'failed' => failed,
        _ => unknown,
      };

  /// Still being produced: the screen keeps polling.
  bool get inProgress => this == queued || this == generating;

  /// Label key for `context.t`; never the raw code.
  String get label => switch (this) {
        queued => tk('Queued'),
        generating => tk('Generating'),
        ready => tk('Ready'),
        failed => tk('Failed'),
        unknown => tk('Unknown'),
      };

  /// Status colour only where it means a status: in progress is the accent.
  Color color(LumiColors lumi) => switch (this) {
        ready => lumi.success,
        failed => lumi.error,
        queued || generating => lumi.primary,
        unknown => lumi.muted,
      };

  IconData get icon => switch (this) {
        ready => Icons.check_circle_outline,
        failed => Icons.error_outline,
        queued => Icons.schedule,
        generating => Icons.sync,
        unknown => Icons.help_outline,
      };
}

/// Icon and word for a report state.
class ReportStatusLabel extends StatelessWidget {
  const ReportStatusLabel({required this.status, super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final state = ReportState.parse(status);
    final color = state.color(context.lumi);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(state.icon, size: 16, color: color),
        const SizedBox(width: 4),
        // Wraps on a narrow screen with large text instead of overflowing.
        Flexible(
          child: Text(
            context.t(state.label),
            style:
                Theme.of(context).textTheme.labelMedium?.copyWith(color: color),
          ),
        ),
      ],
    );
  }
}
