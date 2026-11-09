import 'package:flutter/material.dart';
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
        stage.label,
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

    return SizedBox(
      // Tall enough for the text-scale 1.3 case without clipping.
      height: 232 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.4),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final p = items[index];
          return SizedBox(
            width: 280,
            child: Material(
              color: lumi.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: BorderSide(color: lumi.line),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onOpen(p.href),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium,
                      ),
                      if (p.researchField != null)
                        Text(
                          p.researchField!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: lumi.muted,
                          ),
                        ),
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: HomeStageChip(stage: p.stage),
                      ),
                      const Spacer(),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          stat(p.paperCount, 'bài báo'),
                          stat(p.screenedCount, 'đã sàng lọc'),
                          stat(p.candidateGapCount, 'khoảng trống ứng viên'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
