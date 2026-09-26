import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/features/auth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await authApi.forgotPassword(email).catch(() => undefined);
    setMessage("If an active account exists, a reset link has been sent.");
  };
  return <form onSubmit={submit} className="w-full rounded-3xl border bg-white p-8 shadow-xl dark:bg-[#18181b]">
    <h1 className="text-3xl font-black">Reset password</h1>
    <p className="mt-2 text-sm text-slate-500">Enter your account email. The response is intentionally the same for every address.</p>
    <Input className="mt-6" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
    <Button className="mt-4 w-full" type="submit">Send reset link</Button>
    {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
  </form>;
}
