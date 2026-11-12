import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
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
            content: Text(context.t('Failed to send invitation: {{e}}', {'e': e})),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _removeMember(String memberId) async {
    try {
      await widget.ref
          .read(projectsApiProvider)
          .removeMember(widget.project.id, memberId);
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
            content: Text(context.t('Failed to remove member: {{e}}', {'e': e})),
            backgroundColor: Colors.red,
          ),
        );
      }
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
            content: Text(context.t('Update failed: {{e}}', {'e': e})),
            backgroundColor: Colors.red,
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
            child: Text(context.t('Delete'), style: const TextStyle(color: Colors.red)),
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
              content: Text(context.t('Failed to delete: {{e}}', {'e': e})),
              backgroundColor: Colors.red,
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
          leading: const Icon(Icons.people_outline, color: Color(0xFF22C55E)),
          title: Text(
            context.t('Workspace Members'),
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
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
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF06B6D4),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        onPressed: _adding ? null : _addMember,
                        child: _adding
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                context.t('Add'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
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
                      final isOwner = widget.project.ownerId == m.id;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const CircleAvatar(child: Icon(Icons.person)),
                        title: Text(
                          m.displayName,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          isOwner ? context.t('Owner') : context.t('Member'),
                          style: const TextStyle(fontSize: 11),
                        ),
                        trailing: isOwner
                            ? null
                            : IconButton(
                                icon: const Icon(
                                  Icons.remove_circle_outline,
                                  color: Colors.red,
                                  size: 18,
                                ),
                                onPressed: () => _removeMember(m.id),
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
          leading: const Icon(
            Icons.settings_outlined,
            color: Color(0xFF94A3B8),
          ),
          title: Text(
            context.t('Workspace Settings'),
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          children: [
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    context.t('Workspace Name'),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _titleController,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    context.t('Description'),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _descController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF06B6D4),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              context.t('Save Settings'),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                  ),
                  const Divider(height: 32),
                  Text(
                    context.t('Danger Zone'),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: Color(0xFFEF4444),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: _delete,
                      icon: const Icon(Icons.delete_forever),
                      label: Text(
                        context.t('Delete Workspace'),
                        style: const TextStyle(fontWeight: FontWeight.bold),
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
