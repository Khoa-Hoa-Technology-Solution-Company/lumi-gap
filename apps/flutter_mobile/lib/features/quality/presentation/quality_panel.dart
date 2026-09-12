import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class QualityPanel extends ConsumerStatefulWidget {
  const QualityPanel({required this.targetKind, required this.targetId, super.key});

  final String targetKind;
  final String targetId;

  @override
  ConsumerState<QualityPanel> createState() => _QualityPanelState();
}

class _QualityPanelState extends ConsumerState<QualityPanel> {
  int stars = 0;
  final comment = TextEditingController();

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final target = QualityTarget(widget.targetKind, widget.targetId);
    final query = ref.watch(qualityViewProvider(target));
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: query.when(
          data: (view) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_awesome),
                  const SizedBox(width: 8),
                  const Expanded(child: Text('AI quality review', style: TextStyle(fontWeight: FontWeight.bold))),
                  TextButton(
                    onPressed: () async {
                      await ref.read(qualityApiProvider).evaluate(widget.targetKind, widget.targetId);
                      ref.invalidate(qualityViewProvider(target));
                    },
                    child: Text(view.evaluation == null ? 'Evaluate' : 'Refresh'),
                  ),
                ],
              ),
              if (view.evaluation == null)
                Text('Run AI evaluation to score relevance, groundedness, and completeness.', style: TextStyle(color: theme.colorScheme.onSurfaceVariant))
              else ...[
                Wrap(
                  spacing: 8,
                  children: [
                    Chip(label: Text('Overall ${view.evaluation!.overall.toStringAsFixed(1)}')),
                    Chip(label: Text('Relevant ${view.evaluation!.relevance.toStringAsFixed(1)}')),
                    Chip(label: Text('Grounded ${view.evaluation!.groundedness.toStringAsFixed(1)}')),
                  ],
                ),
                Text(view.evaluation!.rationale),
              ],
              const Divider(height: 28),
              Text('Community rating - ${view.ratingCount} ratings, average ${view.ratingAvg.toStringAsFixed(1)}'),
              Row(
                children: List.generate(
                  5,
                  (index) => IconButton(
                    onPressed: () => setState(() => stars = index + 1),
                    icon: Icon(index < stars ? Icons.star : Icons.star_border, color: Colors.amber),
                  ),
                ),
              ),
              TextField(
                controller: comment,
                decoration: const InputDecoration(labelText: 'Write a short review', border: OutlineInputBorder()),
                minLines: 2,
                maxLines: 3,
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  onPressed: stars == 0
                      ? null
                      : () async {
                          await ref.read(qualityApiProvider).rate(widget.targetKind, widget.targetId, stars, comment.text.trim().isEmpty ? null : comment.text.trim());
                          ref.invalidate(qualityViewProvider(target));
                        },
                  child: const Text('Submit review'),
                ),
              ),
              ...view.ratings.map((rating) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(rating.userName),
                    subtitle: Text(rating.comment ?? ''),
                    trailing: Text('${rating.stars}/5'),
                  )),
            ],
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Text(error.toString()),
        ),
      ),
    );
  }
}
