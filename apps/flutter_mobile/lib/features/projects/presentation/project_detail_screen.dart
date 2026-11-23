import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_confirm_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/ai_assistant_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_mode.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/outputs_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/overview_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/papers_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_header.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_members_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/project_settings_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Days a project stays in Trash before it can be purged, as the backend
/// and web (`PROJECT_TRASH_RETENTION_DAYS` in @trend/shared-types).
const projectTrashRetentionDays = 30;

enum _ProjectAction { members, settings, trash }

/// What the Chat tab shows: the live team conversation or the AI assistant.
enum _ChatView { team, ai }

class ProjectDetailScreen extends ConsumerStatefulWidget {
  const ProjectDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<ProjectDetailScreen> createState() =>
      _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen> {
  /// Position of the live team chat in the tab bar.
  static const int _chatTabIndex = ProjectTabs.chat;

  // The Chat tab is the live team conversation and owns its own state
  // (`TeamChatView`). This screen only holds the AI Assistant tab's draft,
  // channel (private or shared), error and sending flag.
  final _aiMessage = TextEditingController();
  final _scrollController = ScrollController();
  ProjectChatMode _aiMode = ProjectChatMode.privateAi;
  _ChatView _chatView = _ChatView.team;
  bool _trashing = false;
  Timer? _poller;
  bool _aiSending = false;
  String? _aiError;

  @override
  void initState() {
    super.initState();
    _poller = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());
  }

