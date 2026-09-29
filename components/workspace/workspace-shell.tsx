"use client";
import { Download, Loader2, PanelRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { zipSync, strToU8 } from "fflate";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sidebar } from "./sidebar";
import { ChatPane } from "./chat-pane";
import { IdePane } from "./ide-pane";
import { SettingsDialog } from "./settings-dialog";
import { UsageDialog } from "./usage-dialog";
import { action, api, download, providerAction } from "./client";
import type { Conversation, Message, Model, WorkspaceData } from "./types";
import { useWebMcp } from "./use-webmcp";
import {
  chooseLocalWorkspace,
  storedLocalWorkspace,
  supportsLocalWorkspace,
  syncProjectToLocal,
  type LocalDirectoryHandle,
} from "./local-workspace";
import {
  isCodingWorkspaceRequest,
  projectNameFromPrompt,
} from "@/lib/ai/coding-intent";
import { visibleModels } from "@/lib/ai/model-visibility";

const empty: WorkspaceData = {
  user: { id: "" },
  folders: [],
  projects: [],
  conversations: [],
  providers: [],
  memories: [],
  usage: [],
  monthlyUsage: [],
  settings: {},
  messages: [],
  files: [],
  changes: [],
};

export function WorkspaceShell() {
  const [data, setData] = useState<WorkspaceData>(empty);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>();
  const [activeProject, setActiveProject] = useState<string>();
  const [activeFile, setActiveFile] = useState<string>();
  const [sidebar, setSidebar] = useState(false);
  const [ide, setIde] = useState(true);
  const [mobile, setMobile] = useState<"chat" | "code">("chat");
  const [wideLayout, setWideLayout] = useState(false);
  const [settings, setSettings] = useState(false);
  const [usage, setUsage] = useState(false);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [providerId, setProviderId] = useState<string>();
  const [modelId, setModelId] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [localDirectory, setLocalDirectory] = useState<LocalDirectoryHandle>();
  const abort = useRef<AbortController | null>(null);
  const conversation = data.conversations.find((c) => c.id === activeId);
  const projectMode = !!activeProject;
  const fetchData = useCallback(
    async (conversationId?: string, projectId?: string) => {
      const params = new URLSearchParams();
      if (conversationId) params.set("conversationId", conversationId);
      if (projectId) params.set("projectId", projectId);
      return api<WorkspaceData>(`/api/workspace?${params}`);
    },
    [],
  );
  const selectConversation = useCallback(
    async (c: Conversation) => {
      setActiveId(c.id);
      setActiveProject(c.project_id);
      setProviderId(c.provider_id);
      setModelId(c.model_id);
      setSidebar(false);
      setMobile("chat");
      try {
        const detail = await fetchData(c.id, c.project_id);
        setData(detail);
        setProviderId(
          (current) => c.provider_id || current || detail.providers[0]?.id,
        );
        if (detail.files[0]) setActiveFile(detail.files[0].path);
        const project = detail.projects.find(
          (item) => item.id === c.project_id,
        );
        if (localDirectory && project)
          await syncProjectToLocal(localDirectory, project, detail.files);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load chat");
      }
    },
    [fetchData, localDirectory],
  );
  const load = useCallback(async () => {
    const next = await fetchData();
    setData(next);
    setLoading(false);
    if (next.providers.length === 0) setSettings(true);
    setProviderId((current) =>
      current &&
      (current === "smart" || next.providers.some((p) => p.id === current))
        ? current
        : next.providers.find((p) => p.enabled)?.id,
    );
    if (next.conversations[0]) selectConversation(next.conversations[0]);
  }, [fetchData, selectConversation]);
  useEffect(() => {
    queueMicrotask(() => {
      load().catch((e) => {
        toast.error(e.message);
        setLoading(false);
      });
    });
  }, [load]);
  useEffect(() => {
    storedLocalWorkspace()
      .then(setLocalDirectory)
      .catch(() => setLocalDirectory(undefined));
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWideLayout(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!providerId) {
      queueMicrotask(() => setModels([]));
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModelsLoading(true);
    const request =
      providerId === "smart"
        ? Promise.all(
            data.providers
              .filter((provider) => provider.enabled)
              .map(async (provider) => {
                const result = await providerAction<{ models: Model[] }>({
                  action: "models",
                  id: provider.id,
                });
                return visibleModels(
                  provider.id,
                  result.models,
                  data.settings.enabledModels,
                ).map((model) => ({
                  ...model,
                  connectionId: provider.id,
                }));
              }),
          ).then((groups) =>
            groups
              .flat()
              .sort(
                (a, b) =>
                  smartScore(b, projectMode) - smartScore(a, projectMode),
              ),
          )
        : providerAction<{ models: Model[] }>({
            action: "models",
            id: providerId,
          }).then((result) =>
            visibleModels(
              providerId,
              result.models,
              data.settings.enabledModels,
            ).map((model) => ({
              ...model,
              connectionId: providerId,
            })),
          );
    request
      .then((available) => {
        setModels(available);
        setModelId((current) =>
          current && available.some((m) => m.id === current)
            ? current
            : available[0]?.id,
        );
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setModelsLoading(false));
  }, [providerId, projectMode, data.providers, data.settings.enabledModels]);
  const refresh = async () => {
    if (activeId) {
      const current = data.conversations.find((c) => c.id === activeId);
      if (current) await selectConversation(current);
    } else await load();
  };
  const newChat = async () => {
    const defaultProvider =
      providerId === "smart"
        ? data.providers.find((provider) => provider.enabled)?.id
        : providerId || data.providers.find((provider) => provider.enabled)?.id;
    const r = await action<{ id: string }>({
      action: "create_conversation",
      providerId: defaultProvider,
      modelId,
    });
    const next = await fetchData();
    setData({ ...next, messages: [], files: [], changes: [] });
    setActiveId(r.id);
    setActiveProject(undefined);
    setProviderId(defaultProvider);
    setSidebar(false);
  };
  const createProject = useCallback(
    async (name: string) => {
      const r = await action<{ id: string; conversationId: string }>({
        action: "create_project",
        name,
      });
      const next = await fetchData();
      setData({ ...next, messages: [], files: [], changes: [] });
      setActiveId(r.conversationId);
      setActiveProject(r.id);
      setIde(true);
      setMobile("chat");
      setProviderId(data.providers[0]?.id);
      setModelId(undefined);
    },
    [data.providers, fetchData],
  );
  const newProject = async () => {
    const name = prompt("Project name", "New project");
    if (name) await createProject(name);
  };
  const newFolder = async () => {
    const name = prompt("Folder name", "New folder");
    if (!name) return;
    await action({ action: "create_folder", name });
    await load();
  };
  const manageConversation = async (chat: Conversation) => {
    const choice = prompt(
      "Chat action: rename, pin, archive, or delete",
      "rename",
    )?.toLowerCase();
    if (!choice) return;
    if (choice === "rename") {
      const title = prompt("Chat name", chat.title);
      if (title)
        await action({ action: "update_conversation", id: chat.id, title });
    } else if (choice === "pin") {
      await action({
        action: "update_conversation",
        id: chat.id,
        pinned: chat.pinned ? 0 : 1,
      });
    } else if (choice === "archive") {
      await action({ action: "update_conversation", id: chat.id, archived: 1 });
    } else if (choice === "delete" && confirm(`Delete “${chat.title}”?`)) {
      await action({ action: "delete_conversation", id: chat.id });
    }
    await load();
  };
  const deleteConversation = async (chat: Conversation) => {
    if (!confirm(`Delete “${chat.title}”? This cannot be undone.`)) return;
    await action({ action: "delete_conversation", id: chat.id });
    if (activeId === chat.id) {
      setActiveId(undefined);
      setActiveProject(undefined);
      setActiveFile(undefined);
      setMobile("chat");
    }
    await load();
  };
  const manageProject = async (project: WorkspaceData["projects"][number]) => {
    const choice = prompt(
      "Project action: rename or delete",
      "rename",
    )?.toLowerCase();
    if (choice === "rename") {
      const name = prompt("Project name", project.name);
      if (name)
        await action({ action: "update_project", id: project.id, name });
    } else if (choice === "delete" && confirm(`Delete “${project.name}”?`)) {
      await action({ action: "delete_project", id: project.id });
    }
    await load();
  };
  useWebMcp({ createChat: newChat, createProject });
  const send = async (
    text: string,
    reasoning: "off" | "low" | "medium" | "high" = "off",
  ) => {
    if (!providerId) {
      toast.error("Choose an AI provider first");
      return false;
    }
    if (!modelId) {
      toast.error("Choose a model first");
      return false;
    }
    const actualProvider =
      providerId === "smart"
        ? models.find((model) => model.id === modelId)?.connectionId
        : providerId;
    if (!actualProvider) {
      toast.error("The selected model is not available");
      return false;
    }
    let conversationId = activeId;
    if (!conversationId) {
      const created = await action<{ id: string }>({
        action: "create_conversation",
        providerId: actualProvider,
        modelId,
      });
      conversationId = created.id;
      setActiveId(conversationId);
    }
    let requestProjectId = activeProject;
    if (!requestProjectId && isCodingWorkspaceRequest(text)) {
      const converted = await action<{ id: string }>({
        action: "convert_conversation_to_project",
        conversationId,
        name: projectNameFromPrompt(text),
      });
      requestProjectId = converted.id;
      setActiveProject(requestProjectId);
      setIde(true);
      toast.success("Coding request opened in a project workspace");
    }
    const tempUser: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      created_at: Date.now(),
    };
    const tempAi: Message = {
      id: "streaming",
      role: "assistant",
      content: "",
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      created_at: Date.now(),
      pending: true,
    };
    setData((d) => ({ ...d, messages: [...d.messages, tempUser, tempAi] }));
    setGenerating(true);
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          projectId: requestProjectId,
          providerId: actualProvider,
          modelId,
          message: text,
          reasoning,
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const problem = (await response.json()) as { error?: string };
        throw new Error(problem.error || "Generation failed");
      }
      if (!response.body) throw new Error("Empty response");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const event = block.match(/^event: (.+)$/m)?.[1];
          const raw = block.match(/^data: (.+)$/m)?.[1];
          if (!event || !raw) continue;
          const payload = JSON.parse(raw) as { text?: string; error?: string };
          if (event === "delta" && payload.text)
            setData((d) => ({
              ...d,
              messages: d.messages.map((m) =>
                m.id === "streaming"
                  ? { ...m, content: m.content + payload.text }
                  : m,
              ),
            }));
          if (event === "error")
            throw new Error(payload.error || "Generation failed");
        }
      }
      const detail = await fetchData(conversationId, requestProjectId);
      setData(detail);
      if (detail.files[0]) setActiveFile(detail.files[0].path);
      const syncedProject = detail.projects.find(
        (project) => project.id === requestProjectId,
      );
      if (localDirectory && syncedProject)
        await syncProjectToLocal(localDirectory, syncedProject, detail.files);
      const savedConversation = detail.conversations.find(
        (item) => item.id === conversationId,
      );
      if (savedConversation) {
        setProviderId(savedConversation.provider_id || actualProvider);
        setModelId(savedConversation.model_id || modelId);
      }
      return true;
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        toast.error(e instanceof Error ? e.message : "Generation failed");
      setData((d) => ({
        ...d,
        messages: d.messages.filter((m) => m.id !== "streaming"),
      }));
      return false;
    } finally {
      setGenerating(false);
      abort.current = null;
    }
  };
  const saveFile = async (path: string, content: string) => {
    await action({
      action: "save_file",
      projectId: activeProject,
      path,
      content,
    });
    toast.success("File saved");
    await refresh();
  };
  const createFile = async (path: string, content = "") => {
    await action({
      action: "save_file",
      projectId: activeProject,
      path,
      content,
    });
    setActiveFile(path);
    await refresh();
  };
  const deleteFile = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    await action({ action: "delete_file", projectId: activeProject, path });
    await refresh();
  };
  const renameFile = async (path: string, newPath: string) => {
    await action({
      action: "rename_file",
      projectId: activeProject,
      path,
      newPath,
    });
    setActiveFile(newPath);
    await refresh();
  };
  const resolve = async (id: string, status: "applied" | "rejected") => {
    await action({ action: "resolve_change", id, status });
    await refresh();
  };
  const resolveAll = async (status: "applied" | "rejected") => {
    await action({
      action: "resolve_all_changes",
      projectId: activeProject,
      status,
    });
    await refresh();
  };
  const commit = async () => {
    const message = prompt("Commit message", "Update project");
    if (!message) return;
    const result = await action<{ id: string; files: number }>({
      action: "git_commit",
      projectId: activeProject,
      message,
    });
    toast.success(`Committed ${result.files} files`);
  };
  const upload = async (files: FileList) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    if (activeProject) form.set("projectId", activeProject);
    if (activeId) form.set("conversationId", activeId);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        error?: string;
        files: Array<{ id: string }>;
      };
      if (!response.ok) throw new Error(result.error || "Upload failed");
      toast.success(
        `${result.files.length} file${result.files.length === 1 ? "" : "s"} uploaded`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };
  const exportConversation = () => {
    const name = (conversation?.title || "conversation").replace(
      /[^a-z0-9-_]+/gi,
      "-",
    );
    download(
      `${name}.md`,
      data.messages
        .map(
          (m) =>
            `## ${m.role === "user" ? "You" : "Assistant"}\n\n${m.content}`,
        )
        .join("\n\n---\n\n"),
      "text/markdown",
    );
  };
  const exportConversationJson = () => {
    const name = (conversation?.title || "conversation").replace(
      /[^a-z0-9-_]+/gi,
      "-",
    );
    download(
      `${name}.json`,
      JSON.stringify({ conversation, messages: data.messages }, null, 2),
    );
  };
  const exportProject = () => {
    const project = data.projects.find((p) => p.id === activeProject);
    const zipped = zipSync(
      Object.fromEntries(data.files.map((f) => [f.path, strToU8(f.content)])),
    );
    const url = URL.createObjectURL(
      new Blob([zipped], { type: "application/zip" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(project?.name || "project").replace(/[^a-z0-9-_]+/gi, "-")}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chatView = (
    <ChatPane
      conversation={conversation}
      messages={data.messages}
      providers={data.providers}
      models={models}
      modelLoading={modelsLoading}
      selectedProvider={providerId}
      selectedModel={modelId}
      onProvider={(id) => {
        setProviderId(id);
        setModelId(undefined);
      }}
      onModel={setModelId}
      onSend={send}
      onStop={() => abort.current?.abort()}
      onMenu={() => setSidebar(true)}
      onToggleIde={() => {
        setIde(true);
        setMobile("code");
      }}
      onOpenWorkspace={() => {
        setIde(true);
        setMobile("code");
      }}
      generating={generating}
      projectMode={projectMode}
      onUpload={upload}
    />
  );
  if (loading)
    return (
      <div className="grid h-dvh place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-violet-400" />
      </div>
    );
  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        <Sidebar
          open={sidebar}
          onClose={() => setSidebar(false)}
          conversations={data.conversations}
          projects={data.projects}
          folders={data.folders}
          activeId={activeId}
          search={search}
          setSearch={setSearch}
          onSelect={selectConversation}
          onNewChat={newChat}
          onNewProject={newProject}
          onNewFolder={newFolder}
          onSettings={() => setSettings(true)}
          onUsage={() => setUsage(true)}
          onManageConversation={manageConversation}
          onDeleteConversation={deleteConversation}
          onManageProject={manageProject}
          onMove={async (id, targetId) => {
            const isProject = data.projects.some(
              (project) => project.id === targetId,
            );
            await action({
              action: "update_conversation",
              id,
              ...(isProject
                ? { project_id: targetId, folder_id: null }
                : { folder_id: targetId, project_id: null }),
            });
            await load();
          }}
        />
        {wideLayout ? (
          <div className="min-w-0 flex-1">
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel
                defaultSize={projectMode && ide ? 56 : 100}
                minSize={35}
              >
                {chatView}
              </ResizablePanel>
              {projectMode && ide && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={44} minSize={30}>
                    <IdePane
                      files={data.files}
                      changes={data.changes}
                      activeFile={activeFile}
                      setActiveFile={setActiveFile}
                      onSave={saveFile}
                      onCreate={createFile}
                      onDelete={deleteFile}
                      onRename={renameFile}
                      onResolve={resolve}
                      onResolveAll={resolveAll}
                      onCommit={commit}
                      onClose={() => {
                        setIde(false);
                        setMobile("chat");
                      }}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </div>
        ) : mobile === "code" && projectMode ? (
          <div className="min-w-0 flex-1">
            <IdePane
              files={data.files}
              changes={data.changes}
              activeFile={activeFile}
              setActiveFile={setActiveFile}
              onSave={saveFile}
              onCreate={createFile}
              onDelete={deleteFile}
              onRename={renameFile}
              onResolve={resolve}
              onResolveAll={resolveAll}
              onCommit={commit}
              onClose={() => setMobile("chat")}
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1">{chatView}</div>
        )}
      </div>
      {projectMode && (
        <div className="fixed bottom-[max(8px,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-xl border bg-card p-1 shadow-xl lg:hidden">
          <button
            onClick={() => setMobile("chat")}
            className={`rounded-lg px-4 py-2 text-sm ${mobile === "chat" ? "bg-accent" : "text-muted-foreground"}`}
          >
            Chat
          </button>
          <button
            onClick={() => {
              setIde(true);
              setMobile("code");
            }}
            className={`rounded-lg px-4 py-2 text-sm ${mobile === "code" ? "bg-accent" : "text-muted-foreground"}`}
          >
            Code {data.changes.length ? `(${data.changes.length})` : ""}
          </button>
        </div>
      )}
      <div className="fixed right-3 top-16 z-30 flex flex-col gap-2">
        <button
          onClick={exportConversation}
          title="Export conversation as Markdown"
          className="rounded-lg border bg-card p-2 text-muted-foreground shadow hover:text-foreground"
        >
          <Download className="size-4" />
        </button>
        <button
          onClick={exportConversationJson}
          title="Export conversation as JSON"
          className="rounded-lg border bg-card px-2 py-1.5 font-mono text-xs text-muted-foreground shadow hover:text-foreground"
        >{`{ }`}</button>
        {projectMode && (
          <button
            onClick={exportProject}
            title="Export project ZIP"
            className="rounded-lg border bg-card p-2 text-muted-foreground shadow hover:text-foreground"
          >
            <PanelRight className="size-4" />
          </button>
        )}
      </div>
      <SettingsDialog
        open={settings}
        onOpenChange={setSettings}
        providers={data.providers}
        settings={data.settings}
        localFolderName={localDirectory?.name}
        localFolderSupported={supportsLocalWorkspace()}
        onChooseLocalFolder={async () => {
          try {
            const directory = await chooseLocalWorkspace();
            setLocalDirectory(directory);
            const project = data.projects.find(
              (item) => item.id === activeProject,
            );
            if (project)
              await syncProjectToLocal(directory, project, data.files);
            toast.success(
              project
                ? `Project synced to ${directory.name}`
                : `Local workspace set to ${directory.name}`,
            );
          } catch (error) {
            if ((error as Error).name !== "AbortError")
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Could not open that folder",
              );
          }
        }}
        activeProjectId={activeProject}
        activeProjectName={
          data.projects.find((project) => project.id === activeProject)?.name
        }
        onChanged={() => refresh()}
      />
      <UsageDialog
        open={usage}
        onOpenChange={setUsage}
        rows={data.usage}
        monthlyRows={data.monthlyUsage}
        budget={Number(data.settings.monthlyBudget ?? 20)}
      />
    </main>
  );
}

function smartScore(model: Model, projectMode: boolean) {
  const capabilities = model.capabilities;
  const capabilityScore =
    (capabilities.reasoning ? 5 : 0) +
    (capabilities.vision ? 2 : 0) +
    (capabilities.tools ? 5 : 0) +
    (capabilities.structuredOutputs ? 5 : 0) +
    Math.min(5, (capabilities.contextWindow ?? 0) / 100_000);
  const codingBonus =
    projectMode && capabilities.tools && capabilities.structuredOutputs ? 8 : 0;
  const knownCostPenalty = capabilities.inputPricePerMillion
    ? Math.min(6, capabilities.inputPricePerMillion / 5)
    : 1;
  return capabilityScore + codingBonus - knownCostPenalty;
}
