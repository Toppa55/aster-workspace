"use client";
import {
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  Plug,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Provider } from "./types";
import { action, providerAction } from "./client";

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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providers: Provider[];
  onChanged: () => void;
  settings: Record<string, unknown>;
}) {
  const [tab, setTab] = useState<"providers" | "preferences" | "security">(
    "providers",
  );
  const [type, setType] = useState("openai");
  const [name, setName] = useState("OpenAI");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string>();
  const [instructions, setInstructions] = useState(
    String(settings.globalInstructions || ""),
  );
  const [budget, setBudget] = useState(String(settings.monthlyBudget || "20"));
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Workspace settings</DialogTitle>
          <DialogDescription>
            Keys are encrypted server-side and never returned to the browser.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 sm:grid-cols-[170px_1fr]">
          <nav className="flex gap-1 border-b p-3 sm:flex-col sm:border-b-0 sm:border-r">
            <button
              onClick={() => setTab("providers")}
              className={`rounded-lg px-3 py-2 text-left text-sm ${tab === "providers" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              AI Providers
            </button>
            <button
              onClick={() => setTab("preferences")}
              className={`rounded-lg px-3 py-2 text-left text-sm ${tab === "preferences" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Instructions
            </button>
            <button
              onClick={() => setTab("security")}
              className={`rounded-lg px-3 py-2 text-left text-sm ${tab === "security" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              Security
            </button>
          </nav>
          <div className="max-h-[68dvh] overflow-y-auto p-5">
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
                      providerTypes.find((provider) => provider.id === nextType)
                        ?.name || "Custom provider",
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
