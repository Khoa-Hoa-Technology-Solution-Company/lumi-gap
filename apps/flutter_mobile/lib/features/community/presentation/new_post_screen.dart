import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_confirm_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Error keys of a new discussion, by field (backend `postInputSchema`).
({String? category, String? title, String? body, String? tags}) newPostErrors({
  required String? categoryId,
  required String title,
  required String body,
  required String tags,
}) {
  final t = title.trim();
  final b = body.trim();
  final parsed = parseForumTags(tags);
  return (
    category: categoryId == null ? tk('Choose a category.') : null,
    title: t.length < forumTitleMin
        ? tk('Use at least 3 characters.')
        : t.length > forumTitleMax
            ? tk('Use at most 240 characters.')
            : null,
    body: b.isEmpty
        ? tk('Write the discussion first.')
        : b.length > forumBodyMax
            ? tk('Use at most 20000 characters.')
            : null,
    tags: parsed.length > forumTagsMax
        ? tk('Use up to 5 tags')
        : parsed.any((x) => x.length > forumTagMax)
            ? tk('Each tag can have at most 80 characters.')
            : null,
  );
}

/// A short new discussion: a question or a discussion in a forum category,
/// optionally inside a research community. Paper and research-gap
/// discussions need a linked paper or gap, which is done on the web.
class NewPostScreen extends ConsumerStatefulWidget {
  const NewPostScreen({this.communityId, this.communityName, this.editing, super.key});
  final String? communityId;
  final String? communityName;

  /// The author's own discussion to edit: title, body and tags change; its
  /// type and category stay (moving category is a moderator action).
  final ForumPost? editing;

  @override
  ConsumerState<NewPostScreen> createState() => _NewPostScreenState();
}

