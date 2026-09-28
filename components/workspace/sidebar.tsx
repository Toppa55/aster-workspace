"use client";
import {
  Archive,
  Bot,
  Folder,
  FolderKanban,
  Gauge,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import type { Conversation, Project } from "./types";

export function Sidebar({
  open,
  onClose,
  conversations,
  projects,
  folders,
  activeId,
  search,
  setSearch,
  onSelect,
  onNewChat,
  onNewProject,
  onNewFolder,
  onSettings,
  onUsage,
  onMove,
  onManageConversation,
  onManageProject,
}: {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  projects: Project[];
  folders: Array<{ id: string; name: string }>;
  activeId?: string;
  search: string;
  setSearch: (v: string) => void;
  onSelect: (c: Conversation) => void;
  onNewChat: () => void;
  onNewProject: () => void;
  onNewFolder: () => void;
  onSettings: () => void;
  onUsage: () => void;
  onMove: (conversationId: string, projectId: string | null) => void;
  onManageConversation: (conversation: Conversation) => void;
  onManageProject: (project: Project) => void;
}) {
  const visible = conversations.filter(
    (c) => !c.archived && c.title.toLowerCase().includes(search.toLowerCase()),
  );
  const pinned = visible.filter((c) => c.pinned);
  const recent = visible.filter((c) => !c.pinned);
  const item = (c: Conversation) => (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/conversation", c.id)}
      key={c.id}
      className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${activeId === c.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
    >
      <button
        onClick={() => onSelect(c)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Bot className="size-4 shrink-0" />
        <span className="truncate">{c.title}</span>
      </button>
      {c.pinned ? <Pin className="ml-auto size-3 text-violet-400" /> : null}
      <button
        onClick={() => onManageConversation(c)}
        className="hidden rounded p-0.5 group-hover:block"
        aria-label={`Manage ${c.title}`}
      >
        <MoreHorizontal className="size-3.5" />
      </button>
    </div>
  );
  return (
    <aside
      className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-[286px] flex-col border-r border-border bg-sidebar p-3 shadow-2xl lg:static lg:flex lg:shadow-none`}
    >
      <div className="flex h-11 items-center gap-2 px-2">
        <div className="grid size-8 place-items-center rounded-xl bg-[linear-gradient(135deg,#6d5dfc,#2dd4bf)] text-white">
          <Sparkles className="size-4" />
        </div>
        <span className="font-semibold tracking-tight">Aster</span>
        <button
          onClick={onClose}
          className="ml-auto rounded-lg p-2 hover:bg-accent lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <MessageSquarePlus className="size-4" />
          New chat
        </button>
        <button
          onClick={onNewProject}
          className="flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium"
        >
          <FolderKanban className="size-4" />
          Project
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-xl border bg-card/60 px-3 py-2.5 text-sm text-muted-foreground">
        <Search className="size-4" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
          placeholder="Search chats & projects"
        />
      </label>
      <nav className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        {pinned.length > 0 && (
          <>
            <p className="px-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
              Pinned
            </p>
            <div className="mt-2 space-y-1">{pinned.map(item)}</div>
          </>
        )}
        <p className="mt-5 px-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
          Recent
        </p>
        <div className="mt-2 space-y-1">
          {recent.slice(0, 30).map(item)}
          {visible.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No matching chats.
            </p>
          ) : null}
        </div>
        <div className="mt-5 flex items-center px-2">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
            Folders
          </p>
          <button
            onClick={onNewFolder}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Create folder"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {folders.map((folder) => (
            <div
              key={folder.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) =>
                onMove(
                  event.dataTransfer.getData("text/conversation"),
                  folder.id,
                )
              }
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              <Folder className="size-4" />
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto text-[11px]">
                {
                  conversations.filter((chat) => chat.folder_id === folder.id)
                    .length
                }
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center px-2">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
            Projects
          </p>
          <span className="ml-auto text-xs text-muted-foreground">
            {projects.length}
          </span>
        </div>
        <div className="mt-2 space-y-1">
          {projects
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((project) => (
              <div
                key={project.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  onMove(
                    e.dataTransfer.getData("text/conversation"),
                    project.id,
                  )
                }
                className="rounded-lg"
              >
                <button
                  onClick={() => {
                    const c = conversations.find(
                      (x) => x.project_id === project.id,
                    );
                    if (c) onSelect(c);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
                >
                  <Folder className="size-4" />
                  <span className="truncate">{project.name}</span>
                  <MoreHorizontal
                    onClick={(event) => {
                      event.stopPropagation();
                      onManageProject(project);
                    }}
                    className="ml-auto size-3.5"
                  />
                </button>
              </div>
            ))}
          <button
            onClick={onNewProject}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="size-4" />
            New project
          </button>
        </div>
        <div className="mt-5 space-y-1 border-t pt-4">
          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent">
            <Archive className="size-4" />
            Archived
          </button>
          <button
            onClick={onUsage}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Gauge className="size-4" />
            Usage & costs
          </button>
        </div>
      </nav>
      <button
        onClick={onSettings}
        className="mt-2 flex items-center gap-3 rounded-xl border bg-card/60 p-2.5 text-left"
      >
        <div className="grid size-8 place-items-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">
          AI
        </div>
        <div>
          <div className="text-sm font-medium">Workspace settings</div>
          <div className="text-xs text-muted-foreground">Private · BYOK</div>
        </div>
        <Settings className="ml-auto size-4 text-muted-foreground" />
      </button>
    </aside>
  );
}
