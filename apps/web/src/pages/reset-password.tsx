import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/features/auth";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const token = params.get("token");
    if (!token) return setMessage("The reset link is missing a token.");
    try {
      await authApi.resetPassword(token, password);
      navigate("/login", { replace: true });
    } catch { setMessage("The reset link is invalid, expired, or the password is too weak."); }
  };
  return <form onSubmit={submit} className="w-full rounded-3xl border bg-white p-8 shadow-xl dark:bg-[#18181b]">
    <h1 className="text-3xl font-black">Choose a new password</h1>
    <p className="mt-2 text-sm text-slate-500">Use at least 10 characters with uppercase, lowercase, and a number.</p>
    <Input className="mt-6" type="password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} />
    <Button className="mt-4 w-full" type="submit">Update password</Button>
    {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
  </form>;
}
