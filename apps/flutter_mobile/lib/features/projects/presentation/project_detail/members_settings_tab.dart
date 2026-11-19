import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/confirm_dialog.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_avatar.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ProjectMembersSettingsTab extends StatefulWidget {
  const ProjectMembersSettingsTab({
    required this.project,
    required this.ref,
    super.key,
  });
  final ProjectView project;
  final WidgetRef ref;

  @override
  State<ProjectMembersSettingsTab> createState() => _MembersSettingsTabState();
}

class _MembersSettingsTabState extends State<ProjectMembersSettingsTab> {
  final _emailController = TextEditingController();
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  bool _adding = false;
  bool _saving = false;

  /// Member being removed. One removal at a time: a second tap, on the
  /// same row or another, waits for the first answer.
  String? _removingId;

  @override
  void initState() {
    super.initState();
    _titleController.text = widget.project.title;
    _descController.text = widget.project.description ?? '';
  }

  @override
  void dispose() {
    _emailController.dispose();
    _titleController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _addMember() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;
    setState(() => _adding = true);
    try {
      await widget.ref
          .read(projectsApiProvider)
          .addMember(widget.project.id, targetId: email);
      widget.ref.invalidate(projectProvider(widget.project.id));
      _emailController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t('Invitation sent. They join once they accept it.')),
          ),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t('Failed to send invitation: {{e}}', {'e': context.t(failureMessageKey(e))})),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _removeMember(ProjectMemberRef member) async {
    if (_removingId != null) return;
    setState(() => _removingId = member.id);
    try {
      // Removing someone takes away their access: ask first.
      final confirmed = await ConfirmDialog.show(
        context,
        title: context.t('Remove member'),
        message: context.t(
          'Remove {{name}} from this project? They will lose access to it.',
          {'name': member.displayName},
        ),
        confirmText: context.t('Remove'),
        isDestructive: true,
      );
      if (!(confirmed ?? false) || !mounted) return;
      await widget.ref
          .read(projectsApiProvider)
          .removeMember(widget.project.id, member.id);
      widget.ref.invalidate(projectProvider(widget.project.id));
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.t('Member removed.'))));
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t(failureMessageKey(e))),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _removingId = null);
    }
  }

  Future<void> _save() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) return;
    setState(() => _saving = true);
    try {
      await widget.ref
          .read(projectsApiProvider)
          .update(
            widget.project.id,
            title: title,
            description: _descController.text.trim(),
          );
      widget.ref.invalidate(projectProvider(widget.project.id));
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.t('Workspace updated.'))));
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t('Update failed: {{e}}', {'e': context.t(failureMessageKey(e))})),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('Delete Workspace?')),
        content: Text(
          context.t('All papers and chat history in this workspace will be deleted forever.'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.t('Cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.t('Delete'), style: TextStyle(color: context.lumi.error)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await widget.ref.read(projectsApiProvider).delete(widget.project.id);
        widget.ref.invalidate(projectsProvider);
        if (mounted) {
          context.pop();
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(context.t('Workspace deleted.'))));
        }
      } on Object catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(context.t('Failed to delete: {{e}}', {'e': context.t(failureMessageKey(e))})),
              backgroundColor: context.lumi.error,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Section: Members
        ExpansionTile(
          initiallyExpanded: true,
          leading: Icon(Icons.people_outline, color: context.lumi.primary),
          title: Text(
            context.t('Workspace Members'),
            style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,),
          ),
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _emailController,
                          decoration: InputDecoration(
                            hintText: context.t('Enter User ID or Email'),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: context.lumi.primary,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        onPressed: _adding ? null : _addMember,
                        child: _adding
                            ? SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: context.lumi.onPrimary,
                                ),
                              )
                            : Text(
                                context.t('Add'),
                                style: TextStyle(
                                  color: context.lumi.onPrimary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: widget.project.members.length,
                    itemBuilder: (context, idx) {
                      final m = widget.project.members[idx];
                      final isOwner = m.isOwnerOf(widget.project);
                      // Only the owner manages members; the server would
                      // refuse anyone else, so the button is not offered.
                      final canRemove = !isOwner &&
                          (widget.project.viewerIsOwner ?? false);
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: LumiAvatar(name: m.displayName),
                        title: Text(
                          m.displayName,
                          style: context.type.bodyMedium!.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          isOwner ? context.t('Owner') : context.t('Member'),
                          style: context.type.bodySmall,
                        ),
                        trailing: !canRemove
                            ? null
                            : IconButton(
                                tooltip: context.t('Remove member'),
                                icon: Icon(
                                  Icons.person_remove_outlined,
                                  color: context.lumi.error,
                                  size: 20,
                                ),
                                onPressed: _removingId != null
                                    ? null
                                    : () => unawaited(_removeMember(m)),
                              ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Section: Workspace Settings
        ExpansionTile(
          leading: Icon(
            Icons.settings_outlined,
            color: context.lumi.muted,
          ),
          title: Text(
            context.t('Workspace Settings'),
            style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600,),
          ),
          children: [
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    context.t('Workspace Name'),
                    style: context.type.bodySmall!.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.lumi.muted,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _titleController,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    context.t('Description'),
                    style: context.type.bodySmall!.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.lumi.muted,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _descController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: context.lumi.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: context.lumi.onPrimary,
                              ),
                            )
                          : Text(
                              context.t('Save Settings'),
                              style: TextStyle(
                                color: context.lumi.onPrimary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                  ),
                  const Divider(height: 32),
                  Text(
                    context.t('Danger Zone'),
                    style: context.type.bodySmall!.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.lumi.error,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: context.lumi.error,
                        side: BorderSide(color: context.lumi.error),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onPressed: _delete,
                      icon: const Icon(Icons.delete_forever),
                      label: Text(
                        context.t('Delete Workspace'),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}
