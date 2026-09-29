import { LoginForm } from "@/features/auth";
import { safeInternalReturnTo } from "@/features/auth/utils/auth-return";
import { useSearchParams } from "react-router-dom";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  return <LoginForm redirectTo={safeInternalReturnTo(searchParams.get("returnTo"))} />;
}
