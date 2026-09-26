// Public API of the auth feature. Pages should import from here only —
// never reach into ./api or ./hooks directly from outside the feature.
export { authApi } from "./api/auth.api";
export {
  useLogin,
  useRegister,
  useLogout,
  useCurrentUser,
  useUpdateProfile,
  useUpdateAcademicProfile,
  useChangePassword,
} from "./hooks/use-auth";
export { requiresAcademicProfile } from "./utils/academic-profile";
export {
  ACADEMIC_ONBOARDING_PATH,
  EMAIL_VERIFICATION_PATH,
  ADMIN_LANDING_PATH,
  MEMBER_LANDING_PATH,
  resolvePostAuthPath,
} from "./utils/post-auth-redirect";
export {
  loginSchema,
  registerSchema,
  type LoginFormValues,
  type RegisterFormValues,
} from "./schemas/auth.schemas";
export { LoginForm } from "./components/login-form";
export { RegisterForm } from "./components/register-form";
