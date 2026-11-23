import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_avatar.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_confirm_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Address shape the backend accepts for an invitation
/// (`project.controller.ts` addMemberSchema: an email, at most 320 chars).
final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// Error key for an invitation address, or null when it can be sent.
String? inviteEmailError(String text) {
  if (text.isEmpty) return null;
  if (text.length > 320 || !_email.hasMatch(text)) {
    return tk('Enter a valid email address.');
  }
  return null;
}

/// Who is in the project. Everyone sees the list; only the owner invites and
/// removes, as the backend allows (`project-workspace.rules.ts`
/// MANAGE_MEMBERS is owner-only).
class ProjectMembersScreen extends ConsumerStatefulWidget {
  const ProjectMembersScreen({required this.projectId, super.key});

  final String projectId;

  @override
  ConsumerState<ProjectMembersScreen> createState() =>
      _ProjectMembersScreenState();
}

class _ProjectMembersScreenState extends ConsumerState<ProjectMembersScreen> {
  bool _inviting = false;

  /// Member being removed: one removal at a time.
  String? _removingId;

  /// Shows [key] translated, with [args] translated too.
  void _say(String key, {Map<String, Object?>? args, bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.t(key, args)),
        backgroundColor: error ? context.lumi.error : null,
      ),
    );
  }

  Future<void> _invite() async {
    if (_inviting) return;
    final email = await showLumiInputSheet(
      context,
      title: context.t('Invite member'),
      message: context.t('They join once they accept the invitation.'),
      field: LumiSheetField(
        label: context.t('Email'),
        keyboardType: TextInputType.emailAddress,
        maxLines: 1,
        required: true,
        validator: (text) {
          final key = inviteEmailError(text);
          return key == null ? null : context.t(key);
        },
      ),
      confirmText: context.t('Send invitation'),
    );
    if (email == null || !mounted) return;
    setState(() => _inviting = true);
    try {
      await ref
          .read(projectsApiProvider)
          .addMember(widget.projectId, targetId: email);
      ref.invalidate(projectProvider(widget.projectId));
      _say(tk('Invitation sent. They join once they accept it.'));
    } on Object catch (e) {
      if (!mounted) return;
      _say(
        tk('Failed to send invitation: {{e}}'),
        args: {'e': context.t(failureMessageKey(e))},
        error: true,
      );
    } finally {
      if (mounted) setState(() => _inviting = false);
    }
  }

  Future<void> _remove(ProjectMemberRef member) async {
    if (_removingId != null) return;
    final confirmed = await showLumiConfirmSheet(
      context,
      title: context.t('Remove member'),
      message: context.t(
        'Remove {{name}} from this project? They will lose access to it.',
        {'name': member.displayName},
      ),
      confirmText: context.t('Remove'),
      destructive: true,
    );
    if (!(confirmed ?? false) || !mounted) return;
    setState(() => _removingId = member.id);
    try {
      await ref
          .read(projectsApiProvider)
          .removeMember(widget.projectId, member.id);
      ref.invalidate(projectProvider(widget.projectId));
      _say(tk('Member removed.'));
    } on Object catch (e) {
      _say(failureMessageKey(e), error: true);
    } finally {
      if (mounted) setState(() => _removingId = null);
    }
  }

  Future<void> _memberActions(ProjectMemberRef member) async {
    final action = await showLumiActionSheet<String>(
      context,
      title: member.displayName,
      actions: [
        LumiSheetAction(
          value: 'remove',
          label: context.t('Remove member'),
          icon: Icons.person_remove_outlined,
          destructive: true,
          enabled: _removingId == null,
        ),
      ],
    );
    if (action == 'remove' && mounted) await _remove(member);
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(projectProvider(widget.projectId));
    final project = query.value;
    final owner = project?.viewerIsOwner ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Members'))),
      floatingActionButton: owner
          ? FloatingActionButton.extended(
              onPressed: _inviting ? null : () => unawaited(_invite()),
              icon: const Icon(Icons.person_add_alt_1_outlined),
              label: Text(context.t('Invite member')),
            )
          : null,
      body: switch (query) {
        AsyncValue(:final value?) => RefreshIndicator(
            onRefresh: () => ref.refresh(projectProvider(widget.projectId).future),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              // Room for the FAB under the last row.
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 96),
              children: [
                LumiRowGroup(
                  children: [
                    for (final m in value.members)
                      _MemberRow(
                        member: m,
                        isOwner: m.isOwnerOf(value),
                        canRemove: owner && !m.isOwnerOf(value),
                        removing: _removingId == m.id,
                        locked: _removingId != null,
                        onRemove: () => unawaited(_remove(m)),
                        onLongPress: () => unawaited(_memberActions(m)),
                      ),
                  ],
                ),
              ],
            ),
          ),
        AsyncValue(:final error?) => LumiErrorState(
            message: context.t(failureMessageKey(error)),
            retrying: query.isLoading,
            onRetry: () => ref.invalidate(projectProvider(widget.projectId)),
          ),
        _ => const LumiPageSkeleton(height: 64),
      },
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({
    required this.member,
    required this.isOwner,
    required this.canRemove,
    required this.removing,
    required this.locked,
    required this.onRemove,
    required this.onLongPress,
  });

  final ProjectMemberRef member;
  final bool isOwner;

  /// Only the owner removes, and never the owner row.
  final bool canRemove;
  final bool removing;

  /// Another removal is running.
  final bool locked;
  final VoidCallback onRemove;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final row = Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 10, 4, 10),
      child: Row(
        children: [
          LumiAvatar(name: member.displayName),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium,
                ),
                Text(
                  isOwner ? context.t('Owner') : context.t('Member'),
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ],
            ),
          ),
          if (canRemove)
            IconButton(
              tooltip: context.t('Remove member'),
              onPressed: locked ? null : onRemove,
              icon: removing
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(Icons.person_remove_outlined, color: lumi.error),
            )
          else
            const SizedBox(width: 12),
        ],
      ),
    );
    if (!canRemove) return row;
    return Semantics(
      onLongPressHint: context.t('Show actions'),
      child: InkWell(
        onLongPress: locked
            ? null
            : () {
                unawaited(Haptics.select());
                onLongPress();
              },
        child: row,
      ),
    );
  }
}
