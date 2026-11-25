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
import 'package:flutter_mobile/features/reviews/data/review_requests_api.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_actions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

String reviewTabLabel(ReviewTab tab) => switch (tab) {
  ReviewTab.incoming => tk('Incoming'),
  ReviewTab.sent => tk('Sent'),
  ReviewTab.progress => tk('In progress'),
  ReviewTab.completed => tk('Completed'),
};

LumiChipTone reviewStatusTone(String status) => switch (status) {
  'COMPLETED' => LumiChipTone.success,
  'DECLINED' || 'CANCELLED' || 'EXPIRED' => LumiChipTone.error,
  'REQUESTED' || 'REVISION_REQUESTED' => LumiChipTone.warning,
  _ => LumiChipTone.primary,
};

/// The web Review Center (review-dashboard.tsx): invitations to review,
/// requests I sent, reviews in progress and history. Writing a review stays
/// on the web.
class ReviewCenterScreen extends ConsumerStatefulWidget {
  const ReviewCenterScreen({super.key});

  @override
  ConsumerState<ReviewCenterScreen> createState() => _ReviewCenterScreenState();
}

class _ReviewCenterScreenState extends ConsumerState<ReviewCenterScreen> {
  ReviewTab _tab = ReviewTab.incoming;

  /// Request being accepted or declined: one at a time.
  String? _busy;

  Future<void> _act(
    ReviewRequest r,
    Future<bool> Function(ReviewActions) run, {
    ReviewTab? onSuccess,
  }) async {
    if (_busy != null) return;
    setState(() => _busy = r.id);
    final ok = await run(ReviewActions(context));
    if (!mounted) return;
    setState(() {
      _busy = null;
      if (ok && onSuccess != null) _tab = onSuccess;
    });
  }

  Future<void> _refresh() async {
    ref.invalidate(reviewCenterProvider);
    try {
      await ref.read(reviewCenterProvider.future);
    } on Object catch (_) {
      // Shown by the error state.
    }
  }

  @override
  Widget build(BuildContext context) {
    final center = ref.watch(reviewCenterProvider);
    final canReview = ref.watch(canReviewProvider).value ?? false;
    final Widget body;
    if (center.hasValue) {
      final data = center.requireValue;
      final items = reviewTabItems(data, _tab);
      body = RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          children: [
            _TabChips(
              selected: _tab,
              counts: {
                for (final t in ReviewTab.values)
                  t: reviewTabItems(data, t).length,
              },
              onChanged: (t) => setState(() => _tab = t),
            ),
            const SizedBox(height: 12),
            if (items.isEmpty)
              _Empty(tab: _tab)
            else
              for (final r in items) ...[
                ReviewRequestCard(
                  request: r,
                  sentTab: _tab == ReviewTab.sent,
                  canReview: canReview,
                  busy: _busy == r.id,
                  locked: _busy != null,
                  onOpen: () =>
                      unawaited(context.push('/review-requests/${r.id}')),
                  onAccept: () => unawaited(
                    _act(r, (a) => a.accept(r), onSuccess: ReviewTab.progress),
                  ),
                  onDecline: () =>
                      unawaited(_act(r, (a) => a.decline(context, r))),
                ),
                const SizedBox(height: 8),
              ],
          ],
        ),
      );
    } else if (center.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(center.error!)),
        retrying: center.isLoading,
        onRetry: () => ref.invalidate(reviewCenterProvider),
      );
    } else {
      body = const LumiPageSkeleton(rows: 3, height: 120);
    }
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Review Center'))),
      body: SafeArea(child: body),
    );
  }
}

class _TabChips extends StatelessWidget {
  const _TabChips({
    required this.selected,
    required this.counts,
    required this.onChanged,
  });
  final ReviewTab selected;
  final Map<ReviewTab, int> counts;
  final ValueChanged<ReviewTab> onChanged;

