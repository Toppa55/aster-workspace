import type { Project, ProjectFile } from "./types";

export type LocalDirectoryHandle = {
  kind: "directory";
  name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<LocalDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{
      write(data: string): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(options?: {
    mode?: "read" | "readwrite";
  }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(options?: {
    mode?: "read" | "readwrite";
  }): Promise<"granted" | "denied" | "prompt">;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<LocalDirectoryHandle>;
  }
}

const DB_NAME = "astrid-local-workspace";
const STORE_NAME = "handles";
const HANDLE_KEY = "workspace-root";
const MANIFEST = ".astrid-workspace.json";

export function supportsLocalWorkspace() {
  return typeof window !== "undefined" && !!window.showDirectoryPicker;
}

export async function chooseLocalWorkspace() {
  if (!window.showDirectoryPicker)
    throw new Error(
      "Local folder sync requires Chrome or Edge on desktop. It is not available in this browser.",
    );
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await saveHandle(handle);
  return handle;
}

export async function storedLocalWorkspace() {
  if (!supportsLocalWorkspace()) return undefined;
  const handle = await readHandle();
  if (!handle) return undefined;
  const permission = await handle.queryPermission?.({ mode: "readwrite" });
  return permission === "granted" ? handle : undefined;
}

export async function syncProjectToLocal(
  root: LocalDirectoryHandle,
  project: Project,
  files: ProjectFile[],
) {
  const folderName = `${slug(project.name) || "project"}-${project.id.slice(0, 6)}`;
  const projectFolder = await root.getDirectoryHandle(folderName, {
    create: true,
  });
  const previous = await readManifest(projectFolder);
  const current = files.map((file) => safeParts(file.path).join("/"));
  for (const file of files)
    await writeFile(projectFolder, safeParts(file.path), file.content);
  for (const oldPath of previous.files)
    if (!current.includes(oldPath)) await removeFile(projectFolder, oldPath);
  await writeFile(
    projectFolder,
    [MANIFEST],
    JSON.stringify(
      {
        projectId: project.id,
        projectName: project.name,
        files: current,
        syncedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return folderName;
}

async function writeFile(
  root: LocalDirectoryHandle,
  parts: string[],
  content: string,
) {
  let directory = root;
  for (const part of parts.slice(0, -1))
    directory = await directory.getDirectoryHandle(part, { create: true });
  const file = await directory.getFileHandle(parts.at(-1)!, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

async function removeFile(root: LocalDirectoryHandle, path: string) {
  try {
    const parts = safeParts(path);
    let directory = root;
    for (const part of parts.slice(0, -1))
      directory = await directory.getDirectoryHandle(part);
    await directory.removeEntry(parts.at(-1)!);
  } catch {
    // The local file may already have been removed by the user.
  }
}

async function readManifest(root: LocalDirectoryHandle) {
  try {
    const handle = await root.getFileHandle(MANIFEST);
    const value = JSON.parse(await (await handle.getFile()).text()) as {
      files?: string[];
    };
    return { files: Array.isArray(value.files) ? value.files : [] };
  } catch {
    return { files: [] as string[] };
  }
}

function safeParts(path: string) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === ".."))
    throw new Error(`Unsafe workspace path: ${path}`);
  return parts;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle: LocalDirectoryHandle) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readHandle() {
  const db = await openDatabase();
  const handle = await new Promise<LocalDirectoryHandle | undefined>(
    (resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(HANDLE_KEY);
      request.onsuccess = () =>
        resolve(request.result as LocalDirectoryHandle | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  db.close();
  return handle;
}
