import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authApi } from "@/features/auth/api/auth.api";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      toast.error("Google login failed");
      navigate("/login", { replace: true });
      return;
    }

    if (code) {
      hasProcessed.current = true;
      authApi.exchangeOAuthCode(code)
        .then(({ user, tokens }) => {
          setAuth({ user, tokens });
          toast.success(`Welcome back, ${user.fullName}`);
          navigate("/home", { replace: true });
        })
        .catch(() => {
          toast.error("Google login link expired or was already used");
          navigate("/login", { replace: true });
        });
    } else {
      navigate("/login", { replace: true });
    }
  }, [searchParams, navigate, setAuth]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-500">Completing login...</p>
      </div>
    </div>
  );
}
