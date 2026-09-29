import { RegisterForm } from "@/features/auth";
import { safeInternalReturnTo } from "@/features/auth/utils/auth-return";
import { useSearchParams } from "react-router-dom";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = safeInternalReturnTo(searchParams.get("returnTo"));
  const invitationToken = redirectTo?.match(/^\/invitations\/([A-Za-z0-9_-]{32,256})$/)?.[1];
  return <RegisterForm redirectTo={redirectTo} invitationToken={invitationToken} />;
}
