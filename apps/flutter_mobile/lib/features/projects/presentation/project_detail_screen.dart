import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/ai_assistant_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_mode.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/chat_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/members_settings_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/outputs_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/overview_tab.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail/papers_tab.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ProjectDetailScreen extends ConsumerStatefulWidget {
  const ProjectDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<ProjectDetailScreen> createState() =>
      _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen> {
  final _message = TextEditingController();
  final _scrollController = ScrollController();
  ProjectChatMode _mode = ProjectChatMode.team;
  Timer? _poller;
  bool _sending = false;
  String? _sendError;

  @override
  void initState() {
    super.initState();
    _poller = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());
  }

  @override
  void dispose() {
    _poller?.cancel();
    _message.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _refresh() {
    if (!mounted) return;
    if (_mode == ProjectChatMode.team) {
      ref.invalidate(projectTeamChatProvider(widget.id));
    } else {
      ref.invalidate(
        projectChatProvider((
          projectId: widget.id,
          scope: _mode == ProjectChatMode.privateAi ? 'private' : 'team',
        )),
      );
    }
  }

  void _selectMode(ProjectChatMode mode) {
    setState(() {
      _mode = mode;
      _sendError = null;
    });
    _refresh();
  }

  Future<void> _send(int paperCount) async {
    final text = _message.text.trim();
    if (text.isEmpty || _sending) return;
    if (_mode != ProjectChatMode.team && paperCount == 0) {
      setState(() => _sendError = 'Add papers before asking AI.');
      return;
    }
    setState(() {
      _sending = true;
      _sendError = null;
    });
    try {
      final api = ref.read(projectsApiProvider);
      if (_mode == ProjectChatMode.team) {
        await api.sendTeamChat(widget.id, text);
      } else {
        await api.sendChat(
          widget.id,
          text,
          scope: _mode == ProjectChatMode.privateAi ? 'private' : 'team',
        );
      }
      _message.clear();
      _refresh();
    } on Object catch (error) {
      if (mounted) setState(() => _sendError = error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
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
            orElse: () => const Text('Project Workspace'),
          ),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            indicatorColor: Color(0xFF06B6D4),
            labelColor: Color(0xFF06B6D4),
            unselectedLabelColor: Color(0xFF94A3B8),
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Papers'),
              Tab(text: 'Chat'),
              Tab(text: 'AI Assistant'),
              Tab(text: 'Outputs'),
              Tab(text: 'Members'),
            ],
          ),
        ),
        body: project.when(
          data: (data) => TabBarView(
            children: [
              ProjectOverviewTab(project: data, projectId: widget.id, ref: ref),
              ProjectPapersTab(project: data, projectId: widget.id, ref: ref),
              ProjectChatTab(
                projectId: widget.id,
                project: data,
                mode: ProjectChatMode.team,
                selectMode: _selectMode,
                scrollController: _scrollController,
                refresh: _refresh,
                messageController: _message,
                sending: _sending,
                sendError: _sendError,
                sendFn: _send,
                colors: colors,
              ),
              ProjectAiAssistantTab(
                projectId: widget.id,
                project: data,
                mode: _mode == ProjectChatMode.team
                    ? ProjectChatMode.privateAi
                    : _mode,
                selectMode: _selectMode,
                scrollController: _scrollController,
                refresh: _refresh,
                messageController: _message,
                sending: _sending,
                sendError: _sendError,
                sendFn: _send,
                colors: colors,
              ),
              ProjectOutputsTab(projectId: widget.id, ref: ref),
              ProjectMembersSettingsTab(project: data, ref: ref),
            ],
          ),
          loading: () => const AppLoading(
            fullScreen: true,
            message: 'Loading project workspace...',
          ),
          error: (error, _) => AppErrorState(message: error.toString()),
        ),
      ),
    );
  }
}
