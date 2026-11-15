import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';

class HomeStageChip extends StatelessWidget {
  const HomeStageChip({required this.stage, super.key});

  final HomeWorkflowStage stage;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: lumi.primarySoft,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        context.t(stage.label),
        style: Theme.of(
          context,
        ).textTheme.labelMedium?.copyWith(color: lumi.primary),
      ),
    );
  }
}

/// "Tiếp tục nghiên cứu": horizontally scrolling project cards.
class HomeContinueResearch extends StatelessWidget {
  const HomeContinueResearch({
    required this.items,
    required this.onOpen,
    super.key,
  });

  final List<HomeResearchWorkspace> items;
  final void Function(String href) onOpen;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);

    Widget stat(int value, String label) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$value', style: theme.textTheme.titleMedium),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(color: lumi.muted),
          ),
        ],
      ),
    );

    // A row sized by its content (no fixed height): the cards are as tall as
    // the tallest one, so a short title leaves no empty band, and a large
    // text scale never clips.
    // One project fills the width; several scroll sideways, each 280dp so
    // the next card peeks in and says there is more.
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var index = 0; index < items.length; index++) ...[
                if (index > 0) const SizedBox(width: 12),
                SizedBox(
                  width: items.length == 1 ? constraints.maxWidth : 280,
                  child: Material(
                    color: lumi.surface,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: BorderSide(color: lumi.line),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => onOpen(items[index].href),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              items[index].title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleMedium,
                            ),
                            if (items[index].researchField != null)
                              Text(
                                items[index].researchField!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: lumi.muted,
                                ),
                              ),
                            const SizedBox(height: 8),
                            HomeStageChip(stage: items[index].stage),
                            const SizedBox(height: 12),
                            const Spacer(),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                stat(
                                  items[index].paperCount,
                                  context.t('papers'),
                                ),
                                stat(
                                  items[index].screenedCount,
                                  context.t('screened'),
                                ),
                                stat(
                                  items[index].candidateGapCount,
                                  context.t('candidate gaps'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
