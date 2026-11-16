import 'package:flutter/material.dart';

/// The filters in force, as a row of chips the reader can remove one by one.
class SearchActiveFilters extends StatelessWidget {
  const SearchActiveFilters({required this.chips, super.key});

  /// Label and what removing it does.
  final List<(String, VoidCallback)> chips;

  @override
  Widget build(BuildContext context) {
    if (chips.isEmpty) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Row(
        children: [
          for (final (label, onRemove) in chips)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: InputChip(label: Text(label), onDeleted: onRemove),
            ),
        ],
      ),
    );
  }
}
