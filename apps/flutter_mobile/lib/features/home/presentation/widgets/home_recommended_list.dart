import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/paper_card.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';

/// "Suggested papers": the shared paper card with the reason or topic as its
/// chip. Missing authors, venue or year are left out, never "Unknown".
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
    return Column(
      children: [
        for (final paper in items)
          PaperCard(
            id: paper.id,
            chip: context.t(paper.chipText),
            title: paper.title,
            authors: paper.authors.isEmpty ? null : formatAuthors(paper.authors),
            venueAndYear: [
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
