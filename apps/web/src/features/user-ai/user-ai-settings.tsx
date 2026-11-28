import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Cpu,
  Info,
  KeyRound,
  Pencil,
  Plus,
  Server,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SkeletonList, SectionErrorState } from "@/components/loading";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import {
  SettingsFormField,
  SettingsPageHeader,
  SettingsSection,
} from "@/features/settings/components/settings-primitives";

type Provider = "gemini" | "openai-compatible";
type Connection = {
  id: string;
  name: string;
  provider: Provider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
};
type Model = { id: string; name: string };
type Settings = { connections: Connection[]; activeConnectionId: string | null };
type Draft = {
  connectionId?: string;
  name: string;
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
};

const DEFAULTS: Record<Provider, string> = {
  gemini: "https://generativelanguage.googleapis.com",
  "openai-compatible": "https://api.openai.com/v1",
};

const createDraft = (provider: Provider = "gemini"): Draft => ({
  name: "",
  provider,
  baseUrl: DEFAULTS[provider],
  apiKey: "",
  model: "",
});

function extractMessage(error: unknown) {
  return (
    (error as { response?: { data?: { error?: { message?: string } } }; message?: string })
      ?.response?.data?.error?.message ??
    "Could not complete this request. Please try again."
  );
}

export function UserAiSettings() {
  const userId = useAuthStore((state) => state.user?.id);
  return <UserAiSettingsForm key={userId} userId={userId} />;
}

