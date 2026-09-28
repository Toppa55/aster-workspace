"use client";
import {
  Check,
  Code2,
  Copy,
  Edit3,
  Menu,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Square,
  Star,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Conversation, Message, Model, Provider } from "./types";

export function ChatPane({
  conversation,
  messages,
  providers,
  models,
  modelLoading,
  selectedProvider,
  selectedModel,
  onProvider,
  onModel,
  onSend,
  onStop,
  onMenu,
  onToggleIde,
  generating,
  projectMode,
  onUpload,
}: {
  conversation?: Conversation;
  messages: Message[];
  providers: Provider[];
  models: Model[];
  modelLoading: boolean;
  selectedProvider?: string;
  selectedModel?: string;
  onProvider: (id: string) => void;
  onModel: (id: string) => void;
  onSend: (text: string, reasoning: "off" | "low" | "medium" | "high") => void;
  onStop: () => void;
  onMenu: () => void;
  onToggleIde: () => void;
  generating: boolean;
  projectMode: boolean;
  onUpload: (files: FileList) => void;
}) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [reasoning, setReasoning] = useState<"off" | "low" | "medium" | "high">(
    projectMode ? "medium" : "off",
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = models.find((m) => m.id === selectedModel);
  const shown = useMemo(
    () =>
      search
        ? messages.filter((m) =>
            m.content.toLowerCase().includes(search.toLowerCase()),
          )
        : messages,
    [messages, search],
  );
  const submit = () => {
    if (!draft.trim() || generating) return;
    onSend(draft.trim(), reasoning);
    setDraft("");
  };
  return (
    <section className="relative flex h-full min-w-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 hover:bg-accent lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {conversation?.title || "New chat"}
          </div>
          <div className="hidden text-xs text-muted-foreground sm:block">
            {projectMode ? "Project / Coding mode" : "Chat mode"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="hidden items-center gap-1 rounded-lg border bg-card px-2 sm:flex">
            <Search className="size-3 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find"
              className="w-16 bg-transparent py-1.5 text-xs outline-none focus:w-28"
            />
          </label>
          <select
            aria-label="Provider"
            value={selectedProvider || ""}
            onChange={(e) => onProvider(e.target.value)}
            className="max-w-32 rounded-lg border bg-card px-2 py-1.5 text-xs"
          >
            <option value="">Provider</option>
            {providers.length > 1 && (
              <option value="smart">Smart · Balanced</option>
            )}
            {providers
              .filter((p) => p.enabled)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <select
            aria-label="Model"
            value={selectedModel || ""}
            onChange={(e) => onModel(e.target.value)}
            disabled={!selectedProvider || modelLoading}
            className="max-w-36 rounded-lg border bg-card px-2 py-1.5 text-xs"
          >
            <option value="">{modelLoading ? "Loading…" : "Model"}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {projectMode && (
            <button
              onClick={onToggleIde}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
            >
              <Code2 className="size-4" />
            </button>
          )}
        </div>
      </header>
      {selected && (
        <div className="flex h-8 shrink-0 items-center gap-3 border-b px-4 text-[11px] text-muted-foreground">
          <span>
            {selected.capabilities.contextWindow
              ? `${Math.round(selected.capabilities.contextWindow / 1000)}K context`
              : "Context varies"}
          </span>
          {selected.capabilities.reasoning && <span>Reasoning</span>}
          {selected.capabilities.vision && <span>Vision</span>}
          {selected.capabilities.tools && <span>Tools</span>}
          <span className="ml-auto capitalize">{selected.provider}</span>
          {selected.capabilities.reasoning && (
            <select
              value={reasoning}
              onChange={(event) =>
                setReasoning(event.target.value as typeof reasoning)
              }
              className="rounded border bg-card px-1.5 py-0.5"
              aria-label="Reasoning effort"
            >
              <option value="off">Reasoning off</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-40 pt-8 sm:px-8">
          {shown.length === 0 ? (
            <Empty
              projectMode={projectMode}
              hasProviders={providers.length > 0}
            />
          ) : (
            shown.map((message) => (
              <MessageView
                key={message.id}
                message={message}
                onRetry={() =>
                  message.role === "user" && onSend(message.content, reasoning)
                }
              />
            ))
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl bg-gradient-to-t from-background via-background px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-10 sm:px-6">
          <div className="rounded-2xl border bg-card shadow-[0_18px_60px_rgba(0,0,0,.28)]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={
                providers.length
                  ? projectMode
                    ? "Ask Aster to build or change something…"
                    : "Ask Aster anything…"
                  : "Connect an AI provider in Settings to begin"
              }
              className="max-h-40 min-h-16 w-full resize-none bg-transparent px-4 pt-3 text-[16px] outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-2 px-2.5 pb-2.5">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && onUpload(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
              >
                <Paperclip className="size-4" />
              </button>
              <span className="rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground">
                {projectMode
                  ? "Relevant files selected automatically"
                  : "Private chat"}
              </span>
              {generating ? (
                <button
                  onClick={onStop}
                  className="ml-auto grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground"
                >
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!draft.trim() || !selectedModel}
                  className="ml-auto grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <Send className="size-4" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Aster sends only the context needed for your request.
          </p>
        </div>
      </div>
    </section>
  );
}

function Empty({
  projectMode,
  hasProviders,
}: {
  projectMode: boolean;
  hasProviders: boolean;
}) {
  return (
    <div className="grid min-h-[55vh] place-items-center text-center">
      <div>
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#6d5dfc,#2dd4bf)] text-white">
          <Star className="size-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {hasProviders
            ? projectMode
              ? "What should we build?"
              : "What’s on your mind?"
            : "Connect your first AI provider"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {hasProviders
            ? projectMode
              ? "Changes become reviewable diffs in the code workspace. Raw source stays out of chat."
              : "Choose any connected model and start a conversation."
            : "Open Settings, paste your own API key, test the connection and select a model."}
        </p>
      </div>
    </div>
  );
}
function MessageView({
  message,
  onRetry,
}: {
  message: Message;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <article
      className={
        message.role === "user"
          ? "ml-auto max-w-[86%] rounded-2xl rounded-tr-md bg-accent px-4 py-3"
          : "group max-w-full"
      }
    >
      {message.role === "assistant" ? (
        <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-violet-300 prose-pre:bg-[#0b0d12] prose-table:block prose-table:overflow-x-auto dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content || "…"}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-6">
          {message.content}
        </p>
      )}
      <div
        className={`mt-2 flex items-center gap-1 text-[11px] text-muted-foreground ${message.role === "user" ? "justify-end" : ""}`}
      >
        {message.role === "assistant" && (
          <>
            {message.input_tokens || message.output_tokens ? (
              <span>
                {message.input_tokens?.toLocaleString()} in ·{" "}
                {message.output_tokens?.toLocaleString()} out
                {message.cost_usd != null
                  ? ` · ~$${Number(message.cost_usd).toFixed(4)}`
                  : ""}
              </span>
            ) : null}
            <button
              onClick={() => {
                navigator.clipboard.writeText(message.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="ml-2 rounded p-1 hover:bg-accent"
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
            <button onClick={onRetry} className="rounded p-1 hover:bg-accent">
              <RefreshCw className="size-3" />
            </button>
          </>
        )}{" "}
        {message.role === "user" && (
          <button className="rounded p-1 hover:bg-card">
            <Edit3 className="size-3" />
          </button>
        )}
      </div>
    </article>
  );
}
