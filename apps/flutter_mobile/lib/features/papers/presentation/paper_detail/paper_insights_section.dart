import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_detail_sections.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_panel.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_reading_context_card.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Data quality, the AI critique and the reader's own review.
class PaperInsightsSection extends ConsumerWidget {
  const PaperInsightsSection({
    required this.paper,
    required this.paperId,
    this.topic,
    this.query,
    super.key,
  });

  final Paper paper;
  final String paperId;
  final String? topic;
  final String? query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final target = QualityTarget('paper', paperId);
    final quality = ref.watch(qualityViewProvider(target));
    final lumi = context.lumi;
    final theme = Theme.of(context);

    final Widget body;
    if (quality.hasValue) {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          QualityReadingContextCard(
            paperId: paperId,
            topic: topic,
            query: query,
          ),
          QualityPanel(
            targetKind: 'paper',
            targetId: paperId,
            showRatings: false,
          ),
          const Divider(height: 32),
          PaperReviewForm(paperId: paperId, view: quality.requireValue),
        ],
      );
    } else if (quality.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(quality.error!)),
        retrying: quality.isLoading,
        onRetry: () => ref.invalidate(qualityViewProvider(target)),
        inline: true,
      );
    } else {
      body = const LumiSkeleton(height: 88);
    }

    return PaperSection(
      icon: Icons.analytics_outlined,
      title: context.t('Analytical insights & critique'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Imported papers keep the column's default 0, which means "not
          // measured", not "0%".
          if (paper.dataQualityScore > 0) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: lumi.primarySoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                context.t('Usable as report evidence: {{percent}}%', {
                  'percent': (paper.dataQualityScore * 100).round(),
                }),
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: lumi.foreground),
              ),
            ),
            const SizedBox(height: 16),
          ],
          body,
        ],
      ),
    );
  }
}

/// The project reviews of the paper: their count and average, the reader's
/// own stars, and one button that opens the rating form in a sheet. The
/// form is not laid out inline on the page.
class PaperReviewForm extends StatelessWidget {
  const PaperReviewForm({
    required this.paperId,
    required this.view,
    super.key,
  });

  final String paperId;
  final QualityView view;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final mine = view.myStars ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.t('Project reviews'), style: theme.textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(
          view.ratingCount == 0
              ? context.t('No ratings yet')
              : context.t('{{ratingCount}} ratings · {{average}} avg', {
                  'ratingCount': view.ratingCount,
                  'average': view.ratingAvg.toStringAsFixed(1),
                }),
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: lumi.foregroundSecondary),
        ),
        if (mine > 0) ...[
          const SizedBox(height: 4),
          Semantics(
            label: context.plural(
              mine,
              one: 'Your rating: {{count}} star',
              other: 'Your rating: {{count}} stars',
            ),
            excludeSemantics: true,
            child: Row(
              children: [
                for (var star = 1; star <= 5; star++)
                  Icon(
                    star <= mine ? Icons.star : Icons.star_border,
                    size: 20,
                    color: lumi.warning,
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 8),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
          onPressed: () => unawaited(
            showModalBottomSheet<void>(
              // Over the bottom navigation bar, dimming it too.
              useRootNavigator: true,
              context: context,
              showDragHandle: true,
              useSafeArea: true,
              isScrollControlled: true,
              builder: (_) => _PaperReviewSheet(paperId: paperId, view: view),
            ),
          ),
          icon: const Icon(Icons.star_outline, size: 18),
          label: Text(
            mine > 0 ? context.t('Edit your review') : context.t('Rate this paper'),
          ),
        ),
      ],
    );
  }
}

/// Stars and a note from the signed-in reader, in a sheet. It starts from
/// the reader's saved review and sends one request at a time; it closes once
/// the review is saved.
class _PaperReviewSheet extends ConsumerStatefulWidget {
  const _PaperReviewSheet({required this.paperId, required this.view});

  final String paperId;
  final QualityView view;

  @override
  ConsumerState<_PaperReviewSheet> createState() => _PaperReviewSheetState();
}

class _PaperReviewSheetState extends ConsumerState<_PaperReviewSheet> {
  final _comment = TextEditingController();
  int _rating = 0;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _rating = widget.view.myStars ?? 0;
    _comment.text = widget.view.myComment ?? '';
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting || _rating < 1) return;
    setState(() => _submitting = true);
    final note = _comment.text.trim();
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final locale = context.appLocale;
    final errorColor = context.lumi.error;
    try {
      await ref
          .read(qualityApiProvider)
          .rate('paper', widget.paperId, _rating, note.isEmpty ? null : note);
      ref.invalidate(qualityViewProvider(QualityTarget('paper', widget.paperId)));
      messenger.showSnackBar(
        SnackBar(content: Text(translate('Review submitted successfully.', locale))),
      );
      navigator.pop();
    } on Object catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(translate(failureMessageKey(e), locale)),
          backgroundColor: errorColor,
        ),
      );
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(context.t('Rate this paper'), style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var star = 1; star <= 5; star++)
                  IconButton(
                    tooltip: context.plural(
                      star,
                      one: '{{count}} star',
                      other: '{{count}} stars',
                    ),
                    isSelected: star <= _rating,
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _rating = star),
                    icon: Icon(
                      star <= _rating ? Icons.star : Icons.star_border,
                      size: 32,
                      color: lumi.warning,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _comment,
              enabled: !_submitting,
              minLines: 2,
              maxLines: 5,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: context.t('Review notes (optional)'),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: _rating == 0 || _submitting ? null : () => unawaited(_submit()),
              child: Text(context.t('Submit review')),
            ),
            const SizedBox(height: 8),
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: _submitting ? null : () => Navigator.of(context).pop(),
              child: Text(context.t('Cancel')),
            ),
          ],
        ),
      ),
    );
  }
}