  @override
  Widget build(BuildContext context) {
    // Scrolls sideways like the web tab bar: four labels with counts do not
    // fit a 320dp screen side by side.
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final tab in ReviewTab.values) ...[
            ChoiceChip(
              label: Text(
                '${context.t(reviewTabLabel(tab))} ${counts[tab] ?? 0}',
              ),
              selected: tab == selected,
              // Tabs, not a multi-select filter: no check mark.
              showCheckmark: false,
              onSelected: (_) => onChanged(tab),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.tab});
  final ReviewTab tab;

  @override
  Widget build(BuildContext context) {
    final title = switch (tab) {
      ReviewTab.incoming => context.t('No incoming reviews'),
      ReviewTab.sent => context.t('No active requests sent'),
      ReviewTab.progress => context.t('No reviews in progress'),
      ReviewTab.completed => context.t('No completed review history'),
    };
    return LumiEmptyState(
      icon: Icons.inbox_outlined,
      title: title,
      message: tab == ReviewTab.incoming
          ? context.t("You don't have any review requests right now.")
          : context.t('Review activity will appear here when available.'),
    );
  }
}

/// One request: what, its status, who and when, and what I can do now.
class ReviewRequestCard extends ConsumerWidget {
  const ReviewRequestCard({
    required this.request,
    required this.sentTab,
    required this.canReview,
    required this.busy,
    required this.locked,
    required this.onOpen,
    required this.onAccept,
    required this.onDecline,
    super.key,
  });

  final ReviewRequest request;
  final bool sentTab;
  final bool canReview;
  final bool busy;
  final bool locked;
  final VoidCallback onOpen;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final r = request;
    final secondary = theme.textTheme.bodyMedium?.copyWith(
      color: context.lumi.foregroundSecondary,
    );
    final who = sentTab
        ? context.t('Reviewer: {{name}}', {'name': r.reviewer.fullName})
        : context.t('Requested by {{name}}', {'name': r.requester.fullName});
    final due = r.dueAt == null
        ? ''
        : ' · ${context.t('Due {{date}}', {'date': formatShortDate(r.dueAt!, context.appLocale)})}';
    final newRequest = canReview && !sentTab && r.status == 'REQUESTED';
    final working =
        canReview &&
        !sentTab &&
        reviewActiveStatuses.contains(r.status) &&
        r.status != 'REVISION_REQUESTED';
    return LumiCard(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              LumiChip(label: r.typeLabel ?? context.t('Research artifact')),
              LumiChip(
                label: context.t(reviewStatusLabel(r.status)),
                tone: reviewStatusTone(r.status),
              ),
              Text(
                context.t('Revision {{n}}', {'n': r.revisionNumber}),
                style: secondary,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(r.title, style: theme.textTheme.titleMedium),
          const SizedBox(height: 2),
          Text('$who$due', style: secondary),
          if (r.message != null) ...[
            const SizedBox(height: 8),
            Text(
              r.message!,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: secondary,
            ),
          ],
          if (newRequest || working) ...[
            const SizedBox(height: 12),
            // The buttons' strip keeps its taps: a tap on a locked button
            // must not fall through and open the card.
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {},
              child: Row(
                children: [
                  if (newRequest || r.canWithdraw) ...[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: locked ? null : onDecline,
                        child: Text(
                          newRequest
                              ? context.t('Decline')
                              : context.t('Withdraw'),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: newRequest
                        ? FilledButton(
                            onPressed: locked ? null : onAccept,
                            child: Text(
                              busy
                                  ? context.t('Updating…')
                                  : context.t('Accept'),
                            ),
                          )
                        : FilledButton.icon(
                            onPressed: () => unawaited(
                              openWebPage(
                                context,
                                ref,
                                '/reviews/${Uri.encodeComponent(r.assignmentId)}',
                              ),
                            ),
                            icon: const Icon(Icons.open_in_new, size: 18),
                            label: Text(
                              r.latestRoundStatus == 'DRAFT'
                                  ? context.t('Continue review')
                                  : context.t('Start review'),
                            ),
                          ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
