import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_section_frame.dart';

class HomeCommunityList extends StatelessWidget {
  const HomeCommunityList({
    required this.items,
    required this.onOpen,
    super.key,
  });

  final List<HomeCommunityTopic> items;
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(items[i].title, style: theme.textTheme.titleMedium),
                      if (items[i].community != null)
                        Text(
                          items[i].community!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: lumi.foregroundSecondary,
                          ),
                        ),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 12,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.chat_bubble_outline,
                                size: 14,
                                color: lumi.muted,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                context.plural(items[i].replyCount, one: '{{count}} reply', other: '{{count}} replies'),
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: lumi.muted,
                                ),
                              ),
                            ],
                          ),
                          if (items[i].occurredAt != null)
                            Text(
                              relativeTime(items[i].occurredAt!, context.appLocale),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: lumi.muted,
                              ),
                            ),
                        ],
                      ),
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
