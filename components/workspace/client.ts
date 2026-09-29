export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      (data as { error?: string }).error ||
        `Request failed (${response.status})`,
      response.status,
    );
  return data as T;
}
export const action = <T = unknown>(body: Record<string, unknown>) =>
  api<T>("/api/workspace", { method: "POST", body: JSON.stringify(body) });
export const providerAction = <T = unknown>(body: Record<string, unknown>) =>
  api<T>("/api/providers", { method: "POST", body: JSON.stringify(body) });
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function language(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    (
      {
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        py: "python",
        css: "css",
        html: "html",
        json: "json",
        md: "markdown",
        sql: "sql",
        yml: "yaml",
        yaml: "yaml",
        sh: "shell",
      } as Record<string, string>
    )[ext || ""] || "plaintext"
  );
}
