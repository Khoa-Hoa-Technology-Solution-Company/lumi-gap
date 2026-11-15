import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_panel.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_reading_context_card.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

class PaperDetailScreen extends ConsumerStatefulWidget {
  const PaperDetailScreen({
    required this.id,
    this.topic,
    this.query,
    super.key,
  });

  final String id;

  /// Trend topic / search query the reader arrived from (`?topic=` / `?q=`).
  final String? topic;
  final String? query;

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
        SnackBar(
          content: Text(
            context.t('Please select 1-5 stars before submitting.'),
          ),
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
          SnackBar(content: Text(context.t('Review submitted successfully.'))),
        );
      }
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.t('Failed to submit review: {{e}}', {'e': context.t(failureMessageKey(e))}),
            ),
          ),
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
        title: Text(context.t('Delete review')),
        content: Text(context.t('Remove your review for this paper?')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.t('Cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: context.lumi.error),
            child: Text(context.t('Delete')),
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
          borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
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
                            context.t('Add to project'),
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w600,
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
                                    context.go('/projects');
                                  },
                                  child: Text(
                                    context.t('Create your first project'),
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
                                      color: context.lumi.primarySoft,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Icon(
                                      Icons.folder,
                                      color: context.lumi.primary,
                                      size: 17,
                                    ),
                                  ),
                                  title: Text(
                                    project.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  subtitle: Text(
                                    context.plural(
                                      project.papers.length,
                                      one: '{{count}} paper',
                                      other: '{{count}} papers',
                                    ),
                                  ),
                                  trailing: Icon(
                                    Icons.add,
                                    color: context.lumi.primary,
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
                                          SnackBar(
                                            content: Text(
                                              context.t(
                                                'Added paper to project',
                                              ),
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
                                            content: Text(
                                              context.t(
                                                'Failed to add: {{e}}',
                                                {'e': context.t(failureMessageKey(e))},
                                              ),
                                            ),
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
                        error: (e, _) => Text(
                          context.t('Error loading projects: {{e}}', {'e': context.t(failureMessageKey(e))}),
                        ),
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
        title: Text(
          context.t('Paper Detail'),
          style: const TextStyle(fontWeight: FontWeight.w600),
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
                SnackBar(
                  content: Text(context.t('Paper link copied to clipboard')),
                ),
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
                      icon: Icon(
                        Icons.open_in_new,
                        size: 16,
                        color: context.lumi.background,
                      ),
                      label: Text(
                        context.t('Open full text'),
                        style: TextStyle(
                          color: context.lumi.background,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: context.lumi.primary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        elevation: 0,
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
        loading: () => const LumiPageSkeleton(height: 140),
        error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
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
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: theme.dividerColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              paper.title,
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Text(
              paper.journalName != null
                  ? '${paper.journalName} · ${paper.publicationYear}'
                  : '${paper.publicationYear}',
              style: context.type.bodyMedium!.copyWith(
                color: context.lumi.foregroundSecondary,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                LumiChip(
                  label: context.plural(
                    paper.citationCount,
                    one: '{{count}} Citation',
                    other: '{{count}} Citations',
                    args: {'count': formatNumber(paper.citationCount)},
                  ),
                  tone: LumiChipTone.primary,
                ),
                if (paper.isAiAnalyzable)
                  LumiChip(
                    label: context.t('AI Analyzable'),
                    icon: Icons.check_circle_outline,
                  ),
                if (paper.openAccessUrl != null)
                  LumiChip(
                    label: context.t('Open Access'),
                    tone: LumiChipTone.success,
                    icon: Icons.lock_open,
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              context.t('AUTHORS'),
              style: context.type.bodySmall!.copyWith(
                fontWeight: FontWeight.w600,
                color: context.lumi.muted,
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
                      color: context.lumi.surfaceMuted,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: theme.dividerColor),
                    ),
                    child: Text(
                      author.displayName,
                      style: context.type.bodySmall!.copyWith(
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
                              top: Radius.circular(12),
                            ),
                          ),
                          builder: (context) => Container(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  context.t('All Authors'),
                                  style: context.type.titleLarge!.copyWith(
                                    fontWeight: FontWeight.w600,
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
                                        context.t(
                                          'Author Position: {{position}}',
                                          {
                                            'position':
                                                paper.authors[idx].position,
                                          },
                                        ),
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
                      context.t('View all ({{length}})', {
                        'length': paper.authors.length,
                      }),
                      style: context.type.bodySmall!.copyWith(
                        color: context.lumi.primary,
                        fontWeight: FontWeight.w600,
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
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.dividerColor),
      ),
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _ActionButton(
            icon: Icons.bookmark,
            label: isBookmarked ? context.t('Saved') : context.t('Save'),
            active: isBookmarked,
            onTap: () => _toggleBookmark(isBookmarked, bookmarkId),
            isDark: isDark,
          ),
          _ActionButton(
            icon: Icons.add_box,
            label: context.t('Add to Project'),
            onTap: () => _openProjectPicker(context),
            isDark: isDark,
          ),
          _ActionButton(
            icon: Icons.format_quote,
            label: context.t('Cite Paper'),
            onTap: () {
              unawaited(
                showDialog<void>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: Text(context.t('Cite Publication')),
                    content: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          context.t('APA Style:'),
                          style: context.type.bodySmall!.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        SelectableText(
                          // i18n-ignore: APA/MLA citation format
                          '${paper.authors.isNotEmpty ? paper.authors.first.displayName : context.t("Unknown")} et al. (${paper.publicationYear}). ${paper.title}. ${paper.journalName ?? ""}.',
                          style: context.type.bodySmall,
                        ),
                        const Divider(height: 24),
                        Text(
                          context.t('MLA Style:'),
                          style: context.type.bodySmall!.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        SelectableText(
                          // i18n-ignore: APA/MLA citation format
                          '${paper.authors.isNotEmpty ? paper.authors.first.displayName : context.t("Unknown")}, et al. "${paper.title}." ${paper.journalName ?? "N/A"}, ${paper.publicationYear}.',
                          style: context.type.bodySmall,
                        ),
                      ],
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: Text(context.t('Close')),
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
            label: context.t('PDF Link'),
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
      leading: Icon(Icons.subject, color: context.lumi.primary),
      title: Text(
        context.t('Abstract & Description'),
        style: context.type.bodyMedium!.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            paper.abstractText ??
                context.t(
                  'No abstract description available for this publication.',
                ),
            style: context.type.bodyMedium!.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
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
      leading: Icon(Icons.image_outlined, color: context.lumi.primary),
      title: Text(
        context.t('Figures & Scientific Media'),
        style: context.type.bodyMedium!.copyWith(
          fontWeight: FontWeight.w600,
        ),
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
                context.t('Methodology Flowchart'),
                Icons.account_tree_outlined,
                context.lumi.primary,
              ),
              _buildMockMediaItem(
                context,
                context.t('Statistical Performance'),
                Icons.bar_chart_outlined,
                context.lumi.success,
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
    return Container(
      decoration: BoxDecoration(
        color: context.lumi.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
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
              style: context.type.bodySmall!.copyWith(
                fontWeight: FontWeight.w600,
              ),
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
          : PaperTopic(topicName: context.t('Unknown')),
    );
    final hasTaxonomy = paper.topics.isNotEmpty;

    return ExpansionTile(
      initiallyExpanded: true,
      leading: Icon(Icons.category_outlined, color: context.lumi.primary),
      title: Text(
        context.t('OpenAlex Taxonomy Scope'),
        style: context.type.bodyMedium!.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!hasTaxonomy)
                Text(
                  context.t('No taxonomy scope metadata found.'),
                  style: context.type.bodySmall!.copyWith(
                    fontStyle: FontStyle.italic,
                  ),
                )
              else ...[
                _buildTaxonomyRow(
                  context.t('Domain'),
                  primaryTopic.domainName ?? 'N/A',
                ),
                const SizedBox(height: 8),
                _buildTaxonomyRow(
                  context.t('Field'),
                  primaryTopic.fieldName ?? 'N/A',
                ),
                const SizedBox(height: 8),
                _buildTaxonomyRow(
                  context.t('Subfield'),
                  primaryTopic.subfieldName ?? 'N/A',
                ),
                const SizedBox(height: 8),
                _buildTaxonomyRow(
                  context.t('Topic'),
                  primaryTopic.topicName,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTaxonomyRow(String label, String value) {
    return Row(
      children: [
        Container(
          width: 80,
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: context.lumi.surfaceMuted,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: context.type.bodySmall!.copyWith(
              color: context.lumi.foregroundSecondary,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            style: context.type.bodySmall!.copyWith(
              fontWeight: FontWeight.w600,
            ),
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
      leading: Icon(Icons.analytics_outlined, color: context.lumi.primary),
      title: Text(
        context.t('Analytical Insights & Critique'),
        style: context.type.bodyMedium!.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Data quality score. Imported papers keep the column's
              // default 0, which means "not measured", not "0%".
              if (paper.dataQualityScore > 0)
                Container(
                  decoration: BoxDecoration(
                    color: context.lumi.surfaceMuted,
                    border: Border.all(color: context.lumi.primary),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Icon(
                        Icons.summarize_outlined,
                        color: context.lumi.primary,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          context.t('RAG Grounding Suitability: {{percent}}%', {
                            'percent': (paper.dataQualityScore * 100).round(),
                          }),
                          style: context.type.bodySmall!.copyWith(
                            fontWeight: FontWeight.w600,
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
                      QualityReadingContextCard(
                        paperId: widget.id,
                        topic: widget.topic,
                        query: widget.query,
                      ),
                      QualityPanel(
                        targetKind: 'paper',
                        targetId: widget.id,
                        showRatings: false,
                      ),

                      const Divider(height: 32),

                      // User Reviews & Feedback
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            context.t('Workspace Reviews'),
                            style: context.type.bodyMedium!.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            view.ratingCount == 0
                                ? context.t('No ratings yet')
                                : context.t(
                                    '{{ratingCount}} ratings · {{average}} avg',
                                    {
                                      'ratingCount': view.ratingCount,
                                      'average': view.ratingAvg.toStringAsFixed(
                                        1,
                                      ),
                                    },
                                  ),
                            style: context.type.bodySmall!.copyWith(
                              color: context.lumi.muted,
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
                              color: context.lumi.warning,
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
                          hintText: context.t('Add review notes...'),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding: const EdgeInsets.all(10),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: rating == 0 ? null : _submitRating,
                          child: Text(
                            context.t('Submit Review'),
                            style: context.type.bodySmall!.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text(
                  context.t('Error loading quality: {{e}}', {'e': context.t(failureMessageKey(e))}),
                  style: TextStyle(color: context.lumi.error),
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
      leading: Icon(Icons.chat_bubble_outline, color: context.lumi.primary),
      title: Text(
        context.t('Workspace Interactive Chat'),
        style: context.type.bodyMedium!.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.lumi.surfaceMuted,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: theme.dividerColor),
            ),
            child: Column(
              children: [
                Icon(
                  Icons.info_outline,
                  color: context.lumi.primary,
                  size: 24,
                ),
                const SizedBox(height: 8),
                Text(
                  context.t('Grounded assistant'),
                  style: context.type.bodyMedium!.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  context.t(
                    'Add this paper to a project to ask questions about it, write with it and look for research gaps.',
                  ),
                  textAlign: TextAlign.center,
                  style: context.type.bodySmall!.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: context.lumi.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  onPressed: () => _openProjectPicker(context),
                  icon: Icon(
                    Icons.add,
                    color: context.lumi.onPrimary,
                    size: 16,
                  ),
                  label: Text(
                    context.t('Add to Project Workspace'),
                    style: context.type.bodySmall!.copyWith(
                      color: context.lumi.onPrimary,
                      fontWeight: FontWeight.w600,
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
        ? context.lumi.foregroundSecondary
        : active
        ? context.lumi.primary
        : context.lumi.foregroundSecondary;

    return GestureDetector(
      onTap: disabled ? null : onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 6),
          Text(
            label,
            style: context.type.bodySmall!.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
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
          return Text(context.t('No in-library references found yet.'));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.t(
                'Showing {{inCorpus}} of {{totalReferenced}} cited works found in this library.',
                {
                  'inCorpus': data.inCorpus,
                  'totalReferenced': data.totalReferenced,
                },
              ),
              style: context.type.bodySmall!.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
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
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(color: theme.dividerColor),
                ),
                child: InkWell(
                  onTap: () =>
                      unawaited(context.push('/paper/${reference.id}')),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          reference.title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                            height: 1.3,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (authors.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            authors,
                            style: context.type.bodySmall!.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
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
                              style: context.type.bodySmall!.copyWith(
                                color: context.lumi.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (reference.doi != null &&
                                reference.doi!.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  context.t('DOI: {{doi}}', {
                                    'doi': reference.doi,
                                  }),
                                  style: context.type.bodySmall!.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
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
      loading: () => const LumiSkeleton(rows: 3, height: 64),
      error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
    );
  }
}

class OpenAlexMetadataCard extends StatelessWidget {
  const OpenAlexMetadataCard({required this.paper, super.key});
  final Paper paper;

  Widget _buildMetaRow(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: AppTypography.metrics.bodySmall!.copyWith(
                fontWeight: FontWeight.w600,
                color: context.lumi.foregroundSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: AppTypography.metrics.bodySmall!.copyWith(
                color: context.lumi.foreground,
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

    final primaryTopic = paper.topics.firstWhere(
      (t) => t.isPrimary == true,
      orElse: () => paper.topics.isNotEmpty
          ? paper.topics.first
          : PaperTopic(topicName: context.t('Unknown')),
    );
    final hasTaxonomy = paper.topics.isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.dividerColor),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.shield, color: context.lumi.primary, size: 16),
              const SizedBox(width: 8),
              Text(
                context.t('OpenAlex Metadata'),
                style: context.type.bodyMedium!.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const Divider(height: 20),
          _buildMetaRow(
            context,
            context.t('Year'),
            paper.publicationYear.toString(),
          ),
          _buildMetaRow(
            context,
            context.t('Type'),
            paper.paperKind ?? context.t('Not available'),
          ),
          _buildMetaRow(
            context,
            context.t('Source'),
            paper.journalName ?? context.t('Not available'),
          ),
          _buildMetaRow(
            context,
            context.t('Language'),
            paper.language ?? context.t('Not available'),
          ),
          _buildMetaRow(
            context,
            context.t('Cited by'),
            paper.citationCount.toString(),
          ),
          if (paper.fwci != null)
            _buildMetaRow(context, 'FWCI', paper.fwci!.toStringAsFixed(2)),
          if (paper.relatedWorksCount != null)
            _buildMetaRow(
              context,
              context.t('Related works'),
              paper.relatedWorksCount.toString(),
            ),
          if (paper.primaryProvider != null)
            _buildMetaRow(
              context,
              context.t('Provider'),
              paper.primaryProvider!,
            ),
          if (paper.openAccessStatus != null)
            _buildMetaRow(
              context,
              context.t('Open Access'),
              paper.openAccessStatus!.toUpperCase(),
            ),
          if (paper.externalIds.doi != null)
            _buildMetaRow(context, 'DOI', paper.externalIds.doi!),
          if (paper.paperLink != null)
            _buildMetaRow(context, context.t('Link'), paper.paperLink!),

          const Divider(height: 20),
          Text(
            context.t('TAXONOMY SCOPE'),
            style: context.type.bodySmall!.copyWith(
              fontWeight: FontWeight.w600,
              color: context.lumi.muted,
            ),
          ),
          const SizedBox(height: 8),
          if (!hasTaxonomy)
            Text(
              context.t(
                'OpenAlex taxonomy metadata is not backfilled yet for this publication.',
              ),
              style: context.type.bodySmall!.copyWith(
                fontStyle: FontStyle.italic,
                color: context.lumi.error,
              ),
            )
          else ...[
            _buildMetaRow(context, context.t('Topic'), primaryTopic.topicName),
            if (primaryTopic.subfieldName != null)
              _buildMetaRow(
                context,
                context.t('Subfield'),
                primaryTopic.subfieldName!,
              ),
            if (primaryTopic.fieldName != null)
              _buildMetaRow(
                context,
                context.t('Field'),
                primaryTopic.fieldName!,
              ),
            if (primaryTopic.domainName != null)
              _buildMetaRow(
                context,
                context.t('Domain'),
                primaryTopic.domainName!,
              ),
          ],
        ],
      ),
    );
  }
}
