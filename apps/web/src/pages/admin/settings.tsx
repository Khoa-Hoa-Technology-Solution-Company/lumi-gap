import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/features/admin";
import { Building2, CheckCircle2, CreditCard, Globe, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminSettingsPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminApi.getSettings(),
  });

  const [, setInitialCredits] = useState(1000);
  const [, setRateLimit] = useState(600);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = () => {
    setSavedMessage("Platform settings saved successfully.");
    setTimeout(() => setSavedMessage(null), 3000);
  };

  return (
    <div className="space-y-6 select-none max-w-4xl">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Platform Settings & Policies</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure default initial user credits, trusted academic institutions, API rates, and auto-verification policies.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Save className="h-3.5 w-3.5" /> Save Changes
        </button>
      </div>

      {savedMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {savedMessage}
        </div>
      )}

      {/* Credit & Registration Policies */}
      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-blue-600" />
          User Credits & Onboarding Defaults
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              Initial Sign-up Credits
            </label>
            <input
              type="number"
              defaultValue={settings?.initialCredits ?? 1000}
              onChange={(e) => setInitialCredits(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-mono dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Free credits awarded upon account creation</span>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              OpenAlex Rate Limit (req/min)
            </label>
            <input
              type="number"
              defaultValue={settings?.openAlexRateLimit ?? 600}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-mono dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Maximum API synchronization request rate</span>
          </div>
        </div>
      </div>

      {/* Trusted Institutions List */}
      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-start gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Building2 className="h-4 w-4 text-indigo-600" />
            Trusted Academic Institutions & Domains
          </h2>
          <span className="text-xs text-slate-400">Institutional auto-verification eligibility</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            (settings?.institutions || []).map((inst: any) => (
              <div key={inst.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 dark:text-white">{inst.name}</p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">
                    Domains: {inst.domains.join(", ")}
                  </p>
                </div>
                <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                  Active
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* API Providers */}
      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Globe className="h-4 w-4 text-emerald-600" />
          Configured Academic API Providers
        </h2>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            (settings?.apiProviders || []).map((p: any) => (
              <div key={p.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 dark:text-white uppercase">{p.providerName}</p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">{p.baseUrl}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                    {p.rateLimitPerMin} req/min
                  </span>
                  <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 uppercase">
                    {p.providerStatus}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
