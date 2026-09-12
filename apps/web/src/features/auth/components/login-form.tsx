import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import logoImage from "@/assets/logo.png";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { API_BASE_URL } from "@/services/api-client";
import { loginSchema, useLogin, type LoginFormValues } from "@/features/auth";

interface LoginFormProps {
  redirectTo?: string;
}

interface LocationState {
  from?: { pathname: string };
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginFormValues) => {
    login.mutate(values, {
      onSuccess: (data) => {
        toast.success(`Welcome back, ${data.user.fullName}`);
        const target =
          redirectTo ?? (location.state as LocationState | null)?.from?.pathname ?? "/home";
        navigate(target, { replace: true });
      },
      onError: (err) => {
        const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
        toast.error(axiosErr?.response?.data?.error?.message ?? "Login failed");
      },
    });
  };

  return (
    <div className="flex flex-col items-center w-full text-slate-900 dark:text-white">
      <img
        src={logoImage}
        alt="LiemResearch logo"
        className="mb-6 h-24 w-auto max-w-[220px] object-contain sm:h-28"
      />

      <div className="mb-6 space-y-2 text-center w-full">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">Welcome back!</h1>
      </div>

      <Button
        variant="outline"
        className="w-full rounded-xl bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] hover:bg-slate-50 dark:hover:bg-[#333] text-slate-900 dark:text-white h-12 font-bold shadow-sm"
        type="button"
        onClick={() => {
          window.location.href = `${API_BASE_URL}/auth/google`;
        }}
      >
        <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Google
      </Button>

      <div className="relative my-8 w-full">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-300 dark:border-white/20" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-50 dark:bg-black px-3 text-slate-400 dark:text-muted-foreground rounded-full">
            Or continue with email
          </span>
        </div>
      </div>

      <div className="w-full rounded-3xl border border-slate-200 dark:border-[#333] bg-slate-50/95 dark:bg-[#222222]/95 backdrop-blur-3xl p-6 sm:p-8 shadow-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-5">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold text-slate-900 dark:text-white">Email <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <Input
                      className="rounded-xl h-12 bg-white dark:bg-[#2a2a2a] border-slate-300 dark:border-[#3a3a3a] text-slate-900 dark:text-gray-100 focus-visible:ring-[#42bdf5] placeholder:text-slate-400 dark:placeholder:text-gray-500 shadow-sm"
                      type="text"
                      autoComplete="username"
                      placeholder="example@gmail.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold text-slate-900 dark:text-white">Password <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        className="rounded-xl h-12 bg-white dark:bg-[#2a2a2a] border-slate-300 dark:border-[#3a3a3a] text-slate-900 dark:text-gray-100 focus-visible:ring-[#42bdf5] pr-10 placeholder:text-slate-400 dark:placeholder:text-gray-500 shadow-sm"
                        type="password"
                        autoComplete="current-password"
                        placeholder="********"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex w-full justify-end pt-1">
              <Link to="/forgot-password" className="text-sm text-[#42bdf5] hover:text-[#20a5e3] transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" className="w-full rounded-xl h-12 mt-2 bg-[#1da1f2] hover:bg-[#1a91da] text-white text-base font-bold shadow-md" disabled={login.isPending}>
              {login.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>
        </Form>
      </div>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-gray-400">
        Don&apos;t have an account?{" "}
        <Link to="/register" className="font-bold text-[#42bdf5] hover:text-[#20a5e3] transition-colors">
          Register
        </Link>
      </p>
    </div>
  );
}
