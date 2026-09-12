import 'package:flutter/material.dart';
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
        const SnackBar(content: Text('Please enter your email and password.')),
      );
      return;
    }

    if (_isRegisterTab) {
      final name = _fullNameController.text.trim();
      if (name.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please enter your full name.')),
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
              SnackBar(content: Text(errorMsg), backgroundColor: Colors.red),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Registration successful. Please sign in.'),
                backgroundColor: Color(0xFF10B981),
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
            SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
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
            SnackBar(content: Text(errorMsg), backgroundColor: Colors.red),
          );
        } else if (state.value != null) {
          context.go('/');
        }
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final bgColor = isDark ? const Color(0xFF0F1B2D) : theme.scaffoldBackgroundColor;
    final cardBg = isDark ? const Color(0xFF111C2E).withValues(alpha: 0.95) : theme.cardColor;
    final borderColor = isDark ? const Color(0xFF26334A) : const Color(0xFFE2E8F0);
    final inputBg = isDark ? const Color(0xFF0F1B2D) : Colors.white;
    final tabBg = isDark ? const Color(0xFF1A2332) : const Color(0xFFF1F5F9);
    final activeTabColor = _isRegisterTab
        ? (isDark ? const Color(0xFF26334A) : const Color(0xFF334155))
        : const Color(0xFF06B6D4);

    return Scaffold(
      backgroundColor: bgColor,
      body: Stack(
        children: [
          // Background accents blurs
          Positioned(
            top: -80,
            right: -96,
            child: Container(
              width: 256,
              height: 256,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF06B6D4).withValues(alpha: 0.20),
              ),
            ),
          ),
          Positioned(
            bottom: -64,
            left: -80,
            child: Container(
              width: 208,
              height: 208,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF1D4ED8).withValues(alpha: 0.25),
              ),
            ),
          ),

          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
                child: Column(
                  children: [
                    // Header Logo
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: const Color(0xFF0B2B45),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFF0E7490)),
                      ),
                      child: const Icon(Icons.analytics, size: 30, color: Color(0xFF06B6D4)),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Publication Trend',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        letterSpacing: -0.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'AI-powered research discovery',
                      style: TextStyle(
                        fontSize: 14,
                        color: Color(0xFF94A3B8),
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),

                    // Card Form Container
                    Container(
                      decoration: BoxDecoration(
                        color: cardBg,
                        border: Border.all(color: borderColor),
                        borderRadius: BorderRadius.circular(24),
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Tab Bar switcher
                          Container(
                            decoration: BoxDecoration(
                              color: tabBg,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.all(4),
                            child: Row(
                              children: [
                                Expanded(
                                  child: GestureDetector(
                                    onTap: isLoading ? null : () => setState(() => _isRegisterTab = false),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      decoration: BoxDecoration(
                                        color: !_isRegisterTab ? const Color(0xFF06B6D4) : Colors.transparent,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      alignment: Alignment.center,
                                      child: Text(
                                        'Sign in',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 14,
                                          color: !_isRegisterTab ? Colors.white : const Color(0xFF94A3B8),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                Expanded(
                                  child: GestureDetector(
                                    onTap: isLoading ? null : () => setState(() => _isRegisterTab = true),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      decoration: BoxDecoration(
                                        color: _isRegisterTab ? activeTabColor : Colors.transparent,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      alignment: Alignment.center,
                                      child: Text(
                                        'Create account',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 14,
                                          color: _isRegisterTab ? Colors.white : const Color(0xFF94A3B8),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Full Name input field (only in Register)
                          if (_isRegisterTab) ...[
                            const Text(
                              'Full name',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8)),
                            ),
                            const SizedBox(height: 8),
                            Container(
                              height: 48,
                              decoration: BoxDecoration(
                                color: inputBg,
                                border: Border.all(color: borderColor),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Row(
                                children: [
                                  const Icon(Icons.person_outline, size: 18, color: Color(0xFF64748B)),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: TextField(
                                      controller: _fullNameController,
                                      style: const TextStyle(fontSize: 14),
                                      enabled: !isLoading,
                                      decoration: const InputDecoration.collapsed(
                                        hintText: 'Hoang Long Anh',
                                        hintStyle: TextStyle(color: Color(0xFF64748B)),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],

                          // Email input field
                          const Text(
                            'Email address',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8)),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            height: 48,
                            decoration: BoxDecoration(
                              color: inputBg,
                              border: Border.all(color: borderColor),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Row(
                              children: [
                                const Icon(Icons.mail_outline, size: 18, color: Color(0xFF64748B)),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: TextField(
                                    controller: _emailController,
                                    keyboardType: TextInputType.emailAddress,
                                    style: const TextStyle(fontSize: 14),
                                    enabled: !isLoading,
                                    decoration: const InputDecoration.collapsed(
                                      hintText: 'researcher@university.edu',
                                      hintStyle: TextStyle(color: Color(0xFF64748B)),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),

                          // Password input field
                          const Text(
                            'Password',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8)),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            height: 48,
                            decoration: BoxDecoration(
                              color: inputBg,
                              border: Border.all(color: borderColor),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Row(
                              children: [
                                const Icon(Icons.lock_outline, size: 18, color: Color(0xFF64748B)),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: TextField(
                                    controller: _passwordController,
                                    obscureText: !_showPassword,
                                    style: const TextStyle(fontSize: 14),
                                    enabled: !isLoading,
                                    decoration: const InputDecoration.collapsed(
                                      hintText: '••••••••',
                                      hintStyle: TextStyle(color: Color(0xFF64748B)),
                                    ),
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () => setState(() => _showPassword = !_showPassword),
                                  child: Icon(
                                    _showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                    size: 18,
                                    color: const Color(0xFF94A3B8),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          // Roles selector (only in Register)
                          if (_isRegisterTab) ...[
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                _RoleButton(
                                  role: UserRole.student,
                                  label: 'student',
                                  active: _selectedRole == UserRole.student,
                                  onTap: isLoading ? null : () => setState(() => _selectedRole = UserRole.student),
                                  borderColor: borderColor,
                                  isDark: isDark,
                                ),
                                const SizedBox(width: 8),
                                _RoleButton(
                                  role: UserRole.lecturer,
                                  label: 'lecturer',
                                  active: _selectedRole == UserRole.lecturer,
                                  onTap: isLoading ? null : () => setState(() => _selectedRole = UserRole.lecturer),
                                  borderColor: borderColor,
                                  isDark: isDark,
                                ),
                                const SizedBox(width: 8),
                                _RoleButton(
                                  role: UserRole.researcher,
                                  label: 'researcher',
                                  active: _selectedRole == UserRole.researcher,
                                  onTap: isLoading ? null : () => setState(() => _selectedRole = UserRole.researcher),
                                  borderColor: borderColor,
                                  isDark: isDark,
                                ),
                              ],
                            ),
                          ],

                          // Forgot password
                          if (!_isRegisterTab) ...[
                            const SizedBox(height: 12),
                            Align(
                              alignment: Alignment.centerRight,
                              child: GestureDetector(
                                onTap: () {},
                                child: const Text(
                                  'Forgot password?',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF06B6D4),
                                  ),
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 24),

                          // Submit Button
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton(
                              onPressed: isLoading ? null : _submit,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1D4ED8),
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: isLoading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          _isRegisterTab ? 'Create account' : 'Sign in',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 14,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        const Icon(Icons.arrow_forward, size: 16, color: Colors.white),
                                      ],
                                    ),
                            ),
                          ),
                          const SizedBox(height: 20),

                          // OR Divider
                          Row(
                            children: [
                              Expanded(
                                child: Container(
                                  height: 1,
                                  color: const Color(0xFF26334A),
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 16),
                                child: Text(
                                  'OR',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF64748B),
                                  ),
                                ),
                              ),
                              Expanded(
                                child: Container(
                                  height: 1,
                                  color: const Color(0xFF26334A),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),

                          // Google Auth Button
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: OutlinedButton(
                              onPressed: isLoading ? null : () {},
                              style: OutlinedButton.styleFrom(
                                side: BorderSide(color: borderColor),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                backgroundColor: inputBg,
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Container(
                                    width: 20,
                                    height: 20,
                                    decoration: const BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Color(0xFFF8FAFC),
                                    ),
                                    alignment: Alignment.center,
                                    child: const Text(
                                      'G',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF0F1B2D),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Text(
                                    'Continue with Google',
                                    style: TextStyle(
                                      fontSize: 14,
                                      color: isDark ? const Color(0xFFF8FAFC) : const Color(0xFF0F1B2D),
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 40),

                    // Footer terms and privacy
                    RichText(
                      textAlign: TextAlign.center,
                      text: const TextSpan(
                        style: TextStyle(
                          fontSize: 11,
                          height: 1.4,
                          color: Color(0xFF94A3B8),
                        ),
                        children: [
                          TextSpan(text: 'By continuing, you agree to our '),
                          TextSpan(
                            text: 'Terms of Service',
                            style: TextStyle(color: Color(0xFF06B6D4), fontWeight: FontWeight.bold),
                          ),
                          TextSpan(text: ' and '),
                          TextSpan(
                            text: 'Privacy Policy',
                            style: TextStyle(color: Color(0xFF06B6D4), fontWeight: FontWeight.bold),
                          ),
                          TextSpan(text: '.'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleButton extends StatelessWidget {
  const _RoleButton({
    required this.role,
    required this.label,
    required this.active,
    required this.borderColor,
    required this.isDark,
    this.onTap,
  });

  final UserRole role;
  final String label;
  final bool active;
  final VoidCallback? onTap;
  final Color borderColor;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final border = active
        ? const BorderSide(color: Color(0xFF06B6D4))
        : BorderSide(color: borderColor);
    final bg = active
        ? const Color(0xFF083344)
        : (isDark ? const Color(0xFF0F1B2D) : Colors.white);
    final textCol = active ? const Color(0xFF67E8F9) : const Color(0xFF94A3B8);

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            border: Border.fromBorderSide(border),
            borderRadius: BorderRadius.circular(20),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: textCol,
            ),
          ),
        ),
      ),
    );
  }
}
