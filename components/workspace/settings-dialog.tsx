"use client";
import {
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Mic,
  FolderOpen,
  GitBranch,
  Plug,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Model, Provider } from "./types";
import { action, api, providerAction } from "./client";
import {
  asVisibility,
  curatedModelIds,
  type ModelVisibility,
} from "@/lib/ai/model-visibility";

const providerTypes = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google Gemini" },
  { id: "xai", name: "xAI" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "ollama", name: "Ollama" },
  { id: "lmstudio", name: "LM Studio" },
  { id: "custom", name: "Custom OpenAI-compatible" },
];

export function SettingsDialog({
  open,
  onOpenChange,
  providers,
  onChanged,
  settings,
  localFolderName,
  localFolderSupported,
  onChooseLocalFolder,
  activeProjectId,
  activeProjectName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providers: Provider[];
  onChanged: () => void;
  settings: Record<string, unknown>;
  localFolderName?: string;
  localFolderSupported: boolean;
  onChooseLocalFolder: () => Promise<void>;
  activeProjectId?: string;
  activeProjectName?: string;
}) {
  const [tab, setTab] = useState<
    | "providers"
    | "models"
    | "voice"
    | "preferences"
    | "workspace"
    | "connections"
    | "security"
  >("providers");
  const [type, setType] = useState("openai");
  const [name, setName] = useState("OpenAI");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string>();
  const [availableModels, setAvailableModels] = useState<
    Record<string, Model[]>
  >({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [integrations, setIntegrations] = useState<
    Array<{
      id: string;
      type: string;
      name: string;
      secret_hint: string;
      config: string;
    }>
  >([]);
  const [githubToken, setGithubToken] = useState("");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [createGithubRepo, setCreateGithubRepo] = useState(true);
  const [replacingGithub, setReplacingGithub] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);
  const [voiceProviderId, setVoiceProviderId] = useState(
    String(settings.voiceProviderId || ""),
  );
  const [voiceModel, setVoiceModel] = useState(
    String(settings.voiceTranscriptionModel || "gpt-transcribe"),
  );
  const [voiceLanguages, setVoiceLanguages] = useState(
    String(settings.voiceLanguages || "en, af"),
  );
  const [voiceKeywords, setVoiceKeywords] = useState(
    String(settings.voiceKeywords || ""),
  );
  const [voiceCleanDictation, setVoiceCleanDictation] = useState(
    settings.voiceCleanDictation !== false,
  );
  const [enabledModels, setEnabledModels] = useState<ModelVisibility>(() =>
    asVisibility(settings.enabledModels),
  );
  const [instructions, setInstructions] = useState(
    String(settings.globalInstructions || ""),
  );
  const [budget, setBudget] = useState(String(settings.monthlyBudget ?? "20"));
  useEffect(() => {
    if (tab !== "models" || providers.length === 0) return;
    queueMicrotask(() => setModelsLoading(true));
    Promise.all(
      providers
        .filter((provider) => provider.enabled)
        .map(async (provider) => {
          const result = await providerAction<{ models: Model[] }>({
            action: "models",
            id: provider.id,
          });
          return [provider.id, result.models] as const;
        }),
    )
      .then((entries) => setAvailableModels(Object.fromEntries(entries)))
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not load models",
        ),
      )
      .finally(() => setModelsLoading(false));
  }, [tab, providers]);
  useEffect(() => {
    if (tab !== "connections") return;
    api<{ integrations: typeof integrations }>("/api/integrations")
      .then(({ integrations: next }) => {
        setIntegrations(next);
        const githubConnection = next.find((item) => item.type === "github");
        if (githubConnection) {
          const config = JSON.parse(githubConnection.config || "{}") as {
            login?: string;
          };
          setGithubOwner((current) => current || config.login || "");
        }
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not load connections",
        ),
      );
  }, [tab]);
  const modelCount = useMemo(
    () =>
      Object.values(availableModels).reduce(
        (sum, list) => sum + list.length,
        0,
      ),
    [availableModels],
  );
  const save = async () => {
    setBusy(true);
    try {
      await providerAction({
        action: "save",
        type,
        name,
        apiKey: key,
        baseUrl: baseUrl || undefined,
      });
      setKey("");
      onChanged();
      toast.success(`${name} connected`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not connect provider",
      );
    } finally {
      setBusy(false);
    }
  };
  const test = async (id: string) => {
    setTesting(id);
    try {
      const result = await providerAction<{ modelCount: number }>({
        action: "test",
        id,
      });
      toast.success(`Connected · ${result.modelCount} models available`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(undefined);
    }
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this provider key?")) return;
    await providerAction({ action: "remove", id });
    onChanged();
  };
  const savePrefs = async () => {
    await Promise.all([
      action({
        action: "save_setting",
        key: "globalInstructions",
        value: instructions,
      }),
      action({
        action: "save_setting",
        key: "monthlyBudget",
        value: Number(budget) || 0,
      }),
    ]);
    toast.success("Preferences saved");
    onChanged();
  };
  const effectiveSelection = (providerId: string) =>
    Object.hasOwn(enabledModels, providerId)
      ? enabledModels[providerId]
      : curatedModelIds(availableModels[providerId] || []);
  const toggleModel = (providerId: string, modelId: string) => {
    const current = effectiveSelection(providerId);
    setEnabledModels((value) => ({
      ...value,
      [providerId]: current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId],
    }));
  };
  const saveModels = async () => {
    await action({
      action: "save_setting",
      key: "enabledModels",
      value: enabledModels,
    });
    toast.success("Model menu updated");
    onChanged();
  };
  const saveVoice = async () => {
    await Promise.all([
      action({
        action: "save_setting",
        key: "voiceProviderId",
        value: voiceProviderId,
      }),
      action({
        action: "save_setting",
        key: "voiceTranscriptionModel",
        value: voiceModel.trim() || "gpt-transcribe",
      }),
      action({
        action: "save_setting",
        key: "voiceLanguages",
        value: voiceLanguages,
      }),
      action({
        action: "save_setting",
        key: "voiceKeywords",
        value: voiceKeywords,
      }),
      action({
        action: "save_setting",
        key: "voiceCleanDictation",
        value: voiceCleanDictation,
      }),
    ]);
    toast.success("Voice input settings saved");
    onChanged();
  };
  const saveGithub = async () => {
    setGithubBusy(true);
    try {
      await api("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "save_github", token: githubToken }),
      });
      setGithubToken("");
      setReplacingGithub(false);
      const result = await api<{ integrations: typeof integrations }>(
        "/api/integrations",
      );
      setIntegrations(result.integrations);
      const connected = result.integrations.find(
        (item) => item.type === "github",
      );
      if (connected) {
        const config = JSON.parse(connected.config || "{}") as {
          login?: string;
        };
        setGithubOwner(config.login || "");
      }
      toast.success("GitHub connected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not connect GitHub",
      );
    } finally {
      setGithubBusy(false);
    }
  };
  const removeGithub = async () => {
    const connection = integrations.find((item) => item.type === "github");
    if (!connection || !confirm("Remove the saved GitHub connection?")) return;
    setGithubBusy(true);
    try {
      await api("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "remove", id: connection.id }),
      });
      setIntegrations((current) =>
        current.filter((item) => item.id !== connection.id),
      );
      setReplacingGithub(false);
      setGithubToken("");
      toast.success("GitHub connection removed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not remove GitHub connection",
      );
    } finally {
      setGithubBusy(false);
    }
  };
  const testGithub = async () => {
    const connection = integrations.find((item) => item.type === "github");
    if (!connection) return;
    setGithubBusy(true);
    try {
      const result = await api<{ login: string }>("/api/integrations", {
        method: "POST",
        body: JSON.stringify({ action: "test", id: connection.id }),
      });
      toast.success(`GitHub connected as ${result.login}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `${error.message}. Replace the token to reconnect.`
          : "GitHub connection failed. Replace the token to reconnect.",
      );
    } finally {
      setGithubBusy(false);
    }
  };
  const publishGithub = async () => {
    const connection = integrations.find((item) => item.type === "github");
    if (!connection || !activeProjectId) return;
    setGithubBusy(true);
    try {
      const result = await api<{ url: string; files: number; branch: string }>(
        "/api/integrations",
        {
          method: "POST",
          body: JSON.stringify({
            action: "publish_github",
            integrationId: connection.id,
            projectId: activeProjectId,
            owner: githubOwner,
            repo: githubRepo,
            branch: githubBranch,
            create: createGithubRepo,
            private: true,
            message: `Update ${activeProjectName || "project"} from Aster`,
          }),
        },
      );
      toast.success(
        `Pushed ${result.files} files to ${githubRepo}/${result.branch}`,
        {
          action: {
            label: "Open commit",
            onClick: () => window.open(result.url),
          },
        },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "GitHub publish failed",
      );
    } finally {
      setGithubBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-h-[88dvh] sm:max-w-3xl">
        <DialogHeader className="min-w-0 border-b px-4 py-4 pr-12 text-left sm:px-6 sm:py-5">
          <DialogTitle>Workspace settings</DialogTitle>
          <DialogDescription>
            Keys are encrypted server-side and never returned to the browser.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 min-w-0 sm:grid-cols-[170px_minmax(0,1fr)]">
          <nav className="flex min-w-0 snap-x gap-1 overflow-x-auto border-b p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
            <button
              onClick={() => setTab("models")}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === "models" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Models
            </button>
            <button
              onClick={() => setTab("providers")}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === "providers" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              AI Providers
            </button>
            <button
              onClick={() => {
                setTab("voice");
                if (!voiceProviderId)
                  setVoiceProviderId(
                    providers.find((provider) => provider.type === "openai")
                      ?.id || "",
                  );
              }}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === "voice" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Voice input
            </button>
            <button
              onClick={() => setTab("preferences")}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === "preferences" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Instructions
            </button>
            <button
              onClick={() => setTab("workspace")}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === "workspace" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Local workspace
            </button>
            <button
              onClick={() => {
                setTab("connections");
                if (!githubRepo && activeProjectName)
                  setGithubRepo(
                    activeProjectName
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                      .slice(0, 80),
                  );
              }}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === "connections" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Connections
            </button>
            <button
              onClick={() => setTab("security")}
              className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === "security" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Security
            </button>
          </nav>
          <div className="max-h-[calc(100dvh-9.5rem)] min-w-0 overflow-x-hidden overflow-y-auto p-4 sm:max-h-[68dvh] sm:p-5">
            {tab === "providers" && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-medium">Connected providers</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use more than one provider to compare capability, speed and
                    cost.
                  </p>
                </div>
                <div className="space-y-2">
                  {providers.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border bg-card p-3"
                    >
                      <div className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        <Check className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.key_hint} · Connected
                        </div>
                      </div>
                      <button
                        onClick={() => test(p.id)}
                        className="ml-auto rounded-lg border px-3 py-1.5 text-xs"
                      >
                        {testing === p.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Test"
                        )}
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  {providers.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                      <Plug className="mx-auto mb-2 size-5" />
                      Connect your first provider to start chatting.
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="flex items-center gap-2 font-medium">
                    <KeyRound className="size-4" />
                    Add provider
                  </h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Provider
                      <select
                        value={type}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setType(nextType);
                          setName(
                            providerTypes.find(
                              (provider) => provider.id === nextType,
                            )?.name || "Custom provider",
                          );
                        }}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                      >
                        {providerTypes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Display name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                      />
                    </label>
                    {["custom", "ollama", "lmstudio"].includes(type) && (
                      <label className="text-sm sm:col-span-2">
                        Base URL
                        <input
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder="https://api.example.com/v1"
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                        />
                      </label>
                    )}
                    <label className="text-sm sm:col-span-2">
                      API key
                      <input
                        type="password"
                        autoComplete="off"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={
                          type === "ollama"
                            ? "Enter any value for a non-authenticated local server"
                            : "Paste your key"
                        }
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                      />
                    </label>
                    <button
                      disabled={busy || !key}
                      onClick={save}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:col-span-2"
                    >
                      {busy ? "Encrypting & saving…" : "Save provider"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {tab === "preferences" && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-medium">Personal instructions</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These apply to every chat. Project and conversation
                    instructions take precedence.
                  </p>
                </div>
                <textarea
                  rows={7}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Be concise. Use South African currency…"
                  className="w-full rounded-xl border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <label className="block text-sm">
                  Monthly AI budget (USD)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-card px-3 py-2"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    A local estimate. Provider balances are never invented.
                  </span>
                </label>
                <button
                  onClick={savePrefs}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Save preferences
                </button>
              </div>
            )}
            {tab === "voice" && (
              <div className="space-y-5">
                <div>
                  <h3 className="flex items-center gap-2 font-medium">
                    <Mic className="size-4" /> High-accuracy dictation
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Tap the microphone beside the prompt, speak naturally, then
                    tap stop. The transcript remains editable and is never sent
                    as a chat message until you press Send.
                  </p>
                </div>
                <div className="space-y-4 rounded-xl border bg-card p-4">
                  <label className="block text-sm">
                    OpenAI connection
                    <select
                      value={voiceProviderId}
                      onChange={(event) =>
                        setVoiceProviderId(event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                    >
                      <option value="">Choose a connection</option>
                      {providers
                        .filter(
                          (provider) =>
                            provider.type === "openai" && provider.enabled,
                        )
                        .map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Transcription model
                    <input
                      value={voiceModel}
                      onChange={(event) => setVoiceModel(event.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm"
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      gpt-transcribe is the current recommended high-accuracy
                      model. You can replace it without changing the app.
                    </span>
                  </label>
                  <label className="block text-sm">
                    Expected languages
                    <input
                      value={voiceLanguages}
                      onChange={(event) =>
                        setVoiceLanguages(event.target.value)
                      }
                      placeholder="en, af"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Comma-separated language codes. English and Afrikaans are
                      enabled by default.
                    </span>
                  </label>
                  <label className="block text-sm">
                    Personal vocabulary
                    <textarea
                      rows={4}
                      value={voiceKeywords}
                      onChange={(event) => setVoiceKeywords(event.target.value)}
                      placeholder="Names, business terms, software, places…"
                      className="mt-1 w-full rounded-lg border bg-background p-3"
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Add names and unusual terms that the transcription should
                      recognise accurately.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={voiceCleanDictation}
                      onChange={(event) =>
                        setVoiceCleanDictation(event.target.checked)
                      }
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium">
                        Clean spoken dictation
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        Smooth accidental stutters, filler sounds and short
                        false starts without changing the intended meaning.
                      </span>
                    </span>
                  </label>
                </div>
                {providers.every((provider) => provider.type !== "openai") && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
                    Connect an OpenAI API key under AI Providers to enable
                    high-accuracy voice input. The iPhone keyboard microphone
                    remains available without it.
                  </p>
                )}
                <button
                  onClick={saveVoice}
                  disabled={!voiceProviderId || !voiceModel.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Save voice settings
                </button>
              </div>
            )}
            {tab === "models" && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-medium">Model menu</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every model reported by your providers is available here.
                    Tick only the models you want in the chat picker.
                  </p>
                </div>
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Search all models"
                  className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                />
                {modelsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Loading every
                    provider model…
                  </div>
                ) : (
                  <div className="space-y-4">
                    {providers.map((provider) => {
                      const list = (availableModels[provider.id] || []).filter(
                        (model) =>
                          `${model.name} ${model.id}`
                            .toLowerCase()
                            .includes(modelSearch.toLowerCase()),
                      );
                      const selected = new Set(effectiveSelection(provider.id));
                      return (
                        <section
                          key={provider.id}
                          className="min-w-0 rounded-xl border"
                        >
                          <div className="flex items-center border-b px-3 py-2">
                            <span className="text-sm font-medium">
                              {provider.name}
                            </span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {selected.size} selected · {list.length} shown
                            </span>
                          </div>
                          <div className="max-h-56 overflow-y-auto p-2">
                            {list.map((model) => (
                              <label
                                key={model.id}
                                className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-accent"
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(model.id)}
                                  onChange={() =>
                                    toggleModel(provider.id, model.id)
                                  }
                                  className="mt-1"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm">
                                    {model.name}
                                  </span>
                                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                    {model.id}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={saveModels}
                  disabled={modelsLoading || modelCount === 0}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Save model menu
                </button>
              </div>
            )}
            {tab === "workspace" && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-medium">Local source folder</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Aster keeps its secure cloud copy and mirrors applied source
                    files into a folder you choose on this computer.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-400">
                      <FolderOpen className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {localFolderName || "No folder selected"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {localFolderName
                          ? "Applied project files sync automatically"
                          : "Choose one parent folder for all Aster projects"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!localFolderSupported}
                    onClick={() => void onChooseLocalFolder()}
                    className="mt-4 w-full rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {localFolderName ? "Change folder" : "Choose folder"}
                  </button>
                  {!localFolderSupported && (
                    <p className="mt-3 text-xs leading-5 text-amber-500">
                      Folder access is supported by Chrome and Edge on desktop.
                      Mobile Safari still keeps the project safely inside Aster
                      and can export it as a ZIP.
                    </p>
                  )}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Your browser grants access only to the folder you select.
                  Aster never receives or stores its full path.
                </p>
              </div>
            )}
            {tab === "connections" && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-medium">Connected services</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Connect external services without exposing their credentials
                    to the browser or an AI provider.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-foreground/10">
                      <GitBranch className="size-5" />
                    </span>
                    <div>
                      <div className="text-sm font-medium">GitHub</div>
                      <div className="text-xs text-muted-foreground">
                        {integrations.find((item) => item.type === "github")
                          ? `${integrations.find((item) => item.type === "github")?.secret_hint} · Connected`
                          : "Push applied workspace files to a repository"}
                      </div>
                    </div>
                  </div>
                  {!integrations.some((item) => item.type === "github") ||
                  replacingGithub ? (
                    <div className="mt-4 space-y-3">
                      <input
                        type="password"
                        autoComplete="off"
                        value={githubToken}
                        onChange={(event) => setGithubToken(event.target.value)}
                        placeholder="Fine-grained GitHub token"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        Grant repository Contents: read and write. The token is
                        encrypted at rest and never returned after saving.
                      </p>
                      <button
                        onClick={saveGithub}
                        disabled={!githubToken || githubBusy}
                        className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {githubBusy
                          ? "Connecting…"
                          : replacingGithub
                            ? "Replace GitHub token"
                            : "Connect GitHub"}
                      </button>
                      {replacingGithub ? (
                        <button
                          type="button"
                          disabled={githubBusy}
                          onClick={() => {
                            setReplacingGithub(false);
                            setGithubToken("");
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  ) : activeProjectId ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        Owner
                        <input
                          value={githubOwner}
                          onChange={(event) =>
                            setGithubOwner(event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                        />
                      </label>
                      <label className="text-sm">
                        Repository
                        <input
                          value={githubRepo}
                          onChange={(event) =>
                            setGithubRepo(event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                        />
                      </label>
                      <label className="text-sm sm:col-span-2">
                        Branch
                        <input
                          value={githubBranch}
                          onChange={(event) =>
                            setGithubBranch(event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={createGithubRepo}
                          onChange={(event) =>
                            setCreateGithubRepo(event.target.checked)
                          }
                        />
                        Create a private repository if it does not exist
                      </label>
                      <button
                        onClick={publishGithub}
                        disabled={
                          githubBusy ||
                          !githubOwner ||
                          !githubRepo ||
                          !githubBranch
                        }
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:col-span-2"
                      >
                        {githubBusy ? "Publishing…" : "Push project to GitHub"}
                      </button>
                      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                        Publishing replaces the repository branch snapshot with
                        the applied files currently visible in this workspace.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Open or create a project before choosing its repository.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={githubBusy}
                          onClick={() => void testGithub()}
                          className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
                        >
                          {githubBusy ? "Testing…" : "Test connection"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplacingGithub(true)}
                          className="rounded-lg border px-3 py-2 text-sm font-medium"
                        >
                          Replace token
                        </button>
                        <button
                          type="button"
                          disabled={githubBusy}
                          onClick={() => void removeGithub()}
                          className="rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-foreground/10">
                        <Mail className="size-5" />
                      </span>
                      <div>
                        <div className="text-sm font-medium">Gmail</div>
                        <div className="text-xs text-muted-foreground">
                          Not connected yet · OAuth integration required
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-foreground/10">
                        <Search className="size-5" />
                      </span>
                      <div>
                        <div className="text-sm font-medium">
                          Live web search
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Not connected yet · search provider required
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {tab === "security" && (
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="font-medium">Credential protection</h3>
                  <p className="mt-2 leading-6 text-muted-foreground">
                    Provider keys are encrypted with AES-GCM using your
                    installation key. The interface only receives a short key
                    hint. Keys are excluded from exports, logs and source
                    control.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="font-medium">Provider privacy</h3>
                  <p className="mt-2 leading-6 text-muted-foreground">
                    Only selected conversation context, relevant project files
                    and enabled memories are sent for a request.
                  </p>
                </div>
                <a
                  href="/api/export"
                  className="inline-flex rounded-lg border px-3 py-2 font-medium"
                >
                  Export all user data (JSON)
                </a>
                <a
                  className="ml-2 inline-flex items-center gap-1 text-violet-400"
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Security guide <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
