import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/haptics.dart';

/// Asks before an action, as a bottom sheet: title, message, then the action
/// (full width, on top, within thumb reach) and Cancel under it.
///
/// Returns true when confirmed, false when cancelled, and null when the sheet
/// is dismissed (drag down, tap outside, Android back). Callers treat
/// anything but `true` as "do nothing".
Future<bool?> showLumiConfirmSheet(
  BuildContext context, {
  required String title,
  required String message,
  String? confirmText,
  String? cancelText,
  bool destructive = false,
}) {
  return showModalBottomSheet<bool>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (context) => _SheetBody(
      title: title,
      message: message,
      actions: _SheetActions(
        confirmText: confirmText ?? context.t('Confirm'),
        cancelText: cancelText ?? context.t('Cancel'),
        destructive: destructive,
        onConfirm: () => Navigator.of(context).pop(true),
        onCancel: () => Navigator.of(context).pop(false),
      ),
    ),
  );
}

/// One text field in a [showLumiInputSheet].
class LumiSheetField {
  const LumiSheetField({
    required this.label,
    this.hint,
    this.initial = '',
    this.maxLength,
    this.minLines = 1,
    this.maxLines = 4,
    this.required = false,
    this.keyboardType,
    this.validator,
  });

  final String label;
  final String? hint;
  final String initial;
  final int? maxLength;
  final int minLines;
  final int maxLines;

  /// When true the action stays disabled while the trimmed text is empty.
  final bool required;
  final TextInputType? keyboardType;

  /// Message for a trimmed text that cannot be sent, or null when it can.
  /// The action stays disabled while it returns a message; the message is
  /// shown under the field once something has been typed.
  final String? Function(String text)? validator;
}

/// A confirm sheet with one text field (a reason, an edit). Returns the
/// trimmed text (possibly empty when the field is optional) or null when
/// cancelled or dismissed. The sheet rises with the keyboard.
Future<String?> showLumiInputSheet(
  BuildContext context, {
  required String title,
  required LumiSheetField field,
  String? message,
  String? confirmText,
  String? cancelText,
  bool destructive = false,
}) {
  return showModalBottomSheet<String>(
    // Over the bottom navigation bar, dimming it too.
    useRootNavigator: true,
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (context) => _InputSheet(
      title: title,
      message: message,
      field: field,
      confirmText: confirmText ?? context.t('Confirm'),
      cancelText: cancelText ?? context.t('Cancel'),
      destructive: destructive,
    ),
  );
}

class _InputSheet extends StatefulWidget {
  const _InputSheet({
    required this.title,
    required this.message,
    required this.field,
    required this.confirmText,
    required this.cancelText,
    required this.destructive,
  });

  final String title;
  final String? message;
  final LumiSheetField field;
  final String confirmText;
  final String cancelText;
  final bool destructive;

  @override
  State<_InputSheet> createState() => _InputSheetState();
}

class _InputSheetState extends State<_InputSheet> {
  late final TextEditingController _text =
      TextEditingController(text: widget.field.initial)
        ..addListener(_changed);

  void _changed() => setState(() {});

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.field;
    final text = _text.text.trim();
    final error = f.validator?.call(text);
    final canSubmit = (!f.required || text.isNotEmpty) && error == null;
    return _SheetBody(
      title: widget.title,
      message: widget.message,
      field: TextField(
        controller: _text,
        autofocus: true,
        maxLength: f.maxLength,
        minLines: f.minLines,
        maxLines: f.maxLines,
        keyboardType: f.keyboardType,
        textCapitalization: f.keyboardType == TextInputType.emailAddress
            ? TextCapitalization.none
            : TextCapitalization.sentences,
        decoration: InputDecoration(
          labelText: f.label,
          hintText: f.hint,
          alignLabelWithHint: true,
          // Only after typing: an empty field is not an error yet.
          errorText: text.isEmpty ? null : error,
        ),
      ),
      actions: _SheetActions(
        confirmText: widget.confirmText,
        cancelText: widget.cancelText,
        destructive: widget.destructive,
        onConfirm: canSubmit
            ? () => Navigator.of(context).pop(_text.text.trim())
            : null,
        onCancel: () => Navigator.of(context).pop(),
      ),
    );
  }
}

class _SheetBody extends StatelessWidget {
  const _SheetBody({
    required this.title,
    required this.actions,
    this.message,
    this.field,
  });

  final String title;
  final String? message;
  final Widget? field;
  final Widget actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Padding(
      // Rise with the keyboard so the field and the buttons stay visible.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: theme.textTheme.titleLarge),
            if (message != null && message!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: lumi.foregroundSecondary),
              ),
            ],
            if (field != null) ...[const SizedBox(height: 16), field!],
            const SizedBox(height: 20),
            actions,
          ],
        ),
      ),
    );
  }
}

class _SheetActions extends StatelessWidget {
  const _SheetActions({
    required this.confirmText,
    required this.cancelText,
    required this.destructive,
    required this.onConfirm,
    required this.onCancel,
  });

  final String confirmText;
  final String cancelText;
  final bool destructive;
  final VoidCallback? onConfirm;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final confirm = onConfirm;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            backgroundColor: destructive ? lumi.error : null,
            foregroundColor: destructive ? lumi.onError : null,
          ),
          onPressed: confirm == null
              ? null
              : () {
                  if (destructive) unawaited(Haptics.destructive());
                  confirm();
                },
          child: Text(confirmText),
        ),
        const SizedBox(height: 8),
        TextButton(
          style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          onPressed: onCancel,
          child: Text(cancelText),
        ),
      ],
    );
  }
}
