import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';

class HomeRecommendedList extends StatelessWidget {
  const HomeRecommendedList({
    required this.items,
    required this.onOpen,
    super.key,
  });

  final List<HomeRecommendedPaper> items;
  final void Function(HomeRecommendedPaper paper) onOpen;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    return Column(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          Material(
            color: lumi.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: BorderSide(color: lumi.line),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => onOpen(items[i]),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: lumi.surfaceMuted,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        items[i].chipText,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: lumi.foregroundSecondary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      items[i].title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium,
                    ),
                    if (items[i].authors.isNotEmpty)
                      Text(
                        formatAuthors(items[i].authors),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: lumi.foregroundSecondary,
                        ),
                      ),
                    Text(
                      [
                        if (items[i].venue != null) items[i].venue!,
                        if (items[i].year != null) '${items[i].year}',
                      ].join(' · '),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: lumi.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
