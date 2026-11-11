import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';

/// Under the tabs: "Đang kết nối lại…" while the live connection is being
/// restored, or why it was given up. Text plus an icon or spinner, never
/// colour alone.
class TeamChatConnectionBanner extends StatelessWidget {
  const TeamChatConnectionBanner({
    required this.connection,
    required this.stop,
    super.key,
  });

  final TeamChatConnection connection;
  final TeamChatStop? stop;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);

    if (stop != null) {
      final text = switch (stop!) {
        TeamChatStop.noAccess => context.t('You no longer have access to this conversation.'),
        TeamChatStop.unauthorized =>
          context.t('Your session has expired. Please sign in again.'),
      };
      return Semantics(
        liveRegion: true,
        container: true,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: lumi.surface,
            border: Border(bottom: BorderSide(color: lumi.error)),
          ),
          child: Row(
            children: [
              Icon(Icons.lock_outline, size: 20, color: lumi.error),
              const SizedBox(width: 8),
              Expanded(child: Text(text, style: theme.textTheme.bodyMedium)),
            ],
          ),
        ),
      );
    }

    if (connection != TeamChatConnection.reconnecting) {
      return const SizedBox.shrink();
    }
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        color: lumi.surfaceMuted,
        child: Row(
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: lumi.foregroundSecondary,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                context.t('Reconnecting…'),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: lumi.foregroundSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TeamChatSkeleton extends StatelessWidget {
  const TeamChatSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    Widget block(double widthFactor, {bool right = false}) => Align(
      alignment: right ? Alignment.centerRight : Alignment.centerLeft,
      child: FractionallySizedBox(
        widthFactor: widthFactor,
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color: lumi.surfaceMuted,
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
    );
    return Semantics(
      label: context.t('Loading'),
      container: true,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            block(0.6),
            const SizedBox(height: 12),
            block(0.45, right: true),
            const SizedBox(height: 12),
            block(0.7),
            const SizedBox(height: 12),
            block(0.5, right: true),
          ],
        ),
      ),
    );
  }
}

class TeamChatEmpty extends StatelessWidget {
  const TeamChatEmpty({super.key});

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: lumi.surfaceMuted,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.chat_bubble_outline,
                size: 28,
                color: lumi.foregroundSecondary,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              context.t('No messages yet. Start the conversation.'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TeamChatLoadError extends StatelessWidget {
  const TeamChatLoadError({required this.message, super.key, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 32, color: lumi.error),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: Text(context.t('Try again'))),
            ],
          ],
        ),
      ),
    );
  }
}

/// End of the (reversed) list: spinner while loading older messages, or a
/// retry button after a failure.
class TeamChatOlderRow extends StatelessWidget {
  const TeamChatOlderRow({
    required this.loading,
    required this.failed,
    required this.onRetry,
    super.key,
  });

  final bool loading;
  final bool failed;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    if (loading) {
      return Semantics(
        label: context.t('Loading older messages'),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: lumi.foregroundSecondary,
              ),
            ),
          ),
        ),
      );
    }
    if (failed) {
      return Center(
        child: TextButton(
          onPressed: onRetry,
          child: Text(context.t('Retry loading older messages')),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
