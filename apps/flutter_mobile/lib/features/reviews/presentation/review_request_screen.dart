import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/reviews/data/review_requests_api.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_actions.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_center_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// "MINOR_REVISION" → "MINOR REVISION", as the web shows assessments.
String _code(String value) => value.replaceAll('_', ' ');

/// One review request (review-request-detail.tsx): who, what, due, the
/// rounds of feedback, and the answers the viewer may give from a phone.
class ReviewRequestScreen extends ConsumerStatefulWidget {
  const ReviewRequestScreen({required this.id, super.key});
  final String id;

  @override
  ConsumerState<ReviewRequestScreen> createState() => _ReviewRequestScreenState();
}

class _ReviewRequestScreenState extends ConsumerState<ReviewRequestScreen> {
  bool _busy = false;

  Future<void> _act(Future<bool> Function(ReviewActions) run) async {
    if (_busy) return;
    setState(() => _busy = true);
    await run(ReviewActions(context));
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(reviewRequestProvider(widget.id));
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Review request'))),
      body: SafeArea(
        child: switch (query) {
          AsyncValue(:final value?) => _body(context, value),
          AsyncValue(:final error?) => LumiErrorState(
              message: failureStatus(error) == 403 || failureStatus(error) == 404
                  ? context.t('This review request is unavailable or you do not have access.')
                  : context.t(failureMessageKey(error)),
              retrying: query.isLoading,
              onRetry: () => ref.invalidate(reviewRequestProvider(widget.id)),
            ),
          _ => const LumiPageSkeleton(rows: 3, height: 120),
        },
      ),
    );
  }

  Widget _body(BuildContext context, ReviewRequest r) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final locale = context.appLocale;
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary);
    final me = ref.watch(currentUserProvider)?.id;
    final canReview = ref.watch(canReviewProvider).value ?? false;
    final isRequester = me != null && me == r.requester.id;
    final isReviewer = me != null && me == r.reviewer.id;
    final now = DateTime.now();
    final canCancel = isRequester && r.requesterCanCancel(now);
    final acceptedNotOverdue = isRequester &&
        (r.status == 'ACCEPTED' || r.status == 'IN_REVIEW') &&
        !r.deadline.isBefore(now);
    final answerNew = isReviewer && canReview && r.status == 'REQUESTED';
    final working = isReviewer &&
        canReview &&
        reviewActiveStatuses.contains(r.status) &&
        r.status != 'REVISION_REQUESTED';

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(reviewRequestProvider(widget.id));
        try {
          await ref.read(reviewRequestProvider(widget.id).future);
        } on Object catch (_) {}
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              LumiChip(label: context.t(reviewStatusLabel(r.status)), tone: reviewStatusTone(r.status)),
              LumiChip(label: r.typeLabel ?? context.t('Research artifact')),
              LumiChip(label: context.t('Revision {{n}}', {'n': r.revisionNumber})),
            ],
          ),
          const SizedBox(height: 12),
          Text(r.title, style: theme.textTheme.headlineSmall),
          const SizedBox(height: 12),
          _Fact(label: context.t('Requested by'), value: r.requester.fullName),
          _Fact(label: context.t('Reviewer'), value: r.reviewer.fullName),
          _Fact(
            label: context.t('Due date'),
            value: r.dueAt == null ? context.t('No due date') : formatShortDate(r.dueAt!, locale),
          ),
          if (r.mentorRelationshipActive) ...[
            const SizedBox(height: 8),
            Text(context.t('This reviewer also mentors this project. The formal review request is a separate agreement.'), style: secondary),
          ],
          if (r.message != null) ...[
            const SizedBox(height: 8),
            Text(r.message!, style: secondary),
          ],
          if (acceptedNotOverdue) ...[
            const SizedBox(height: 12),
            LumiCard(
              child: Text(context.t(
                'The reviewer has accepted this request, so it can no longer be cancelled. If the review is still not delivered after {{date}}, you can cancel it and invite another reviewer.',
                {'date': formatShortDate(r.deadline, locale)},
              )),
            ),
          ],
          if (answerNew || working || canCancel) ...[
            const SizedBox(height: 16),
            if (answerNew) ...[
              FilledButton(
                onPressed: _busy ? null : () => unawaited(_act((a) => a.accept(r))),
                child: Text(_busy ? context.t('Updating…') : context.t('Accept')),
              ),
              const SizedBox(height: 8),
            ],
            if (working)
              FilledButton.icon(
                onPressed: () => unawaited(openWebPage(context, ref, '/reviews/${Uri.encodeComponent(r.assignmentId)}')),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text(r.latestRoundStatus == 'DRAFT' ? context.t('Continue Review') : context.t('Start Review')),
              ),
            if (answerNew || (working && r.canWithdraw)) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy ? null : () => unawaited(_act((a) => a.decline(context, r))),
                child: Text(answerNew ? context.t('Decline') : context.t('Withdraw')),
              ),
            ],
            if (canCancel)
              TextButton(
                style: TextButton.styleFrom(foregroundColor: lumi.error),
                onPressed: _busy ? null : () => unawaited(_act((a) => a.cancel(context, r))),
                child: Text(context.t('Cancel request')),
              ),
          ],
          if (isRequester && r.status == 'REVISION_REQUESTED') ...[
            const SizedBox(height: 16),
            LumiCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.t('Respond and Submit Revision'), style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(context.t('Update the artifact first, then explain how each required revision was addressed.'), style: secondary),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => unawaited(openWebPage(context, ref, '/review-requests/${Uri.encodeComponent(r.id)}')),
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: Text(context.t('Continue on the web')),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
          LumiSectionHeader(title: context.t('Review History')),
          if (r.rounds.isEmpty)
            LumiCard(child: Text(context.t('The reviewer has not submitted feedback yet.'), style: secondary))
          else
            for (final round in r.rounds) ...[
              _RoundCard(round: round),
              const SizedBox(height: 8),
            ],
          if (r.status == 'COMPLETED') ...[
            const SizedBox(height: 8),
            Text(context.t('This academic review is complete. Every review round remains available above.'), style: secondary),
          ],
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(text: '$label: ', style: TextStyle(color: context.lumi.foregroundSecondary)),
            TextSpan(text: value, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
        style: theme.textTheme.bodyMedium,
      ),
    );
  }
}

class _RoundCard extends StatelessWidget {
  const _RoundCard({required this.round});
  final ReviewRound round;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary);
    Widget part(String title, String? text) => text == null
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.titleSmall),
                const SizedBox(height: 2),
                Text(text, style: theme.textTheme.bodyMedium),
              ],
            ),
          );
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.t('Review Round {{n}}', {'n': round.roundNumber}), style: secondary),
          Text(
            round.overallAssessment == null ? _code(round.status) : _code(round.overallAssessment!),
            style: theme.textTheme.titleMedium,
          ),
          if (round.submittedAt != null)
            Text(
              context.t('Submitted {{date}}', {'date': formatShortDate(round.submittedAt!, context.appLocale)}),
              style: secondary,
            ),
          part(context.t('Key Strengths'), round.keyStrengths),
          part(context.t('Key Concerns'), round.keyConcerns),
          part(context.t('Overall Comment'), round.overallComment),
          if (round.requiredRevisions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(context.t('Required Revisions'), style: theme.textTheme.titleSmall),
            for (final item in round.requiredRevisions)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LumiChip(
                      label: item.priority,
                      tone: item.priority == 'MAJOR' ? LumiChipTone.error : LumiChipTone.warning,
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(item.description, style: theme.textTheme.bodyMedium)),
                    const SizedBox(width: 8),
                    Text(_code(item.status), style: secondary),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}
