import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_section_frame.dart';

IconData attentionIcon(HomeAttentionType type) => switch (type) {
  HomeAttentionType.screening => Icons.filter_list,
  HomeAttentionType.evidence => Icons.fact_check_outlined,
  HomeAttentionType.revision => Icons.edit_note,
  HomeAttentionType.review => Icons.rate_review_outlined,
  HomeAttentionType.invitation => Icons.person_add_alt,
  HomeAttentionType.mentorship => Icons.school_outlined,
  HomeAttentionType.contribution => Icons.volunteer_activism_outlined,
  HomeAttentionType.unknown => Icons.notifications_none,
};

/// "Việc cần làm": whole row is tappable (>= 48dp tall).
class HomeAttentionList extends StatelessWidget {
  const HomeAttentionList({
    required this.items,
    required this.onOpen,
    super.key,
  });

  final List<HomeAttentionItem> items;
  final void Function(String href) onOpen;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: homeCardDecoration(lumi),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) Divider(height: 1, color: lumi.line),
            InkWell(
              onTap: () => onOpen(items[i].href),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Icon(
                          attentionIcon(items[i].type),
                          size: 20,
                          color: lumi.foregroundSecondary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              items[i].title,
                              style: theme.textTheme.titleMedium,
                            ),
                            if (items[i].description != null)
                              Text(
                                items[i].description!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: lumi.foregroundSecondary,
                                ),
                              ),
                            if (items[i].occurredAt != null)
                              Text(
                                relativeTimeVi(items[i].occurredAt!),
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: lumi.muted,
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (items[i].count != null) ...[
                        const SizedBox(width: 8),
                        Semantics(
                          label: '${items[i].count} mục',
                          excludeSemantics: true,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: lumi.primarySoft,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '${items[i].count}',
                              style: theme.textTheme.labelMedium?.copyWith(
                                color: lumi.primary,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
