import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_confirm_sheet.dart';
import 'package:flutter_mobile/features/reviews/data/review_requests_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Backend limit of a decline reason (review.routes.ts `declineRequestSchema`).
const declineReasonMax = 2000;

/// Accept, decline/withdraw and cancel, worded as on the web
/// (review-dashboard.tsx, review-request-detail.tsx). Each returns true when
/// the request changed; the caller shows its own busy state. Lists are
/// refreshed through the provider container, so it still works after the
/// screen closed.
class ReviewActions {
  ReviewActions(BuildContext context)
      : _container = ProviderScope.containerOf(context, listen: false),
        _messenger = ScaffoldMessenger.of(context),
        _locale = context.appLocale;

  final ProviderContainer _container;
  final ScaffoldMessengerState _messenger;
  final AppLocale _locale;

  ReviewRequestsApi get _api => _container.read(reviewRequestsApiProvider);

  void _say(String key) =>
      _messenger.showSnackBar(SnackBar(content: Text(translate(key, _locale))));

  void _refresh(String id) {
    _container
      ..invalidate(reviewCenterProvider)
      ..invalidate(reviewRequestProvider(id));
  }

  Future<bool> accept(ReviewRequest request) async {
    try {
      await _api.accept(request.id);
      _say(tk('Review request accepted'));
      return true;
    } on Object catch (e) {
      _say(isConnectionFailure(e)
          ? failureMessageKey(e)
          : tk('This request could not be accepted'));
      return false;
    } finally {
      _refresh(request.id);
    }
  }

  /// Asks first (with an optional reason), then declines or withdraws.
  Future<bool> decline(BuildContext context, ReviewRequest request) async {
    final withdrawing = request.status != 'REQUESTED';
    final reason = await showLumiInputSheet(
      context,
      title: withdrawing
          ? context.t('Withdraw from this review?')
          : context.t('Decline review request?'),
      message: context.t('The requester will be notified. A short reason helps them choose another reviewer.'),
      field: LumiSheetField(
        label: context.t('Reason (optional)'),
        hint: context.t('Workload, subject mismatch, or conflict of interest'),
        maxLength: declineReasonMax,
        minLines: 3,
        maxLines: 6,
      ),
      confirmText: withdrawing ? context.t('Withdraw') : context.t('Decline request'),
      cancelText: context.t('Keep request'),
      destructive: true,
    );
    if (reason == null) return false;
    try {
      await _api.decline(request.id, reason: reason.isEmpty ? null : reason);
      _say(withdrawing
          ? tk('You withdrew from this review')
          : tk('Review request declined'));
      return true;
    } on Object catch (e) {
      _say(switch (failureStatus(e)) {
        409 when withdrawing =>
          tk('You already submitted a review round, so you can no longer withdraw from this review'),
        409 => tk('This review request can no longer be declined'),
        null when isConnectionFailure(e) => failureMessageKey(e),
        _ => tk('This request could not be declined'),
      });
      return false;
    } finally {
      _refresh(request.id);
    }
  }

  /// The requester takes the request back.
  Future<bool> cancel(BuildContext context, ReviewRequest request) async {
    final ok = await showLumiConfirmSheet(
      context,
      title: context.t('Cancel this review request?'),
      message: context.t('The reviewer will lose access to the assigned review workspace. Existing submitted feedback is never deleted.'),
      confirmText: context.t('Cancel request'),
      cancelText: context.t('Keep request'),
      destructive: true,
    );
    if (ok != true) return false;
    try {
      await _api.cancel(request.id);
      _say(tk('Review request cancelled'));
      return true;
    } on Object catch (e) {
      _say(isConnectionFailure(e)
          ? failureMessageKey(e)
          : tk('This request can no longer be cancelled'));
      return false;
    } finally {
      _refresh(request.id);
    }
  }
}
