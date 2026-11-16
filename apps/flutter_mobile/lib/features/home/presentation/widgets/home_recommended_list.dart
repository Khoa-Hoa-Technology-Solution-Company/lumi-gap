import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/paper_row.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';

/// "Suggested papers": one grouped card, the reason or topic above each
/// title. Missing authors, venue or year are left out, never "Unknown".
class HomeRecommendedList extends StatelessWidget {
  const HomeRecommendedList({
    required this.items,
    required this.onOpen,
    super.key,
    this.onBookmark,
  });

  final List<HomeRecommendedPaper> items;
  final void Function(HomeRecommendedPaper paper) onOpen;
  final void Function(HomeRecommendedPaper paper)? onBookmark;

  @override
  Widget build(BuildContext context) {
    return LumiRowGroup(
      children: [
        for (final paper in items)
          PaperRow(
            id: paper.id,
            overline: context.t(paper.chipText),
            title: paper.title,
            meta: [
              if (paper.authors.isNotEmpty) formatAuthors(paper.authors),
              if (paper.venue != null) paper.venue!,
              if (paper.year != null) '${paper.year}',
            ].join(' · '),
            onTap: () => onOpen(paper),
            onBookmarkTap:
                onBookmark == null ? null : () => onBookmark!(paper),
          ),
      ],
    );
  }
}
