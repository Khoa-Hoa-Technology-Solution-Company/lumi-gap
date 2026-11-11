import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';

class ConfirmDialog extends StatelessWidget {

  const ConfirmDialog({
    required this.title,
    required this.message,
    required this.onConfirm,
    super.key,
    this.confirmText,
    this.cancelText,
    this.isDestructive = false,
  });
  final String title;
  final String message;
  /// Defaults to "Confirm" / "Cancel" in the current language.
  final String? confirmText;
  final String? cancelText;
  final bool isDestructive;
  final VoidCallback onConfirm;

  static Future<bool?> show(
    BuildContext context, {
    required String title,
    required String message,
    String? confirmText,
    String? cancelText,
    bool isDestructive = false,
  }) {
    return showDialog<bool>(
      context: context,
      builder: (context) => ConfirmDialog(
        title: title,
        message: message,
        confirmText: confirmText,
        cancelText: cancelText,
        isDestructive: isDestructive,
        onConfirm: () => Navigator.of(context).pop(true),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      content: Text(message),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(cancelText ?? context.t('Cancel')),
        ),
        FilledButton(
          onPressed: onConfirm,
          style: isDestructive
              ? FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                  foregroundColor: Theme.of(context).colorScheme.onError,
                )
              : null,
          child: Text(confirmText ?? context.t('Confirm')),
        ),
      ],
    );
  }
}
