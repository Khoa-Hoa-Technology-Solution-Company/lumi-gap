import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
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
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => _DeclineDialog(withdrawing: withdrawing),
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
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('Cancel this review request?')),
        content: Text(context.t('The reviewer will lose access to the assigned review workspace. Existing submitted feedback is never deleted.')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.t('Keep request')),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: context.lumi.error),
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.t('Cancel request')),
          ),
        ],
      ),
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

/// Returns the reason ('' for none), or null when kept.
class _DeclineDialog extends StatefulWidget {
  const _DeclineDialog({required this.withdrawing});
  final bool withdrawing;

  @override
  State<_DeclineDialog> createState() => _DeclineDialogState();
}

class _DeclineDialogState extends State<_DeclineDialog> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.withdrawing
          ? context.t('Withdraw from this review?')
          : context.t('Decline review request?')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.t('The requester will be notified. A short reason helps them choose another reviewer.')),
            const SizedBox(height: 16),
            TextField(
              controller: _reason,
              maxLength: declineReasonMax,
              minLines: 3,
              maxLines: 6,
              decoration: InputDecoration(
                labelText: context.t('Reason (optional)'),
                hintText: context.t('Workload, subject mismatch, or conflict of interest'),
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(context.t('Keep request')),
        ),
        TextButton(
          style: TextButton.styleFrom(foregroundColor: context.lumi.error),
          onPressed: () => Navigator.pop(context, _reason.text.trim()),
          child: Text(widget.withdrawing
              ? context.t('Withdraw')
              : context.t('Decline request')),
        ),
      ],
    );
  }
}
