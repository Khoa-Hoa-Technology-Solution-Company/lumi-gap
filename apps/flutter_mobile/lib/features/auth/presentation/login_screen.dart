import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.initialRegisterTab = false});

  final bool initialRegisterTab;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late bool _isRegisterTab;
  final _fullNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _showPassword = false;
  UserRole _selectedRole = UserRole.researcher;

  @override
  void initState() {
    super.initState();
    _isRegisterTab = widget.initialRegisterTab;
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('Please enter your email and password.'))),
      );
      return;
    }

    if (_isRegisterTab) {
      final name = _fullNameController.text.trim();
      if (name.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Please enter your full name.'))),
        );
        return;
      }

      try {
        await ref.read(authControllerProvider.notifier).register(
              email,
              password,
              name,
              _selectedRole,
            );

        if (mounted) {
          final state = ref.read(authControllerProvider);
          if (state.hasError) {
            final errorMsg = state.error.toString().replaceAll('ApiException: ', '');
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(errorMsg), backgroundColor: context.lumi.error),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.t('Registration successful. Please sign in.')),

              ),
            );
            setState(() {
              _isRegisterTab = false;
            });
          }
        }
      } on Object catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString()), backgroundColor: context.lumi.error),
          );
        }
      }
      return;
    }

    // Login flow
    try {
      await ref.read(authControllerProvider.notifier).login(email, password);
      if (mounted) {
        final state = ref.read(authControllerProvider);
        if (state.hasError) {
          final errorMsg = state.error.toString().replaceAll('ApiException: ', '');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(errorMsg), backgroundColor: context.lumi.error),
          );
        } else if (state.value != null) {
          context.go('/');
        }
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: context.lumi.error),
        );
      }
    }
  }

  Widget _label(BuildContext context, String text) {
    return Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: context.lumi.foreground,
          fontWeight: FontWeight.w600,
        ));
  }

  Widget _field({
    required BuildContext context,
    required TextEditingController controller,
    required IconData icon,
    required String hint,
    required bool enabled,
    TextInputType? keyboardType,
    bool obscure = false,
    Widget? trailing,
  }) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: lumi.surface,
        border: Border.all(color: lumi.line),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.only(left: 12),
      child: Row(
        children: [
          Icon(icon, size: 20, color: lumi.muted),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: controller,
              keyboardType: keyboardType,
              obscureText: obscure,
              style: theme.textTheme.bodyLarge,
              enabled: enabled,
              decoration: InputDecoration.collapsed(
                hintText: hint,
                hintStyle: theme.textTheme.bodyLarge?.copyWith(color: lumi.muted),
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }

  Widget _tab(BuildContext context, String label, bool active, VoidCallback? onTap) {
    final lumi = context.lumi;
    return Expanded(
      child: Semantics(
        button: true,
        selected: active,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            decoration: BoxDecoration(
              color: active ? lumi.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: active ? lumi.onPrimary : lumi.foregroundSecondary,
                  ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading;
    final theme = Theme.of(context);
    final lumi = context.lumi;

    return Scaffold(
      backgroundColor: lumi.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
            child: Column(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: lumi.primarySoft,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: lumi.line),
                  ),
                  child: Icon(Icons.analytics, size: 32, color: lumi.primary),
                ),
                const SizedBox(height: 16),
                Text(
                  context.t('Publication Trend'),
                  style: theme.textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  context.t('AI-powered research discovery'),
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: lumi.foregroundSecondary),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                Container(
                  decoration: BoxDecoration(
                    color: lumi.surface,
                    border: Border.all(color: lumi.line),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          color: lumi.surfaceMuted,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        padding: const EdgeInsets.all(4),
                        child: Row(
                          children: [
                            _tab(context, context.t('Sign in'), !_isRegisterTab,
                                isLoading ? null : () => setState(() => _isRegisterTab = false)),
                            _tab(context, context.t('Create account'), _isRegisterTab,
                                isLoading ? null : () => setState(() => _isRegisterTab = true)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      if (_isRegisterTab) ...[
                        _label(context, context.t('Full name')),
                        const SizedBox(height: 8),
                        _field(
                          context: context,
                          controller: _fullNameController,
                          icon: Icons.person_outline,
                          hint: context.t('Hoang Long Anh'),
                          enabled: !isLoading,
                        ),
                        const SizedBox(height: 16),
                      ],
                      _label(context, context.t('Email address')),
                      const SizedBox(height: 8),
                      _field(
                        context: context,
                        controller: _emailController,
                        icon: Icons.mail_outline,
                        hint: context.t('researcher@university.edu'),
                        keyboardType: TextInputType.emailAddress,
                        enabled: !isLoading,
                      ),
                      const SizedBox(height: 16),
                      _label(context, context.t('Password')),
                      const SizedBox(height: 8),
                      _field(
                        context: context,
                        controller: _passwordController,
                        icon: Icons.lock_outline,
                        hint: '••••••••',
                        obscure: !_showPassword,
                        enabled: !isLoading,
                        trailing: IconButton(
                          tooltip: _showPassword ? context.t('Hide password') : context.t('Show password'),
                          onPressed: () => setState(() => _showPassword = !_showPassword),
                          icon: Icon(
                            _showPassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            size: 20,
                            color: lumi.muted,
                          ),
                        ),
                      ),
                      if (_isRegisterTab) ...[
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            for (final entry in [
                              (UserRole.student, 'student'),
                              (UserRole.lecturer, 'lecturer'),
                              (UserRole.researcher, 'researcher'),
                            ]) ...[
                              _RoleButton(
                                label: entry.$2,
                                active: _selectedRole == entry.$1,
                                onTap: isLoading
                                    ? null
                                    : () => setState(() => _selectedRole = entry.$1),
                              ),
                              if (entry.$1 != UserRole.researcher)
                                const SizedBox(width: 8),
                            ],
                          ],
                        ),
                      ],
                      if (!_isRegisterTab) ...[
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: isLoading
                                ? null
                                : () => unawaited(
                                      context.push(
                                        Uri(
                                          path: '/forgot-password',
                                          queryParameters: {
                                            if (_emailController.text
                                                .trim()
                                                .isNotEmpty)
                                              'email':
                                                  _emailController.text.trim(),
                                          },
                                        ).toString(),
                                      ),
                                    ),
                            child: Text(context.t('Forgot password?')),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: isLoading ? null : _submit,
                          child: isLoading
                              ? SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: lumi.foregroundSecondary,
                                  ),
                                )
                              : Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(_isRegisterTab ? context.t('Create account') : context.t('Sign in')),
                                    const SizedBox(width: 8),
                                    const Icon(Icons.arrow_forward, size: 18),
                                  ],
                                ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(child: Divider(color: lumi.line)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Text(
                              context.t('OR'),
                              style: theme.textTheme.labelMedium
                                  ?.copyWith(color: lumi.muted),
                            ),
                          ),
                          Expanded(child: Divider(color: lumi.line)),
                        ],
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: isLoading ? null : () {},
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 20,
                                height: 20,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: lumi.surfaceMuted,
                                ),
                                alignment: Alignment.center,
                                child: Text( // i18n-ignore: Google logo letter
                                  'G',
                                  style: theme.textTheme.labelMedium
                                      ?.copyWith(color: lumi.foreground),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Text(context.t('Continue with Google')),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: lumi.foregroundSecondary),
                    children: [
                      TextSpan(text: context.t('By continuing, you agree to our ')),
                      TextSpan(
                        text: context.t('Terms of Service'),
                        style: TextStyle(color: lumi.primary, fontWeight: FontWeight.w600),
                      ),
                      TextSpan(text: context.t(' and ')),
                      TextSpan(
                        text: context.t('Privacy Policy'),
                        style: TextStyle(color: lumi.primary, fontWeight: FontWeight.w600),
                      ),
                      const TextSpan(text: '.'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoleButton extends StatelessWidget {
  const _RoleButton({
    required this.label,
    required this.active,
    this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Expanded(
      child: Semantics(
        button: true,
        selected: active,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            decoration: BoxDecoration(
              color: active ? lumi.primarySoft : lumi.surface,
              border: Border.all(color: active ? lumi.primary : lumi.line),
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: active ? lumi.primary : lumi.foregroundSecondary,
                  ),
            ),
          ),
        ),
      ),
    );
  }
}