  @override
  void dispose() {
    _poller?.cancel();
    _aiMessage.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _refresh() {
    if (!mounted) return;
    ref.invalidate(
      projectChatProvider((projectId: widget.id, scope: _aiScope(_aiMode))),
    );
  }

  String _aiScope(ProjectChatMode mode) =>
      mode == ProjectChatMode.privateAi ? 'private' : 'team';

  void _selectAiMode(ProjectChatMode mode) {
    setState(() {
      _aiMode = mode;
      _aiError = null;
    });
    _refresh();
  }

  /// Sends the AI tab's draft to the channel that tab shows. Without papers
  /// the AI cannot answer, so nothing is sent.
  Future<void> _sendAi(int paperCount) async {
    final text = _aiMessage.text.trim();
    if (text.isEmpty || _aiSending) return;
    if (paperCount == 0) {
      setState(() => _aiError = context.t('Add papers before asking AI.'));
      return;
    }
    setState(() {
      _aiSending = true;
      _aiError = null;
    });
    try {
      await ref
          .read(projectsApiProvider)
          .sendChat(widget.id, text, scope: _aiScope(_aiMode));
      _aiMessage.clear();
      _refresh();
    } on Object catch (error) {
      if (mounted) {
        setState(() => _aiError = context.t(failureMessageKey(error)));
      }
    } finally {
      if (mounted) setState(() => _aiSending = false);
    }
  }

  Future<void> _showActions(ProjectView project) async {
    final owner = project.viewerIsOwner ?? false;
    final action = await showLumiActionSheet<_ProjectAction>(
      context,
      title: project.title,
      actions: [
        LumiSheetAction(
          value: _ProjectAction.members,
          label: context.t('Members'),
          icon: Icons.people_outline,
        ),
        // Owner only, as the backend allows (EDIT_SETTINGS, DELETE).
        if (owner) ...[
          LumiSheetAction(
            value: _ProjectAction.settings,
            label: context.t('Project settings'),
            icon: Icons.settings_outlined,
          ),
          LumiSheetAction(
            value: _ProjectAction.trash,
            label: context.t('Move project to Trash'),
            icon: Icons.delete_outline,
            destructive: true,
            enabled: !_trashing,
          ),
        ],
      ],
    );
    if (!mounted || action == null) return;
    final navigator = Navigator.of(context);
    switch (action) {
      case _ProjectAction.members:
        await navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => ProjectMembersScreen(projectId: project.id),
          ),
        );
      case _ProjectAction.settings:
        await navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => ProjectSettingsScreen(project: project),
          ),
        );
      case _ProjectAction.trash:
        await _moveToTrash(project);
    }
  }

  /// As the web lifecycle section: the owner types the title to confirm;
  /// the project goes to Trash (restorable on the web for 30 days). Pending
  /// invitations are cancelled and discovery closes, which a restore does not
  /// undo, so there is no Undo here.
  Future<void> _moveToTrash(ProjectView project) async {
    if (_trashing) return;
    final title = project.title.trim();
    final typed = await showLumiInputSheet(
      context,
      title: context.t('Move project to Trash'),
      message: [
        context.t(
          'This action moves the project to Trash and blocks normal workspace access. Papers, members, reviews, and research history are preserved and can be restored within {{days}} days. Permanent deletion is only allowed after {{days}} days.',
          {'days': projectTrashRetentionDays},
        ),
        context.t(
          'Members can still read existing research. Pending invitations will be cancelled and discovery will close.',
        ),
      ].join('\n\n'),
      field: LumiSheetField(
        label: context.t('Type {{title}} to confirm', {'title': title}),
        maxLines: 1,
        required: true,
        validator: (text) => text == title ? null : '',
      ),
      confirmText: context.t('Move to Trash'),
      destructive: true,
    );
    if (typed != title || !mounted) return;
    setState(() => _trashing = true);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final locale = context.appLocale;
    try {
      await ref.read(projectsApiProvider).delete(project.id);
      ref.invalidate(projectsProvider);
      messenger.showSnackBar(
        SnackBar(content: Text(translate('Project moved to Trash', locale))),
      );
      router.go('/projects');
    } on Object catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            translate('Failed to delete: {{e}}', locale, {
              'e': translate(failureMessageKey(e), locale),
            }),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _trashing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = ref.watch(projectProvider(widget.id));
    final colors = Theme.of(context).colorScheme;
    final tints = context.tints;
    final lumi = context.lumi;
    final theme = Theme.of(context);
    // With the keyboard up (chat), the header shrinks to the title so the
    // conversation keeps its room.
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: lumi.background,
        // The project's own dark header: back, actions, then the project at
        // a glance (ProjectHeader) under it.
        appBar: AppBar(
          backgroundColor: tints.ink,
          foregroundColor: tints.onInk,
          surfaceTintColor: tints.ink,
          // Square: the header continues under it.
          shape: const RoundedRectangleBorder(),
          scrolledUnderElevation: 0,
          systemOverlayStyle: SystemUiOverlayStyle.light,
          leading: Navigator.of(context).canPop()
              ? Padding(
                  padding: const EdgeInsetsDirectional.only(start: 8),
                  child: Center(
                    child: IconButton(
                      tooltip: MaterialLocalizations.of(
                        context,
                      ).backButtonTooltip,
                      style: IconButton.styleFrom(
                        backgroundColor: tints.onInk.withValues(alpha: 0.1),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: () =>
                          unawaited(Navigator.of(context).maybePop()),
                      icon: const Icon(Icons.arrow_back),
                    ),
                  ),
                )
              : null,
          title: project.hasValue ? null : Text(context.t('Project')),
          actions: [
            if (project.value case final data?)
              IconButton(
                tooltip: context.t('More project actions'),
                style: IconButton.styleFrom(
                  backgroundColor: tints.onInk.withValues(alpha: 0.1),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: () => unawaited(_showActions(data)),
                icon: const Icon(Icons.more_vert),
              ),
            const SizedBox(width: 8),
          ],
        ),
        // With no paper yet, the Papers tab's empty state says what to do
        // and Overview's next step opens search: no second button.
        floatingActionButton: (project.value?.paperCount ?? 0) > 0
            ? const _AddPaperFab()
            : null,
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (project.value case final data?)
              ProjectHeader(project: data, compact: keyboardOpen),
            // The tabs as a segmented track on the page, under the header.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: segmentTrackColor(context),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: LayoutBuilder(
                    builder: (context, box) => TabBar(
                      // Scrolls rather than clipping a long label (320dp,
                      // large text, Vietnamese).
                      isScrollable: true,
                      tabAlignment: TabAlignment.start,
                      dividerHeight: 0,
                      indicatorSize: TabBarIndicatorSize.tab,
                      indicator: BoxDecoration(
                        color: segmentSelectedColor(context),
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: LumiElevation.card(theme.brightness),
                      ),
                      labelColor: lumi.foreground,
                      unselectedLabelColor: lumi.foregroundSecondary,
                      labelStyle: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                      unselectedLabelStyle: theme.textTheme.labelLarge
                          ?.copyWith(fontWeight: FontWeight.w600),
                      // Equal share of the track when the labels fit;
                      // otherwise 16 each side and the bar scrolls.
                      labelPadding: EdgeInsets.symmetric(
                        horizontal: _tabPadding(context, box.maxWidth, [
                          context.t('Overview'),
                          context.t('Papers'),
                          context.t('Chat'),
                          context.t('Outputs'),
                        ]),
                      ),
                      splashBorderRadius: BorderRadius.circular(999),
                      tabs: [
                        Tab(height: 44, text: context.t('Overview')),
                        Tab(height: 44, text: context.t('Papers')),
                        Tab(height: 44, text: context.t('Chat')),
                        Tab(height: 44, text: context.t('Outputs')),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: project.when(
                data: (data) => TabBarView(
                  children: [
                    ProjectOverviewTab(
                      project: data,
                      projectId: widget.id,
                      ref: ref,
                    ),
                    ProjectPapersTab(
                      project: data,
                      projectId: widget.id,
                      ref: ref,
                    ),
                    Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                          child: LumiSegmentedTabs<_ChatView>(
                            options: [
                              (_ChatView.team, context.t('Team chat')),
                              (_ChatView.ai, context.t('AI assistant')),
                            ],
                            selected: _chatView,
                            onChanged: (v) => setState(() => _chatView = v),
                          ),
                        ),
                        Expanded(
                          // Both stay mounted so each keeps its draft and
                          // scroll position when the user switches.
                          child: IndexedStack(
                            index: _chatView.index,
                            children: [
                              TeamChatView(
                                projectId: widget.id,
                                ownerId: data.ownerId,
                                tabIndex: _chatTabIndex,
                              ),
                              ProjectAiAssistantTab(
                                projectId: widget.id,
                                project: data,
                                mode: _aiMode,
                                selectMode: _selectAiMode,
                                scrollController: _scrollController,
                                refresh: _refresh,
                                messageController: _aiMessage,
                                sending: _aiSending,
                                sendError: _aiError,
                                sendFn: _sendAi,
                                colors: colors,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    ProjectOutputsTab(projectId: widget.id, ref: ref),
                  ],
                ),
                loading: () => const LumiPageSkeleton(),
                error: (error, _) => LumiErrorState(
                  message: context.t(failureMessageKey(error)),
                  retrying: project.isLoading,
                  onRetry: () => ref.invalidate(projectProvider(widget.id)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal label padding that makes [labels] fill [width] exactly, never
/// under 16 (then the tab bar scrolls).
double _tabPadding(BuildContext context, double width, List<String> labels) {
  final style = Theme.of(
    context,
  ).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700);
  final scaler = MediaQuery.textScalerOf(context);
  var text = 0.0;
  for (final label in labels) {
    final painter = TextPainter(
      text: TextSpan(text: label, style: style),
      textDirection: Directionality.of(context),
      textScaler: scaler,
      maxLines: 1,
    )..layout();
    text += painter.width;
    painter.dispose();
  }
  final share = (width - text) / (labels.length * 2);
  // A little under the share, so rounding never pushes the last tab out.
  return share > 16 ? share - 0.5 : 16;
}

/// "Add paper", on the Papers tab only: papers are added from search
/// (each paper's "Add to project"), as on the web.
class _AddPaperFab extends StatelessWidget {
  const _AddPaperFab();

  @override
  Widget build(BuildContext context) {
    final controller = DefaultTabController.of(context);
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        if (controller.index != ProjectTabs.papers) {
          return const SizedBox.shrink();
        }
        return FloatingActionButton.extended(
          onPressed: () => unawaited(context.push('/search')),
          icon: const Icon(Icons.add),
          label: Text(context.t('Add paper')),
        );
      },
    );
  }
}
