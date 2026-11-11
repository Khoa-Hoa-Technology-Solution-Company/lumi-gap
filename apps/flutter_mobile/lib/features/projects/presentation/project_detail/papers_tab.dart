import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ProjectPapersTab extends StatelessWidget {
  const ProjectPapersTab({
    required this.project,
    required this.projectId,
    required this.ref,
    super.key,
  });

  final ProjectView project;
  final String projectId;
  final WidgetRef ref;

  Future<void> _remove(BuildContext context, String paperId) async {
    try {
      await ref.read(projectsApiProvider).removePaper(projectId, paperId);
      ref.invalidate(projectProvider(projectId));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('Paper removed from project.'))),
      );
    } on Object catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.t('Failed to remove paper: {{e}}', {'e': e})),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (project.papers.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.article_outlined,
                size: 48,
                color: Color(0xFF94A3B8),
              ),
              const SizedBox(height: 12),
              Text(
                context.t('No papers inside this project workspace yet.'),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                context.t('Search for publications outside and tap "Add" button to associate them here.'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => context.push('/search'),
                icon: const Icon(Icons.search, size: 16),
                label: Text(context.t('Search publications')),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: project.papers.length,
      itemBuilder: (context, idx) {
        final paper = project.papers[idx];
        return Card(
          elevation: 0,
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Theme.of(context).dividerColor),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => context.push('/paper/${paper.id}'),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    paper.title,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          context.t('Year: {{year}} · Citations: {{citations}}', {'year': paper.publicationYear ?? context.t('N/A'), 'citations': paper.citationCount ?? 0}),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(
                          Icons.delete_outline,
                          color: Colors.red,
                          size: 18,
                        ),
                        onPressed: () => _remove(context, paper.id),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
