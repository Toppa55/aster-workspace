"use client";
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
  Braces,
  Check,
  Copy,
  FilePlus,
  Files,
  FolderPlus,
  GitBranch,
  GitCommit,
  MoreHorizontal,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Change, ProjectFile } from "./types";
import { language } from "./client";

export function IdePane({
  files,
  changes,
  activeFile,
  setActiveFile,
  onSave,
  onCreate,
  onDelete,
  onRename,
  onResolve,
  onResolveAll,
  onCommit,
  onClose,
}: {
  files: ProjectFile[];
  changes: Change[];
  activeFile?: string;
  setActiveFile: (p: string) => void;
  onSave: (path: string, content: string) => void;
  onCreate: (path: string, content?: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newPath: string) => void;
  onResolve: (id: string, status: "applied" | "rejected") => void;
  onResolveAll: (status: "applied" | "rejected") => void;
  onCommit: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"files" | "changes">("files");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const selected = files.find((f) => f.path === activeFile) || files[0];
  const selectedChange =
    changes.find((c) => c.path === activeFile) || changes[0];
  useEffect(() => {
    if (!selected) return;
    // Reset after React has committed the newly selected persisted file.
    queueMicrotask(() => {
      setDraft(selected.content);
      setDirty(false);
    });
  }, [selected]);
  const tree = useMemo(() => files.map((f) => f.path).sort(), [files]);
  const create = () => {
    const path = prompt("New file path", "src/new-file.ts");
    if (path) onCreate(path);
  };
  const createFolder = () => {
    const folder = prompt("New folder path", "src/components");
    if (!folder) return;
    const normalized = folder.replace(/^\/+|\/+$/g, "");
    onCreate(`${normalized}/README.md`, `# ${normalized.split("/").at(-1)}\n`);
  };
  const duplicate = () => {
    if (!selected) return;
    const extension = selected.path.includes(".")
      ? `.${selected.path.split(".").at(-1)}`
      : "";
    const stem = extension
      ? selected.path.slice(0, -extension.length)
      : selected.path;
    const path = prompt("Duplicate file as", `${stem}.copy${extension}`);
    if (path) onCreate(path, selected.content);
  };
  return (
    <aside className="flex h-full min-w-0 flex-col bg-[#0b0d12] text-zinc-100">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <button
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
        >
          <X className="size-4" />
        </button>
        <Braces className="size-4 text-violet-400" />
        <span className="text-sm font-medium">Workspace</span>
        {changes.length > 0 && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-300">
            {changes.length} changes
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {changes.length > 0 && (
            <>
              <button
                onClick={() => onResolveAll("applied")}
                className="rounded-md bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300"
              >
                Apply all
              </button>
              <button
                onClick={() => onResolveAll("rejected")}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/10"
              >
                Reject all
              </button>
            </>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="w-44 shrink-0 border-r border-white/10 bg-[#0d1016] sm:w-52">
          <div className="flex h-10 border-b border-white/10">
            <button
              onClick={() => setTab("files")}
              className={`flex-1 text-xs ${tab === "files" ? "border-b-2 border-violet-500 text-white" : "text-zinc-500"}`}
            >
              Files
            </button>
            <button
              onClick={() => setTab("changes")}
              className={`flex-1 text-xs ${tab === "changes" ? "border-b-2 border-violet-500 text-white" : "text-zinc-500"}`}
            >
              Changes {changes.length || ""}
            </button>
          </div>
          {tab === "files" ? (
            <>
              <div className="flex items-center gap-1 px-2 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Explorer
                </span>
                <button
                  onClick={create}
                  className="ml-auto rounded p-1 hover:bg-white/10"
                >
                  <FilePlus className="size-3.5" />
                </button>
                <button
                  onClick={createFolder}
                  title="Create folder"
                  className="rounded p-1 hover:bg-white/10"
                >
                  <FolderPlus className="size-3.5" />
                </button>
              </div>
              <div className="overflow-y-auto px-1">
                {tree.map((path) => (
                  <div
                    key={path}
                    className={`group flex items-center rounded ${selected?.path === path ? "bg-violet-500/15 text-violet-300" : "text-zinc-400 hover:bg-white/5"}`}
                  >
                    <button
                      onClick={() => setActiveFile(path)}
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left font-mono text-[11px]"
                    >
                      <Files className="mr-1 inline size-3" />
                      {path}
                    </button>
                    <button
                      onClick={() => {
                        const next = prompt("Rename file", path);
                        if (next && next !== path) onRename(path, next);
                      }}
                      className="hidden p-1 group-hover:block"
                    >
                      <MoreHorizontal className="size-3" />
                    </button>
                    <button
                      onClick={() => onDelete(path)}
                      className="hidden p-1 text-red-400 group-hover:block"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-1 p-1">
              {changes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveFile(c.path)}
                  className={`w-full rounded px-2 py-2 text-left text-xs ${selectedChange?.id === c.id ? "bg-amber-400/10 text-amber-200" : "text-zinc-400 hover:bg-white/5"}`}
                >
                  <span className="block truncate font-mono">{c.path}</span>
                  <span className="capitalize text-zinc-500">
                    {c.operation.replace("_", " ")}
                  </span>
                </button>
              ))}
              {changes.length === 0 && (
                <p className="p-3 text-xs leading-5 text-zinc-500">
                  No proposed changes. Ask the AI to modify this project.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedChange && tab === "changes" ? (
            <>
              <div className="flex h-10 items-center border-b border-white/10 px-3 font-mono text-xs">
                <span className="truncate">{selectedChange.path}</span>
                <button
                  onClick={() => onResolve(selectedChange.id, "applied")}
                  className="ml-auto flex items-center gap-1 rounded bg-emerald-400/10 px-2 py-1 text-emerald-300"
                >
                  <Check className="size-3" />
                  Apply
                </button>
                <button
                  onClick={() => onResolve(selectedChange.id, "rejected")}
                  className="ml-1 rounded px-2 py-1 text-zinc-400 hover:bg-white/10"
                >
                  Reject
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <DiffEditor
                  original={selectedChange.before_content || ""}
                  modified={selectedChange.after_content || ""}
                  language={language(selectedChange.path)}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    automaticLayout: true,
                  }}
                />
              </div>
            </>
          ) : selected ? (
            <>
              <div className="flex h-10 items-center border-b border-white/10 px-3 font-mono text-xs">
                <span className="truncate">{selected.path}</span>
                {dirty && (
                  <span className="ml-2 size-1.5 rounded-full bg-amber-400" />
                )}
                <button
                  onClick={duplicate}
                  title="Duplicate file"
                  className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-zinc-400 hover:bg-white/10"
                >
                  <Copy className="size-3" />
                  Duplicate
                </button>
                <button
                  disabled={!dirty}
                  onClick={() => {
                    onSave(selected.path, draft);
                    setDirty(false);
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-zinc-400 hover:bg-white/10 disabled:opacity-30"
                >
                  <Save className="size-3" />
                  Save
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <Editor
                  value={draft}
                  onChange={(value) => {
                    setDraft(value || "");
                    setDirty(true);
                  }}
                  language={language(selected.path)}
                  theme="vs-dark"
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    wordWrap: "on",
                    formatOnPaste: true,
                    formatOnType: true,
                    automaticLayout: true,
                    tabSize: 2,
                  }}
                />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-center text-sm text-zinc-500">
              <div>
                <Files className="mx-auto mb-2 size-6" />
                Create a file or ask the AI to build something.
              </div>
            </div>
          )}
          <div className="flex h-7 items-center bg-violet-600 px-3 text-[11px]">
            <GitBranch className="mr-1.5 size-3" />
            main
            <button
              onClick={onCommit}
              className="ml-3 flex items-center gap-1 rounded px-1.5 hover:bg-white/15"
            >
              <GitCommit className="size-3" />
              Commit
            </button>
            <span className="ml-auto">
              {selected ? language(selected.path) : "Aster project"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