function UserAiSettingsForm({ userId }: { userId?: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [dialogError, setDialogError] = useState("");
  const [dialogVerifiedCount, setDialogVerifiedCount] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);

  const queryKey = ["user-ai", userId];
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async () => (await api.get<{ data: Settings }>("/user-ai")).data.data,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const discover = useMutation({
    mutationFn: async (input: Draft) =>
      (
        await api.post<{ data: Model[] }>("/user-ai/models", {
          connectionId: input.connectionId,
          provider: input.provider,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey || undefined,
        })
      ).data.data,
  });

  const save = useMutation({
    mutationFn: async (input: Draft) =>
      api.post("/user-ai/connections", { ...input, apiKey: input.apiKey || undefined }),
  });

  const activate = useMutation({
    mutationFn: async (connectionId: string | null) =>
      api.put("/user-ai/active", { connectionId }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/user-ai/connections/${id}`),
  });

  const busy = discover.isPending || save.isPending || activate.isPending || remove.isPending;

  const openAddDialog = (provider: Provider = "gemini") => {
    setDraft(createDraft(provider));
    setModels([]);
    setDialogError("");
    setDialogVerifiedCount(null);
  };

  const openEditDialog = (connection: Connection) => {
    setDraft({
      connectionId: connection.id,
      name: connection.name,
      provider: connection.provider,
      baseUrl: connection.baseUrl,
      apiKey: "",
      model: connection.model,
    });
    setModels([]);
    setDialogError("");
    setDialogVerifiedCount(null);
  };

  const closeDialog = () => {
    if (discover.isPending || save.isPending) return;
    setDraft(null);
    setModels([]);
    setDialogError("");
    setDialogVerifiedCount(null);
  };

  const updateDraft = (field: keyof Draft, value: string) => {
    if (!draft) return;
    const next = { ...draft, [field]: value };
    if (field === "provider") next.baseUrl = DEFAULTS[value as Provider];
    if (["provider", "baseUrl", "apiKey"].includes(field)) {
      setModels([]);
      setDialogVerifiedCount(null);
      next.model = "";
    }
    setDraft(next);
    setDialogError("");
  };

  async function handleTestAndFetch() {
    if (!draft) return;
    setDialogError("");
    setDialogVerifiedCount(null);
    try {
      const result = await discover.mutateAsync(draft);
      setModels(result);
      setDialogVerifiedCount(result.length);
      setDraft({
        ...draft,
        model: result.some((model) => model.id === draft.model)
          ? draft.model
          : result[0]?.id ?? "",
      });
    } catch (err) {
      setModels([]);
      setDialogError(extractMessage(err));
    }
  }

  async function handleSaveConnection(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setDialogError("");
    try {
      await save.mutateAsync(draft);
      toast.success(t("Connection saved. Select Use as default to use it for your AI tasks."));
      setDraft(null);
      setModels([]);
      setDialogVerifiedCount(null);
      await refresh();
    } catch (err) {
      setDialogError(extractMessage(err));
    }
  }

  async function handleUseConnection(id: string | null) {
    try {
      await activate.mutateAsync(id);
      toast.success(
        id
          ? t("Your next AI tasks will use this connection.")
          : t("Your next AI tasks will use the platform AI connection."),
      );
      await refresh();
    } catch (err) {
      toast.error(extractMessage(err));
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success(t("Connection deleted."));
      if (draft?.connectionId === deleteTarget.id) setDraft(null);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      toast.error(extractMessage(err));
    }
  }

  const connections = query.data?.connections ?? [];
  const activeId = query.data?.activeConnectionId ?? null;

  return (
    <div data-no-i18n>
      <SettingsPageHeader
        title={t("settings.ai.title")}
        description={t("settings.ai.subtitle")}
        action={
          <Button size="sm" disabled={busy} onClick={() => openAddDialog("gemini")} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t("settings.ai.addConnection")}</span>
          </Button>
        }
      />

      {/* Platform credits vs Personal API Key distinction */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-border/80 bg-muted/25 px-4 py-3.5 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-foreground/90">{t("settings.ai.billingDistinction")}</p>
          <p>{t("settings.ai.platformScopeNote")}</p>
        </div>
      </div>

      {/* Platform AI Default Row */}
      <SettingsSection title={t("settings.ai.platformTitle")} description={t("settings.ai.platformDesc")}>
        <div className="flex flex-col gap-3 rounded-xl border border-border/85 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{t("settings.ai.platformTitle")}</p>
                {!activeId ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    {t("settings.ai.activeBadge")}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.ai.platformDesc")}</p>
            </div>
          </div>

          {activeId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={activate.isPending}
              onClick={() => void handleUseConnection(null)}
            >
              {t("settings.ai.usePlatform")}
            </Button>
          ) : null}
        </div>
      </SettingsSection>

      {/* Supported Providers Quick Connect */}
      <SettingsSection title={t("settings.ai.supportedProviders")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/80 bg-background p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground">
                <Cpu className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Google Gemini</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t("settings.ai.geminiDesc")}
                </p>
              </div>
            </div>
            <div>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openAddDialog("gemini")}>
                {t("settings.ai.connect")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/80 bg-background p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground">
                <Server className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">OpenAI-compatible</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t("settings.ai.openaiCompatDesc")}
                </p>
              </div>
            </div>
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => openAddDialog("openai-compatible")}
              >
                {t("settings.ai.connect")}
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Saved Personal Connections */}
      <SettingsSection title={t("settings.ai.savedConnections")}>
        {query.isLoading ? (
          <SkeletonList items={2} />
        ) : query.isError ? (
          <SectionErrorState compact error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : connections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("settings.ai.emptyConnections")}
          </p>
        ) : (
          <div className="divide-y divide-border/70 rounded-xl border border-border/85">
            {connections.map((connection) => {
              const isActive = activeId === connection.id;
              return (
                <article
                  key={connection.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{connection.name}</h3>
                      <Badge variant="outline" className="text-[11px] font-medium">
                        {connection.provider === "gemini" ? "Gemini" : "OpenAI-compatible"}
                      </Badge>
                      {isActive ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          {t("settings.ai.activeBadge")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="break-all text-xs font-medium text-foreground/85">{connection.model}</p>
                    <p className="break-all text-xs text-muted-foreground">
                      {connection.baseUrl} ·{" "}
                      {connection.hasApiKey ? t("settings.ai.keySavedMasked") : t("settings.ai.noKey")}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {!isActive ? (
                      <Button
                        type="button"
                        size="sm"
                        loading={activate.isPending}
                        onClick={() => void handleUseConnection(connection.id)}
                      >
                        {t("settings.ai.setActive")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => openEditDialog(connection)}
                      className="gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t("settings.ai.manage")}</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDeleteTarget(connection)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("settings.ai.disconnect")}</span>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SettingsSection>

      {/* Connect / Manage Provider Dialog */}
      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>{draft?.connectionId ? t("settings.ai.dialogTitleEdit") : t("settings.ai.dialogTitleAdd")}</span>
            </DialogTitle>
            <DialogDescription>{t("settings.ai.dialogDesc")}</DialogDescription>
          </DialogHeader>

          {draft ? (
            <form onSubmit={(e) => void handleSaveConnection(e)} className="space-y-4">
              {dialogError ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
                  {dialogError}
                </p>
              ) : null}

              {dialogVerifiedCount !== null ? (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t("settings.ai.connectionVerified", { count: dialogVerifiedCount })}</span>
                </p>
              ) : null}

              <SettingsFormField id="ai-connection-name" label={t("Connection name")} required>
                <Input
                  id="ai-connection-name"
                  value={draft.name}
                  maxLength={100}
                  required
                  disabled={busy}
                  onChange={(event) => updateDraft("name", event.target.value)}
                  placeholder="e.g. Gemini Personal, OpenRouter"
                  className="h-10"
                />
              </SettingsFormField>

              <SettingsFormField id="ai-provider" label={t("API protocol")}>
                <select
                  id="ai-provider"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={draft.provider}
                  disabled={busy}
                  onChange={(event) => updateDraft("provider", event.target.value)}
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai-compatible">OpenAI-compatible (OpenAI, OpenRouter, Ollama)</option>
                </select>
              </SettingsFormField>

              <SettingsFormField
                id="ai-base-url"
                label={t("Base URL")}
                required
                helper={t("OpenAI-compatible endpoints usually include /v1.")}
              >
                <Input
                  id="ai-base-url"
                  type="url"
                  value={draft.baseUrl}
                  required
                  disabled={busy}
                  onChange={(event) => updateDraft("baseUrl", event.target.value)}
                  className="h-10"
                />
              </SettingsFormField>

              <SettingsFormField
                id="ai-api-key"
                label={t("API key")}
                helper={t(
                  "Keys are encrypted on the server and never displayed after saving.",
                )}
              >
                <Input
                  id="ai-api-key"
                  type="password"
                  autoComplete="new-password"
                  value={draft.apiKey}
                  disabled={busy}
                  onChange={(event) => updateDraft("apiKey", event.target.value)}
                  placeholder={
                    draft.connectionId
                      ? t("Leave blank to keep the saved key at the same endpoint")
                      : t("Enter your API key")
                  }
                  className="h-10"
                />
              </SettingsFormField>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("Verify credentials and fetch models directly from the provider.")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  loading={discover.isPending}
                  loadingText={t("settings.ai.testing")}
                  disabled={busy || !draft.baseUrl.trim()}
                  onClick={() => void handleTestAndFetch()}
                  className="shrink-0"
                >
                  {t("settings.ai.testAndFetch")}
                </Button>
              </div>

              <SettingsFormField id="ai-model" label={t("Model")} required>
                <select
                  id="ai-model"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={models.length ? draft.model : ""}
                  disabled={!models.length || busy}
                  required
                  onChange={(event) => updateDraft("model", event.target.value)}
                >
                  <option value="">
                    {models.length ? t("Choose a model") : t("Test connection first to load models")}
                  </option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name === model.id ? model.id : `${model.name} (${model.id})`}
                    </option>
                  ))}
                </select>
              </SettingsFormField>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" disabled={busy} onClick={closeDialog}>
                  {t("Cancel")}
                </Button>
                <Button
                  type="submit"
                  loading={save.isPending}
                  disabled={busy || !models.some((model) => model.id === draft.model) || !draft.name.trim()}
                >
                  {t("settings.ai.saveConnection")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !remove.isPending) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Disconnect AI provider?")}</DialogTitle>
            <DialogDescription>
              {t("Delete this connection? If active, your tasks will fall back to LumiGap Platform AI.")}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <div className="rounded-lg border border-border bg-muted/25 px-3.5 py-2.5 text-sm">
              <p className="font-semibold text-foreground">{deleteTarget.name}</p>
              <p className="text-xs text-muted-foreground">{deleteTarget.model}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => setDeleteTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={remove.isPending}
              onClick={() => void handleConfirmDelete()}
            >
              {t("settings.ai.disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
