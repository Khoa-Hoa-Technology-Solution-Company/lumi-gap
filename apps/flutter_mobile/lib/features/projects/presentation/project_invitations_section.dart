import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/projects/data/invitations_api.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// "Project invitations" above the project list, as on the web
/// (projects-list.tsx). Shown only when there is at least one; a failed load
/// hides it, like the web, so the project list stays usable.
class ProjectInvitationsSection extends ConsumerStatefulWidget {
  const ProjectInvitationsSection({super.key});

  @override
  ConsumerState<ProjectInvitationsSection> createState() =>
      _ProjectInvitationsSectionState();
}

class _ProjectInvitationsSectionState
    extends ConsumerState<ProjectInvitationsSection> {
  /// Invitation being answered and how: one at a time, like the web.
  ({String id, bool accept})? _busy;

  Future<void> _respond(ProjectInvitation invitation, {required bool accept}) async {
    if (_busy != null) return;
    if (!accept && !await _confirmDecline(invitation)) return;
    if (!mounted) return;
    setState(() => _busy = (id: invitation.id, accept: accept));
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final locale = context.appLocale;
    try {
      await container.read(invitationsApiProvider).respond(invitation, accept: accept);
      container
        ..invalidate(myInvitationsProvider)
        ..invalidate(projectsProvider);
      messenger.showSnackBar(SnackBar(
        content: Text(translate(
          accept ? 'Invitation accepted. Opening project...' : 'Invitation declined',
          locale,
        )),
      ));
      if (accept) unawaited(router.push('/project/${invitation.projectId}'));
    } on Object catch (_) {
      // Expired, cancelled, archived project or another account: the web
      // says one thing for all of them and reloads the list.
      container.invalidate(myInvitationsProvider);
      messenger.showSnackBar(SnackBar(
        content: Text(translate(
          'This invitation is no longer available. It may have expired or been cancelled by the project owner.',
          locale,
        )),
      ));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<bool> _confirmDecline(ProjectInvitation invitation) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('Decline project invitation?')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(invitation.projectTitle, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 12),
            Text(context.t('This will remove the invitation from your pending list. You will need a new invitation if you want to join later.')),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.t('Keep invitation')),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: context.lumi.error),
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.t('Decline invitation')),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final invitations = ref.watch(myInvitationsProvider).value ?? const [];
    if (invitations.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Row(
              children: [
                Icon(Icons.mark_email_unread_outlined,
                    size: 20, color: context.lumi.foregroundSecondary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    context.t('Project invitations'),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                Text(
                  '${invitations.length}',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: context.lumi.foregroundSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          for (final invitation in invitations) ...[
            InvitationCard(
              invitation: invitation,
              busy: _busy?.id == invitation.id ? _busy!.accept : null,
              locked: _busy != null,
              onAccept: () => unawaited(_respond(invitation, accept: true)),
              onDecline: () => unawaited(_respond(invitation, accept: false)),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

/// One invitation with its two answers.
class InvitationCard extends StatelessWidget {
  const InvitationCard({
    required this.invitation,
    required this.busy,
    required this.locked,
    required this.onAccept,
    required this.onDecline,
    super.key,
  });

  final ProjectInvitation invitation;

  /// True while accepting this one, false while declining it, else null.
  final bool? busy;

  /// Another answer is being sent: no second request meanwhile.
  final bool locked;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary);
    final inviter = invitation.inviterName;
    final role = invitation.role == 'OWNER' ? context.t('Owner') : context.t('Member');
    final expires = invitation.expiresAt;
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LumiChip(label: context.t('Pending invitation'), tone: LumiChipTone.warning),
          const SizedBox(height: 8),
          Text(invitation.projectTitle, style: theme.textTheme.titleMedium),
          const SizedBox(height: 2),
          Text(
            '${inviter == null ? context.t('You were invited to collaborate') : context.t('{{name}} invited you to collaborate', {'name': inviter})} '
            '${context.t('as')} $role.',
            style: secondary,
          ),
          const SizedBox(height: 8),
          Text(
            invitation.message ??
                context.t('Accepting adds this project to your workspace. Declining removes the invitation from your list.'),
            style: theme.textTheme.bodyMedium,
          ),
          if (invitation.invitedEmail != null) ...[
            const SizedBox(height: 8),
            Text(
              '${context.t('Recipient email')}: ${invitation.invitedEmail}',
              style: secondary,
            ),
          ],
          if (expires != null)
            Text(
              '${context.t('Invite expires')}: ${formatShortDate(expires, context.appLocale)}',
              style: secondary,
            ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: locked ? null : onDecline,
                  child: Text(busy == false
                      ? context.t('Declining...')
                      : context.t('Decline')),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: locked ? null : onAccept,
                  child: Text(busy == true
                      ? context.t('Accepting...')
                      : context.t('Accept and open')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
