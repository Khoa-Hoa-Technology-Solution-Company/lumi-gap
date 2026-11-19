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
      title: context.t('Analytical Insights & Critique'),
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

/// Stars and a note from the signed-in reader. The form starts from the
/// reader's saved review and sends one request at a time.
class PaperReviewForm extends ConsumerStatefulWidget {
  const PaperReviewForm({
    required this.paperId,
    required this.view,
    super.key,
  });

  final String paperId;
  final QualityView view;

  @override
  ConsumerState<PaperReviewForm> createState() => _PaperReviewFormState();
}

class _PaperReviewFormState extends ConsumerState<PaperReviewForm> {
  final _comment = TextEditingController();
  int _rating = 0;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    // Start from the saved review, once; later reloads never overwrite what
    // the reader is typing.
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
    try {
      await ref
          .read(qualityApiProvider)
          .rate('paper', widget.paperId, _rating, note.isEmpty ? null : note);
      ref.invalidate(qualityViewProvider(QualityTarget('paper', widget.paperId)));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Review submitted successfully.'))),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t(failureMessageKey(e))),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final view = widget.view;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                context.t('Workspace Reviews'),
                style: theme.textTheme.titleSmall,
              ),
            ),
            Text(
              view.ratingCount == 0
                  ? context.t('No ratings yet')
                  : context.t('{{ratingCount}} ratings · {{average}} avg', {
                      'ratingCount': view.ratingCount,
                      'average': view.ratingAvg.toStringAsFixed(1),
                    }),
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: lumi.foregroundSecondary),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
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
                  color: lumi.warning,
                ),
              ),
          ],
        ),
        TextField(
          controller: _comment,
          enabled: !_submitting,
          maxLines: 2,
          maxLength: 1000,
          decoration: InputDecoration(
            hintText: context.t('Add review notes...'),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _rating == 0 || _submitting ? null : _submit,
            child: Text(context.t('Submit Review')),
          ),
        ),
      ],
    );
  }
}