class _NewPostScreenState extends ConsumerState<NewPostScreen> {
  late String _type = widget.editing?.type ?? 'QUESTION';
  late String? _categoryId = widget.editing?.category?.id;
  late final _title = TextEditingController(text: widget.editing?.title);
  late final _body = TextEditingController(text: widget.editing?.content);
  late final _tags = TextEditingController(text: widget.editing?.tags.join(', '));
  bool _showErrors = false;
  bool _sending = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    _tags.dispose();
    super.dispose();
  }

  bool get _dirty {
    final e = widget.editing;
    if (e != null) {
      return _title.text.trim() != e.title ||
          _body.text.trim() != e.content ||
          _tags.text.trim() != e.tags.join(', ');
    }
    return _title.text.trim().isNotEmpty || _body.text.trim().isNotEmpty || _tags.text.trim().isNotEmpty;
  }

  Future<void> _submit() async {
    if (_sending) return;
    final editing = widget.editing;
    final errors = newPostErrors(
      // An edited post keeps its category, even one the list does not show.
      categoryId: editing != null ? 'kept' : _categoryId,
      title: _title.text,
      body: _body.text,
      tags: _tags.text,
    );
    if ([errors.category, errors.title, errors.body, errors.tags].any((e) => e != null)) {
      setState(() => _showErrors = true);
      return;
    }
    setState(() => _sending = true);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final locale = context.appLocale;
    if (editing != null) {
      try {
        final updated = await ref.read(forumApiProvider).updatePost(
              editing.id,
              title: _title.text.trim(),
              content: _body.text.trim(),
              tags: parseForumTags(_tags.text),
            );
        if (!mounted) return;
        messenger.showSnackBar(SnackBar(content: Text(translate('Discussion updated', locale))));
        _title.text = updated.title;
        _body.text = updated.content;
        _tags.text = updated.tags.join(', ');
        router.pop(updated);
      } on Object catch (e) {
        messenger.showSnackBar(SnackBar(
          content: Text(translate(
            isConnectionFailure(e) ? failureMessageKey(e) : 'Could not update this discussion.',
            locale,
          )),
        ));
      } finally {
        if (mounted) setState(() => _sending = false);
      }
      return;
    }
    try {
      final created = await ref.read(forumApiProvider).create(
            type: _type,
            categoryId: _categoryId!,
            title: _title.text.trim(),
            content: _body.text.trim(),
            tags: parseForumTags(_tags.text),
            researchCommunityId: widget.communityId,
          );
      if (!mounted) return;
      _title.clear();
      _body.clear();
      _tags.clear();
      router.pop(created);
    } on Object catch (e) {
      final status = failureStatus(e);
      messenger.showSnackBar(SnackBar(
        content: Text(translate(
          status == 409
              ? 'You already posted this discussion recently'
              : status == 403 && widget.communityId != null
                  ? 'Verify your email to start discussions in communities'
                  : failureMessageKey(e),
          locale,
        )),
      ));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<bool> _confirmDiscard() async {
    final ok = await showLumiConfirmSheet(
      context,
      title: context.t('Discard this discussion?'),
      message: context.t('What you wrote will be lost.'),
      confirmText: context.t('Discard'),
      cancelText: context.t('Keep editing'),
      destructive: true,
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.editing;
    final categories = ref.watch(forumCategoriesProvider);
    final active = [for (final c in categories.value ?? const <ForumCategory>[]) if (c.active) c];
    if (_categoryId == null && active.length == 1) _categoryId = active.single.id;
    final verified = ref.watch(currentUserProvider)?.emailVerifiedAt != null;
    final blocked = editing == null && widget.communityId != null && !verified;
    final errors = _showErrors
        ? newPostErrors(
            categoryId: editing != null ? 'kept' : _categoryId,
            title: _title.text,
            body: _body.text,
            tags: _tags.text,
          )
        : (category: null, title: null, body: null, tags: null);

    return PopScope(
      canPop: !_dirty || _sending,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        if (await _confirmDiscard() && mounted) {
          _title.clear();
          _body.clear();
          _tags.clear();
          navigator.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text(editing != null ? context.t('Edit discussion') : context.t('New discussion'))),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              if (widget.communityName != null) ...[
                Text(
                  context.t('Posting in {{name}}', {'name': widget.communityName}),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary),
                ),
                const SizedBox(height: 12),
              ],
              if (blocked) ...[
                LumiCard(child: Text(context.t('Verify your email to start discussions in communities'))),
                const SizedBox(height: 12),
              ],
              if (editing != null)
                Text(
                  [context.t(forumTypeLabel(editing.type)), ?editing.category?.name].join(' · '),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary),
                )
              else
                LumiSegmentedTabs<String>(
                  options: [('QUESTION', context.t('Question')), ('DISCUSSION', context.t('Discussion'))],
                  selected: _type,
                  enabled: !_sending,
                  onChanged: (v) => setState(() => _type = v),
                ),
              const SizedBox(height: 16),
              if (editing != null)
                const SizedBox.shrink()
              else if (categories.hasError)
                LumiErrorState(
                  inline: true,
                  message: context.t('Could not load categories.'),
                  onRetry: () => ref.invalidate(forumCategoriesProvider),
                )
              else ...[
                // Label above the field, like every LumiTextField.
                Text.rich(
                  TextSpan(
                    text: context.t('Category'),
                    children: [TextSpan(text: ' *', style: TextStyle(color: context.lumi.error), semanticsLabel: '')],
                  ),
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(color: context.lumi.foreground),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _categoryId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    hintText: context.t('Choose a category.'),
                    errorText: errors.category == null ? null : context.t(errors.category!),
                  ),
                  items: [
                    for (final c in active) DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: _sending ? null : (v) => setState(() => _categoryId = v),
                ),
              ],
              const SizedBox(height: 16),
              LumiTextField(
                label: context.t('Title'),
                isRequired: true,
                controller: _title,
                maxLength: forumTitleMax,
                enabled: !_sending,
                errorText: errors.title == null ? null : context.t(errors.title!),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              LumiTextField(
                label: context.t('Body'),
                isRequired: true,
                controller: _body,
                maxLines: 10,
                maxLength: forumBodyMax,
                enabled: !_sending,
                errorText: errors.body == null ? null : context.t(errors.body!),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              LumiTextField(
                label: context.t('Tags'),
                controller: _tags,
                enabled: !_sending,
                helperText: context.t('Separate tags with commas'),
                errorText: errors.tags == null ? null : context.t(errors.tags!),
                onChanged: (_) => setState(() {}),
              ),
              if (editing == null) ...[
                const SizedBox(height: 8),
                Text(
                  context.t('Paper and research gap discussions are started on the web, where you can link the paper or gap.'),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.lumi.foregroundSecondary),
                ),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _sending || blocked ? null : () => unawaited(_submit()),
                child: Text(_sending
                    ? context.t('Posting…')
                    : editing != null
                        ? context.t('Save changes')
                        : context.t('Start discussion')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
