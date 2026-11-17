import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';

/// "Continue your research": one row per project with its stage and what it
/// holds, in one grouped card. The row opens the project.
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
    String summary(HomeResearchWorkspace w) => [
          context.t(w.stage.label),
          context.plural(
            w.paperCount,
            one: '{{count}} paper',
            other: '{{count}} papers',
          ),
          context.plural(
            w.candidateGapCount,
            one: '{{count}} gap',
            other: '{{count}} gaps',
          ),
        ].join(' · ');

    return LumiRowGroup(
      children: [
        for (final w in items)
          LumiListRow(
            icon: Icons.folder_outlined,
            iconInTile: true,
            title: w.title,
            subtitle: summary(w),
            onTap: () => onOpen(w.href),
          ),
      ],
    );
  }
}
