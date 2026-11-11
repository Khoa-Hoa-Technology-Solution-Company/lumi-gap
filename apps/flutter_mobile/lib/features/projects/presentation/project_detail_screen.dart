import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/ai_assistant_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_mode.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/members_settings_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/outputs_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/overview_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/papers_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/team_chat/team_chat_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ProjectDetailScreen extends ConsumerStatefulWidget {
  const ProjectDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<ProjectDetailScreen> createState() =>
      _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen> {
  /// Position of the live team chat in the tab bar.
  static const _chatTabIndex = 2;

  // The Chat tab is the live team conversation and owns its own state
  // (`TeamChatView`). This screen only holds the AI Assistant tab's draft,
  // channel (private or shared), error and sending flag.
  final _aiMessage = TextEditingController();
  final _scrollController = ScrollController();
  ProjectChatMode _aiMode = ProjectChatMode.privateAi;
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
      if (mounted) setState(() => _aiError = error.toString());
    } finally {
      if (mounted) setState(() => _aiSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = ref.watch(projectProvider(widget.id));
    final colors = Theme.of(context).colorScheme;
    return DefaultTabController(
      length: 6,
      child: Scaffold(
        backgroundColor: colors.surface,
        appBar: AppBar(
          title: project.maybeWhen(
            data: (data) => Text(data.title),
            orElse: () => Text(context.t('Project Workspace')),
          ),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            indicatorColor: const Color(0xFF06B6D4),
            labelColor: const Color(0xFF06B6D4),
            unselectedLabelColor: const Color(0xFF94A3B8),
            tabs: [
              Tab(text: context.t('Overview')),
              Tab(text: context.t('Papers')),
              Tab(text: context.t('Chat')),
              Tab(text: context.t('AI Assistant')),
              Tab(text: context.t('Outputs')),
              Tab(text: context.t('Members')),
            ],
          ),
        ),
        body: project.when(
          data: (data) => TabBarView(
            children: [
              ProjectOverviewTab(project: data, projectId: widget.id, ref: ref),
              ProjectPapersTab(project: data, projectId: widget.id, ref: ref),
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
              ProjectOutputsTab(projectId: widget.id, ref: ref),
              ProjectMembersSettingsTab(project: data, ref: ref),
            ],
          ),
          loading: () => AppLoading(
            fullScreen: true,
            message: context.t('Loading project workspace...'),
          ),
          error: (error, _) => AppErrorState(message: error.toString()),
        ),
      ),
    );
  }
}
