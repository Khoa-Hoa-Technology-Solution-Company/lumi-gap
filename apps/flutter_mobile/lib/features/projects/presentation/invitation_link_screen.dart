import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/projects/data/invitations_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

String invitationStatusLabel(String status) => switch (status) {
      'ACCEPTED' => tk('Accepted'),
      'DECLINED' => tk('Declined'),
      'CANCELLED' => tk('Cancelled'),
      'EXPIRED' => tk('Expired'),
      _ => tk('Pending'),
    };

/// What to tell the viewer about an invitation link, as on the web
/// (project-invitation.tsx). The app is always signed in.
String invitationLinkMessage(InvitationPreview p) {
  if (!p.emailMatches) {
    return tk('This invitation is for another verified identity. Use the account that received it, or verify your email in account settings.');
  }
  if (p.alreadyMember) return tk('You are already a member of this project.');
  if (p.status == 'PENDING') {
    return tk('Accept to join the project as a member. You can also decline.');
  }
  return tk('This invitation has already been handled or is no longer active. Ask the project owner for a new invitation if needed.');
}

/// An invitation opened from its email link (`/invitations/:token`).
class InvitationLinkScreen extends ConsumerStatefulWidget {
  const InvitationLinkScreen({required this.token, super.key});
  final String token;

  @override
  ConsumerState<InvitationLinkScreen> createState() => _InvitationLinkScreenState();
}

class _InvitationLinkScreenState extends ConsumerState<InvitationLinkScreen> {
  bool _busy = false;

  Future<void> _respond({required bool accept}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final locale = context.appLocale;
    try {
      await container.read(invitationsApiProvider).respondToken(widget.token, accept: accept);
      container
        ..invalidate(myInvitationsProvider)
        ..invalidate(projectsProvider);
      messenger.showSnackBar(SnackBar(
        content: Text(translate(accept ? 'Invitation accepted' : 'Invitation declined', locale)),
      ));
    } on Object catch (_) {
      messenger.showSnackBar(SnackBar(
        content: Text(translate('Could not update this invitation. Refresh its status and try again.', locale)),
      ));
    } finally {
      // The answer (or the reason it failed) shows in the reloaded status.
      container.invalidate(invitationPreviewProvider(widget.token));
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final preview = ref.watch(invitationPreviewProvider(widget.token));
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Project invitation'))),
      body: SafeArea(
        child: switch (preview) {
          AsyncValue(:final value?) => _body(context, value),
          AsyncValue(:final error?) => LumiEmptyState(
              icon: Icons.mail_outline,
              title: context.t('This invitation could not be opened'),
              message: context.t('Check your connection and use the latest invitation link. It may have been replaced or cancelled.'),
              actionLabel: preview.isLoading ? null : context.t('Try again'),
              onAction: () => ref.invalidate(invitationPreviewProvider(widget.token)),
              key: ValueKey(error),
            ),
          _ => const LumiPageSkeleton(rows: 2, height: 120),
        },
      ),
    );
  }

  Widget _body(BuildContext context, InvitationPreview p) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary);
    final showDetails = p.emailMatches;
    final expires = p.expiresAt;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Text(
          showDetails && p.projectTitle != null
              ? p.projectTitle!
              : context.t('Join a research project'),
          style: theme.textTheme.headlineSmall,
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            LumiChip(label: context.t(invitationStatusLabel(p.status))),
            if (expires != null)
              Text(
                '${context.t('Expires')}: ${formatShortDate(expires, context.appLocale)}',
                style: secondary,
              ),
          ],
        ),
        if (showDetails) ...[
          const SizedBox(height: 16),
          LumiCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (p.inviterName != null)
                  Text('${context.t('Invited by')}: ${p.inviterName}', style: theme.textTheme.bodyMedium),
                if (p.invitedEmail != null)
                  Text('${context.t('Recipient email')}: ${p.invitedEmail}', style: theme.textTheme.bodyMedium),
                Text('${context.t('Project role')}: ${context.t('Member')}', style: theme.textTheme.bodyMedium),
                if (p.message != null) ...[
                  const SizedBox(height: 8),
                  Text(p.message!, style: theme.textTheme.bodyMedium),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        Text(context.t(invitationLinkMessage(p)), style: secondary),
        const SizedBox(height: 20),
        ..._actions(context, p),
      ],
    );
  }

  List<Widget> _actions(BuildContext context, InvitationPreview p) {
    if (!p.emailMatches) {
      return [
        OutlinedButton(
          onPressed: _busy
              ? null
              : () => unawaited(ref.read(authControllerProvider.notifier).logout()),
          child: Text(context.t('Switch account')),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () => unawaited(context.push('/account')),
          child: Text(context.t('Account settings')),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => ref.invalidate(invitationPreviewProvider(widget.token)),
          child: Text(context.t('Check again')),
        ),
      ];
    }
    if (p.alreadyMember && p.projectId != null) {
      return [
        FilledButton.icon(
          onPressed: () => unawaited(context.push('/project/${p.projectId}')),
          icon: const Icon(Icons.check_circle_outline),
          label: Text(context.t('Open project')),
        ),
      ];
    }
    if (p.status == 'PENDING') {
      return [
        FilledButton(
          onPressed: _busy ? null : () => unawaited(_respond(accept: true)),
          child: Text(_busy ? context.t('Updating…') : context.t('Accept invitation')),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _busy ? null : () => unawaited(_respond(accept: false)),
          child: Text(context.t('Decline invitation')),
        ),
      ];
    }
    return [
      OutlinedButton(
        onPressed: () => context.go('/projects'),
        child: Text(context.t('Go to projects')),
      ),
    ];
  }
}
