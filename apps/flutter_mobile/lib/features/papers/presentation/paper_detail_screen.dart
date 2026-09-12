import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

class PaperDetailScreen extends ConsumerStatefulWidget {
  const PaperDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<PaperDetailScreen> createState() => _PaperDetailScreenState();
}

class _PaperDetailScreenState extends ConsumerState<PaperDetailScreen> {
  int rating = 0;
  final commentController = TextEditingController();

  @override
  void dispose() {
    commentController.dispose();
    super.dispose();
  }

  Future<void> _toggleBookmark(bool isBookmarked, String? bookmarkId) async {
    final api = ref.read(bookmarksApiProvider);
    if (isBookmarked && bookmarkId != null) {
      await api.delete(bookmarkId);
    } else {
      await api.create(targetKind: 'paper', targetId: widget.id);
    }
    ref.invalidate(bookmarkStatusProvider(BookmarkTarget('paper', widget.id)));
  }

  Future<void> _submitRating() async {
    if (rating < 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select 1-5 stars before submitting.'),
        ),
      );
      return;
    }
    final api = ref.read(qualityApiProvider);
    final target = QualityTarget('paper', widget.id);
    try {
      await api.rate(
        'paper',
        widget.id,
        rating,
        commentController.text.trim().isEmpty
            ? null
            : commentController.text.trim(),
      );
      ref.invalidate(qualityViewProvider(target));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Review submitted successfully.')),
        );
      }
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to submit review: $e')),
        );
      }
    }
  }

  Future<void> _runAiEvaluation() async {
    final api = ref.read(qualityApiProvider);
    final target = QualityTarget('paper', widget.id);
    try {
      await api.evaluate('paper', widget.id);
      ref.invalidate(qualityViewProvider(target));
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AI evaluation failed: $e')),
        );
      }
    }
  }

  // Kept for the review delete action when mobile ratings are reconnected.
  // ignore: unused_element
  Future<void> _deleteReview(String ratingId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete review'),
        content: const Text('Remove your review for this paper?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(qualityApiProvider).deleteRate(ratingId);
      ref.invalidate(qualityViewProvider(QualityTarget('paper', widget.id)));
      setState(() {
        rating = 0;
        commentController.clear();
      });
    }
  }

  void _openProjectPicker(BuildContext context) {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (context) {
          return Consumer(
            builder: (context, ref, child) {
              final projectsAsync = ref.watch(projectsProvider);
              final theme = Theme.of(context);
              return SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Add to project',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(context),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      projectsAsync.when(
                        data: (projects) {
                          if (projects.isEmpty) {
                            return Center(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 24,
                                ),
                                child: OutlinedButton(
                                  onPressed: () {
                                    Navigator.pop(context);
                                    unawaited(context.push('/projects'));
                                  },
                                  child: const Text(
                                    'Create your first project',
                                  ),
                                ),
                              ),
                            );
                          }
                          return Flexible(
                            child: ListView.builder(
                              shrinkWrap: true,
                              itemCount: projects.length,
                              itemBuilder: (context, index) {
                                final project = projects[index];
                                return ListTile(
                                  leading: Container(
                                    width: 36,
                                    height: 36,
                                    decoration: BoxDecoration(
                                      color: Colors.cyan.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(
                                      Icons.folder,
                                      color: Color(0xFF06B6D4),
                                      size: 17,
                                    ),
                                  ),
                                  title: Text(
                                    project.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  subtitle: Text(
                                    '${project.papers.length} papers',
                                  ),
                                  trailing: const Icon(
                                    Icons.add,
                                    color: Color(0xFF06B6D4),
                                  ),
                                  onTap: () async {
                                    Navigator.pop(context);
                                    try {
                                      await ref
                                          .read(projectsApiProvider)
                                          .addPaper(project.id, widget.id);
                                      ref.invalidate(projectsProvider);
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'Added paper to project',
                                            ),
                                          ),
                                        );
                                      }
                                    } on Exception catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          SnackBar(
                                            content: Text('Failed to add: $e'),
                                          ),
                                        );
                                      }
                                    }
                                  },
                                );
                              },
                            ),
                          );
                        },
                        loading: () =>
                            const Center(child: CircularProgressIndicator()),
                        error: (e, _) => Text('Error loading projects: $e'),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final paperQuery = ref.watch(paperProvider(widget.id));
    final statusQuery = ref.watch(
      bookmarkStatusProvider(BookmarkTarget('paper', widget.id)),
    );
    final qualityTarget = QualityTarget('paper', widget.id);
    final qualityQuery = ref.watch(qualityViewProvider(qualityTarget));
    final currentUser = ref.watch(currentUserProvider);

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    ref.listen<AsyncValue<QualityView>>(
      qualityViewProvider(qualityTarget),
      (previous, next) {
        final view = next.value;
        if (view != null) {
          if (view.myStars != null && rating == 0) {
            setState(() {
              rating = view.myStars!;
              if (view.myComment != null && commentController.text.isEmpty) {
                commentController.text = view.myComment!;
              }
            });
          }
        }
      },
    );

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 28),
          onPressed: () => context.pop(),
        ),
        title: const Text(
          'Paper Detail',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined, size: 20),
            onPressed: () async {
              final link =
                  paperQuery.value?.paperLink ??
                  paperQuery.value?.externalIds.openalexId ??
                  'https://openalex.org/${widget.id}';
              await Clipboard.setData(ClipboardData(text: link));
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Paper link copied to clipboard')),
              );
            },
          ),
        ],
      ),
      body: paperQuery.when(
        data: (paper) {
          final isBookmarked = statusQuery.value?.bookmarked ?? false;
          final bookmarkId = statusQuery.value?.bookmarkId;

          return Stack(
            children: [
              ListView(
                padding: EdgeInsets.fromLTRB(
                  16,
                  16,
                  16,
                  paper.openAccessUrl != null ? 112 : 24,
                ),
                children: [
                  // SECTION 1: Header Card
                  _buildHeaderCard(context, paper, theme, isDark),
                  const SizedBox(height: 16),

                  // SECTION 2: Actions Panel
                  _buildActionsPanel(
                    context,
                    paper,
                    theme,
                    isDark,
                    isBookmarked,
                    bookmarkId,
                  ),
                  const SizedBox(height: 16),

                  // SECTION 3: Abstract Block
                  _buildAbstractBlock(context, paper, theme),
                  const SizedBox(height: 16),

                  // SECTION 4: Figures & Media Grid
                  _buildFiguresMediaGrid(context, paper, theme, isDark),
                  const SizedBox(height: 16),

                  // SECTION 5: Taxonomy Badges
                  _buildTaxonomyBadges(context, paper, theme, isDark),
                  const SizedBox(height: 16),

                  // SECTION 6: Analytical Insights
                  _buildAnalyticalInsights(
                    context,
                    paper,
                    theme,
                    isDark,
                    qualityQuery,
                    currentUser,
                  ),
                  const SizedBox(height: 16),

                  // SECTION 7: Interactive Chat Widget
                  _buildInteractiveChatWidget(context, paper, theme, isDark),
                ],
              ),
              if (paper.openAccessUrl != null)
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: theme.scaffoldBackgroundColor,
                      border: Border(
                        top: BorderSide(color: theme.dividerColor),
                      ),
                    ),
                    child: ElevatedButton.icon(
                      onPressed: () =>
                          launchUrl(Uri.parse(paper.openAccessUrl!)),
                      icon: const Icon(
                        Icons.open_in_new,
                        size: 16,
                        color: Color(0xFF0F1B2D),
                      ),
                      label: const Text(
                        'Open full text',
                        style: TextStyle(
                          color: Color(0xFF0F1B2D),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF06B6D4),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
        loading: () =>
            const AppLoading(fullScreen: true, message: 'Loading paper...'),
        error: (error, _) => AppErrorState(message: error.toString()),
      ),
    );
  }

  Widget _buildHeaderCard(
    BuildContext context,
    Paper paper,
    ThemeData theme,
    bool isDark,
  ) {
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: theme.cardColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.dividerColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              paper.title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                height: 1.3,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '${paper.journalName != null ? "${paper.journalName} · " : ""}${paper.publicationYear}',
              style: const TextStyle(
                color: Color(0xFF06B6D4),
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E1B4B),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '${paper.citationCount} Citations',
                    style: const TextStyle(
                      color: Color(0xFFA5B4FC),
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (paper.isAiAnalyzable)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF064E3B),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.auto_awesome,
                          color: Color(0xFF34D399),
                          size: 10,
                        ),
                        SizedBox(width: 4),
                        Text(
                          'AI Analyzable',
                          style: TextStyle(
                            color: Color(0xFF34D399),
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                if (paper.openAccessUrl != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF451A03),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.lock_open,
                          color: Color(0xFFFBBF24),
                          size: 10,
                        ),
                        SizedBox(width: 4),
                        Text(
                          'Open Access',
                          style: TextStyle(
                            color: Color(0xFFFBBF24),
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'AUTHORS',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: Color(0xFF94A3B8),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                ...paper.authors.take(3).map((author) {
                  return Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF1E293B)
                          : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: theme.dividerColor),
                    ),
                    child: Text(
                      author.displayName,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  );
                }),
                if (paper.authors.length > 3)
                  TextButton(
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: () {
                      unawaited(
                        showModalBottomSheet<void>(
                          context: context,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(
                              top: Radius.circular(24),
                            ),
                          ),
                          builder: (context) => Container(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'All Authors',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Expanded(
                                  child: ListView.builder(
                                    itemCount: paper.authors.length,
                                    itemBuilder: (context, idx) => ListTile(
                                      leading: const CircleAvatar(
                                        child: Icon(Icons.person),
                                      ),
                                      title: Text(
                                        paper.authors[idx].displayName,
                                      ),
                                      subtitle: Text(
                                        'Author Position: ${paper.authors[idx].position}',
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                    child: Text(
                      'View all (${paper.authors.length})',
                      style: const TextStyle(
                        color: Color(0xFF06B6D4),
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionsPanel(
    BuildContext context,
    Paper paper,
    ThemeData theme,
    bool isDark,
    bool isBookmarked,
    String? bookmarkId,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _ActionButton(
            icon: Icons.bookmark,
            label: isBookmarked ? 'Saved' : 'Save',
            active: isBookmarked,
            onTap: () => _toggleBookmark(isBookmarked, bookmarkId),
            isDark: isDark,
          ),
          _ActionButton(
            icon: Icons.add_box,
            label: 'Add to Project',
            onTap: () => _openProjectPicker(context),
            isDark: isDark,
          ),
          _ActionButton(
            icon: Icons.format_quote,
            label: 'Cite Paper',
            onTap: () {
              unawaited(
                showDialog<void>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Cite Publication'),
                    content: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'APA Style:',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 4),
                        SelectableText(
                          '${paper.authors.isNotEmpty ? paper.authors.first.displayName : "Unknown"} et al. (${paper.publicationYear}). ${paper.title}. ${paper.journalName ?? ""}.',
                          style: const TextStyle(fontSize: 12),
                        ),
                        const Divider(height: 24),
                        const Text(
                          'MLA Style:',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 4),
                        SelectableText(
                          '${paper.authors.isNotEmpty ? paper.authors.first.displayName : "Unknown"}, et al. "${paper.title}." ${paper.journalName ?? "N/A"}, ${paper.publicationYear}.',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Close'),
                      ),
                    ],
                  ),
                ),
              );
            },
            isDark: isDark,
          ),
          _ActionButton(
            icon: Icons.picture_as_pdf,
            label: 'PDF Link',
            disabled: paper.openAccessUrl == null,
            onTap: paper.openAccessUrl == null
                ? null
                : () => launchUrl(Uri.parse(paper.openAccessUrl!)),
            isDark: isDark,
          ),
        ],
      ),
    );
  }

  Widget _buildAbstractBlock(
    BuildContext context,
    Paper paper,
    ThemeData theme,
  ) {
    return ExpansionTile(
      initiallyExpanded: true,
      leading: const Icon(Icons.subject, color: Color(0xFF06B6D4)),
      title: const Text(
        'Abstract & Description',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            paper.abstractText ??
                'No abstract description available for this publication.',
            style: TextStyle(
              color: theme.colorScheme.onSurfaceVariant,
              fontSize: 13,
              height: 1.5,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFiguresMediaGrid(
    BuildContext context,
    Paper paper,
    ThemeData theme,
    bool isDark,
  ) {
    return ExpansionTile(
      leading: const Icon(Icons.image_outlined, color: Color(0xFF22C55E)),
      title: const Text(
        'Figures & Scientific Media',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            childAspectRatio: 1.4,
            children: [
              _buildMockMediaItem(
                context,
                'Methodology Flowchart',
                Icons.account_tree_outlined,
                const Color(0xFF06B6D4),
              ),
              _buildMockMediaItem(
                context,
                'Statistical Performance',
                Icons.bar_chart_outlined,
                const Color(0xFF22C55E),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildMockMediaItem(
    BuildContext context,
    String title,
    IconData icon,
    Color color,
  ) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTaxonomyBadges(
    BuildContext context,
    Paper paper,
    ThemeData theme,
    bool isDark,
  ) {
    final primaryTopic = paper.topics.firstWhere(
      (t) => t.isPrimary == true,
      orElse: () => paper.topics.isNotEmpty
          ? paper.topics.first
          : const PaperTopic(topicName: 'Unknown'),
    );
    final hasTaxonomy = paper.topics.isNotEmpty;

    return ExpansionTile(
      initiallyExpanded: true,
      leading: const Icon(Icons.category_outlined, color: Color(0xFFA78BFA)),
      title: const Text(
        'OpenAlex Taxonomy Scope',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!hasTaxonomy)
                const Text(
                  'No taxonomy scope metadata found.',
                  style: TextStyle(fontStyle: FontStyle.italic, fontSize: 12),
                )
              else ...[
                _buildTaxonomyRow(
                  'Domain',
                  primaryTopic.domainName ?? 'N/A',
                  const Color(0xFF3B82F6),
                ),
                const SizedBox(height: 8),
                _buildTaxonomyRow(
                  'Field',
                  primaryTopic.fieldName ?? 'N/A',
                  const Color(0xFF10B981),
                ),
                const SizedBox(height: 8),
                _buildTaxonomyRow(
                  'Subfield',
                  primaryTopic.subfieldName ?? 'N/A',
                  const Color(0xFFF59E0B),
                ),
                const SizedBox(height: 8),
                _buildTaxonomyRow(
                  'Topic',
                  primaryTopic.topicName,
                  const Color(0xFF8B5CF6),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTaxonomyRow(String label, String value, Color color) {
    return Row(
      children: [
        Container(
          width: 70,
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            label.toUpperCase(),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }

  Widget _buildAnalyticalInsights(
    BuildContext context,
    Paper paper,
    ThemeData theme,
    bool isDark,
    AsyncValue<QualityView> qualityQuery,
    dynamic currentUser,
  ) {
    return ExpansionTile(
      initiallyExpanded: true,
      leading: const Icon(Icons.analytics_outlined, color: Color(0xFFF59E0B)),
      title: const Text(
        'Analytical Insights & Critique',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // RAG Quality Score Card
              Container(
                decoration: BoxDecoration(
                  color: isDark
                      ? const Color(0xFF0F172A)
                      : const Color(0xFFF1F5F9),
                  border: Border.all(color: const Color(0xFF06B6D4)),
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      color: Color(0xFF06B6D4),
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'RAG Grounding Suitability: ${(paper.dataQualityScore * 100).round()}%',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // AI Critique (overall, relevance, groundedness)
              qualityQuery.when(
                data: (view) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _QualityBadge(
                            label: 'Overall',
                            score: view.evaluation?.overall ?? 0.0,
                          ),
                          const SizedBox(width: 6),
                          _QualityBadge(
                            label: 'Relevance',
                            score: view.evaluation?.relevance ?? 0.0,
                          ),
                          const SizedBox(width: 6),
                          _QualityBadge(
                            label: 'Groundedness',
                            score: view.evaluation?.groundedness ?? 0.0,
                          ),
                        ],
                      ),
                      if (view.evaluation != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          view.evaluation!.rationale,
                          style: const TextStyle(fontSize: 12, height: 1.4),
                        ),
                      ] else ...[
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _runAiEvaluation,
                            icon: const Icon(Icons.refresh, size: 14),
                            label: const Text(
                              'Generate AI Quality Critique',
                              style: TextStyle(fontSize: 12),
                            ),
                          ),
                        ),
                      ],

                      const Divider(height: 32),

                      // User Reviews & Feedback
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Workspace Reviews',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                          ),
                          Text(
                            '${view.ratingCount} ratings · ${view.ratingAvg.toStringAsFixed(1)} avg',
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: List.generate(5, (index) {
                          final starVal = index + 1;
                          return GestureDetector(
                            onTap: () => setState(() => rating = starVal),
                            child: Icon(
                              starVal <= rating
                                  ? Icons.star
                                  : Icons.star_border,
                              color: const Color(0xFFF59E0B),
                              size: 26,
                            ),
                          );
                        }),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: commentController,
                        maxLines: 2,
                        decoration: InputDecoration(
                          hintText: 'Add review notes...',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          contentPadding: const EdgeInsets.all(10),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: rating == 0 ? null : _submitRating,
                          child: const Text(
                            'Submit Review',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text(
                  'Error loading quality: $e',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInteractiveChatWidget(
    BuildContext context,
    Paper paper,
    ThemeData theme,
    bool isDark,
  ) {
    return ExpansionTile(
      initiallyExpanded: true,
      leading: const Icon(Icons.chat_bubble_outline, color: Color(0xFF8B5CF6)),
      title: const Text(
        'Workspace Interactive Chat',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: theme.dividerColor),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.info_outline,
                  color: Color(0xFF8B5CF6),
                  size: 24,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Ground Grounding Assistant',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(
                  'Add this paper to a project workspace workspace to start asking questions, writing papers, and detecting research gaps.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF8B5CF6),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onPressed: () => _openProjectPicker(context),
                  icon: const Icon(Icons.add, color: Colors.white, size: 16),
                  label: const Text(
                    'Add to Project Workspace',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.isDark,
    this.active = false,
    this.disabled = false,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final bool disabled;
  final VoidCallback? onTap;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final color = disabled
        ? const Color(0xFF475569)
        : active
        ? const Color(0xFF06B6D4)
        : isDark
        ? const Color(0xFF94A3B8)
        : const Color(0xFF64748B);

    return GestureDetector(
      onTap: disabled ? null : onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _QualityBadge extends StatelessWidget {
  const _QualityBadge({required this.label, required this.score});

  final String label;
  final double score;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: const Color(0xFF06B6D4).withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF0891B2),
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              score.toStringAsFixed(1),
              style: TextStyle(
                color: Theme.of(context).textTheme.bodyMedium?.color,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Kept for the references tab flow while the redesigned detail layout is active.
// ignore: unused_element
class _ReferencesTabContent extends ConsumerWidget {
  const _ReferencesTabContent({required this.id, required this.theme});

  final String id;
  final ThemeData theme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(paperReferencesProvider(id));
    return query.when(
      data: (data) {
        if (data.references.isEmpty) {
          return const Text('No in-library references found yet.');
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Showing ${data.inCorpus} of ${data.totalReferenced} cited works found in this library.',
              style: TextStyle(
                color: theme.colorScheme.onSurfaceVariant,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 12),
            ...data.references.map((reference) {
              final authors = reference.authors
                  .map((a) => a.displayName)
                  .take(3)
                  .join(', ');
              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 12),
                color: theme.cardColor,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: theme.dividerColor),
                ),
                child: InkWell(
                  onTap: () =>
                      unawaited(context.push('/paper/${reference.id}')),
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          reference.title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            height: 1.3,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (authors.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            authors,
                            style: TextStyle(
                              color: theme.colorScheme.onSurfaceVariant,
                              fontSize: 12,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Text(
                              '${reference.publicationYear}',
                              style: const TextStyle(
                                color: Color(0xFF06B6D4),
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            if (reference.doi != null &&
                                reference.doi!.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'DOI: ${reference.doi}',
                                  style: TextStyle(
                                    color: theme.colorScheme.onSurfaceVariant,
                                    fontSize: 11,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        );
      },
      loading: () => const AppLoading(message: 'Loading references...'),
      error: (error, _) => AppErrorState(message: error.toString()),
    );
  }
}

class OpenAlexMetadataCard extends StatelessWidget {
  const OpenAlexMetadataCard({required this.paper, super.key});
  final Paper paper;

  Widget _buildMetaRow(String label, String value, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isDark
                    ? const Color(0xFF94A3B8)
                    : const Color(0xFF64748B),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 12,
                color: isDark
                    ? const Color(0xFFF8FAFC)
                    : const Color(0xFF1E293B),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final primaryTopic = paper.topics.firstWhere(
      (t) => t.isPrimary == true,
      orElse: () => paper.topics.isNotEmpty
          ? paper.topics.first
          : const PaperTopic(topicName: 'Unknown'),
    );
    final hasTaxonomy = paper.topics.isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.shield, color: Color(0xFF06B6D4), size: 16),
              SizedBox(width: 8),
              Text(
                'OpenAlex Metadata',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const Divider(height: 20),
          _buildMetaRow('Year', paper.publicationYear.toString(), isDark),
          _buildMetaRow('Type', paper.paperKind ?? 'Not available', isDark),
          _buildMetaRow('Source', paper.journalName ?? 'Not available', isDark),
          _buildMetaRow('Language', paper.language ?? 'Not available', isDark),
          _buildMetaRow('Cited by', paper.citationCount.toString(), isDark),
          if (paper.fwci != null)
            _buildMetaRow('FWCI', paper.fwci!.toStringAsFixed(2), isDark),
          if (paper.relatedWorksCount != null)
            _buildMetaRow(
              'Related works',
              paper.relatedWorksCount.toString(),
              isDark,
            ),
          if (paper.primaryProvider != null)
            _buildMetaRow('Provider', paper.primaryProvider!, isDark),
          if (paper.openAccessStatus != null)
            _buildMetaRow(
              'Open Access',
              paper.openAccessStatus!.toUpperCase(),
              isDark,
            ),
          if (paper.externalIds.doi != null)
            _buildMetaRow('DOI', paper.externalIds.doi!, isDark),
          if (paper.paperLink != null)
            _buildMetaRow('Link', paper.paperLink!, isDark),

          const Divider(height: 20),
          const Text(
            'TAXONOMY SCOPE',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 8),
          if (!hasTaxonomy)
            const Text(
              'OpenAlex taxonomy metadata is not backfilled yet for this publication.',
              style: TextStyle(
                fontSize: 12,
                fontStyle: FontStyle.italic,
                color: Color(0xFFEF4444),
              ),
            )
          else ...[
            _buildMetaRow('Topic', primaryTopic.topicName, isDark),
            if (primaryTopic.subfieldName != null)
              _buildMetaRow('Subfield', primaryTopic.subfieldName!, isDark),
            if (primaryTopic.fieldName != null)
              _buildMetaRow('Field', primaryTopic.fieldName!, isDark),
            if (primaryTopic.domainName != null)
              _buildMetaRow('Domain', primaryTopic.domainName!, isDark),
          ],
        ],
      ),
    );
  }
}
