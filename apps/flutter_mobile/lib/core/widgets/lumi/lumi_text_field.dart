import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// Form field with its label above the box. The box is drawn once, by the
/// app-wide `inputDecorationTheme` (one border, focus and error colours);
/// icons go in `prefixIcon` / `suffixIcon` rather than in a wrapper, which is
/// what used to produce a box inside a box.
///
/// With [isPassword] the text is hidden and a 48dp button shows or hides it.
class LumiTextField extends StatefulWidget {
  const LumiTextField({
    required this.label,
    this.controller,
    this.focusNode,
    this.hintText,
    this.helperText,
    this.errorText,
    this.validator,
    this.isRequired = false,
    this.enabled = true,
    this.isPassword = false,
    this.prefixIcon,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.autocorrect = true,
    this.enableSuggestions = true,
    this.autovalidateMode,
    this.minLines,
    this.maxLines = 1,
    this.onChanged,
    this.onFieldSubmitted,
    super.key,
  }) : assert(
          !isPassword || maxLines == 1,
          'A password field is always a single line',
        );

  final String label;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String? hintText;
  final String? helperText;

  /// Error decided outside the validator (for example by the server). Shown
  /// instead of the validator message while it is not null.
  final String? errorText;
  final FormFieldValidator<String>? validator;
  final bool isRequired;
  final bool enabled;
  final bool isPassword;
  final IconData? prefixIcon;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;
  final bool autocorrect;
  final bool enableSuggestions;
  final AutovalidateMode? autovalidateMode;

  /// More than one line makes a text area (description, notes).
  final int? minLines;
  final int? maxLines;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onFieldSubmitted;

  @override
  State<LumiTextField> createState() => _LumiTextFieldState();
}

class _LumiTextFieldState extends State<LumiTextField> {
  bool _hidden = true;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final obscure = widget.isPassword && _hidden;

    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text.rich(
            TextSpan(
              text: widget.label,
              children: [
                if (widget.isRequired)
                  TextSpan(
                    text: ' *',
                    style: TextStyle(color: lumi.error),
                    semanticsLabel: '',
                  ),
              ],
            ),
            style: theme.textTheme.labelLarge?.copyWith(color: lumi.foreground),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: widget.controller,
            focusNode: widget.focusNode,
            enabled: widget.enabled,
            obscureText: obscure,
            minLines: widget.isPassword ? null : widget.minLines,
            maxLines: widget.isPassword ? 1 : widget.maxLines,
            keyboardType: widget.keyboardType,
            textInputAction: widget.textInputAction,
            textCapitalization: widget.textCapitalization,
            autofillHints: widget.enabled ? widget.autofillHints : null,
            // A hidden password must never be offered to the keyboard
            // dictionary or autocorrected.
            autocorrect: !widget.isPassword && widget.autocorrect,
            enableSuggestions: !widget.isPassword && widget.enableSuggestions,
            autovalidateMode: widget.autovalidateMode,
            validator: widget.validator,
            forceErrorText: widget.errorText,
            onChanged: widget.onChanged,
            onFieldSubmitted: widget.onFieldSubmitted,
            style: theme.textTheme.bodyLarge,
            decoration: InputDecoration(
              hintText: widget.hintText,
              helperText: widget.helperText,
              helperMaxLines: 3,
              errorMaxLines: 3,
              helperStyle: theme.textTheme.bodySmall
                  ?.copyWith(color: lumi.foregroundSecondary),
              prefixIcon: widget.prefixIcon == null
                  ? null
                  : Icon(widget.prefixIcon, size: 20),
              suffixIcon: widget.isPassword
                  ? IconButton(
                      tooltip: _hidden
                          ? context.t('Show password')
                          : context.t('Hide password'),
                      onPressed: () => setState(() => _hidden = !_hidden),
                      icon: Icon(
                        _hidden
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        size: 20,
                      ),
                    )
                  : null,
            ),
          ),
        ],
      ),
    );
  }
}

/// Decoration for a text field that sits inside a box the screen draws itself
/// (a search bar, a composer). `InputDecoration.collapsed` alone is not
/// enough: the app's `inputDecorationTheme` still fills it and draws its
/// enabled/focused borders, which shows as a second box inside the first.
InputDecoration bareInputDecoration({
  String? hintText,
  TextStyle? hintStyle,
}) =>
    InputDecoration.collapsed(hintText: hintText, hintStyle: hintStyle)
        .copyWith(
      filled: false,
      enabledBorder: InputBorder.none,
      focusedBorder: InputBorder.none,
      disabledBorder: InputBorder.none,
      errorBorder: InputBorder.none,
      focusedErrorBorder: InputBorder.none,
    );
