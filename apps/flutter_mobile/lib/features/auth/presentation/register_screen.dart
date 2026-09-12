import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/auth/presentation/login_screen.dart';

class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const LoginScreen(initialRegisterTab: true);
  }
}
