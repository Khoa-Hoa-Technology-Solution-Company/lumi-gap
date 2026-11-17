import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';

/// Where a paper the user requested or uploaded stands, from the backend's
/// workflow (`papers/paper-workflow.ts`, `PAPER_REQUEST_STATUSES`).
///
/// `not-downloaded` means two things there: a request that has no PDF and
/// is not live yet (`dataStatus` "draft"), or one an admin approved that
/// still waits for its PDF (`dataStatus` "active"). Only the data status
/// tells them apart.
enum PaperRequestState {
  pendingReview,
  awaitingYourAcceptance,
  approvedAwaitingPdf,
  submittedNoPdf,
  completed,
  rejected,
  unknown;

  static PaperRequestState of({
    required String? paperStatus,
    required String? dataStatus,
  }) =>
      switch (paperStatus) {
        'pending' => pendingReview,
        'pending-requester-acceptance' => awaitingYourAcceptance,
        'not-downloaded' =>
          dataStatus == 'active' ? approvedAwaitingPdf : submittedNoPdf,
        'downloaded' => completed,
        'rejected' => rejected,
        _ => unknown,
      };

  /// English key; show with `context.t`.
  String get label => switch (this) {
        pendingReview => tk('Pending review'),
        awaitingYourAcceptance => tk('PDF waiting for your acceptance'),
        approvedAwaitingPdf => tk('Approved, waiting for a PDF'),
        submittedNoPdf => tk('Submitted, no PDF yet'),
        completed => tk('Completed'),
        rejected => tk('Rejected'),
        unknown => tk('Status unknown'),
      };

  LumiChipTone get tone => switch (this) {
        pendingReview || submittedNoPdf => LumiChipTone.warning,
        awaitingYourAcceptance || approvedAwaitingPdf => LumiChipTone.primary,
        completed => LumiChipTone.success,
        rejected => LumiChipTone.error,
        unknown => LumiChipTone.neutral,
      };

  IconData get icon => switch (this) {
        pendingReview => Icons.hourglass_top,
        awaitingYourAcceptance => Icons.task_alt,
        approvedAwaitingPdf || submittedNoPdf => Icons.upload_file,
        completed => Icons.check_circle_outline,
        rejected => Icons.cancel_outlined,
        unknown => Icons.help_outline,
      };

  /// The user has something to do on this paper.
  bool get needsYou => this == awaitingYourAcceptance || this == rejected;
}
