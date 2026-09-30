const githubBase = "https://api.github.com";

export type GitHubCredential = { token: string; login: string };

export type GitHubRepository = {
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  language: string | null;
  updated_at: string;
  open_issues_count: number;
  html_url: string;
};

type TreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

export type GitHubSourceFile = {
  path: string;
  content: string;
  sha: string;
  size: number;
};

const excludedPath =
  /(^|\/)(\.git|node_modules|vendor|dist|build|coverage|\.next|\.cache|tmp|temp|target|Pods|DerivedData)(\/|$)/i;
const excludedFile =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.lock|poetry\.lock|Cargo\.lock)$/i;
const textExtension =
  /\.(?:[cm]?[jt]sx?|py|rb|php|go|rs|java|kt|kts|swift|cs|c|cc|cpp|cxx|h|hpp|vue|svelte|astro|html?|css|scss|sass|less|mdx?|txt|json|jsonc|ya?ml|toml|ini|conf|config|xml|svg|sql|graphql|gql|sh|bash|zsh|fish|ps1|dockerfile|gitignore|env\.example)$/i;
const textFilename =
  /(^|\/)(README|LICENSE|Makefile|Dockerfile|Procfile|Gemfile|Rakefile|CMakeLists\.txt|\.gitignore|\.env\.example)$/i;

export function isReadableSourcePath(path: string, size = 0) {
  return (
    !!path &&
    size <= 250_000 &&
    !excludedPath.test(path) &&
    !excludedFile.test(path) &&
    (textExtension.test(path) || textFilename.test(path))
  );
}

export function selectSourceEntries(
  entries: TreeEntry[],
  prompt: string,
  options: { maxFiles: number; maxBytes: number },
) {
  const terms = prompt
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((term) => term.length >= 3);
  const important =
    /(^|\/)(README(?:\.md)?|package\.json|tsconfig\.json|next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|src\/app\/(?:page|layout)\.[jt]sx?|app\/(?:page|layout)\.[jt]sx?)$/i;
  let bytes = 0;
  const selected: TreeEntry[] = [];
  const candidates = entries
    .filter(
      (entry) =>
        entry.type === "blob" &&
        isReadableSourcePath(entry.path, entry.size ?? 0),
    )
    .map((entry) => {
      const lower = entry.path.toLowerCase();
      const matches = terms.filter((term) => lower.includes(term)).length;
      const depth = entry.path.split("/").length;
      return {
        entry,
        score: matches * 20 + (important.test(entry.path) ? 14 : 0) - depth,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.entry.size ?? 0) - (b.entry.size ?? 0) ||
        a.entry.path.localeCompare(b.entry.path),
    );
  for (const { entry } of candidates) {
    const size = entry.size ?? 0;
    if (selected.length >= options.maxFiles) break;
    if (selected.length && bytes + size > options.maxBytes) continue;
    selected.push(entry);
    bytes += size;
  }
  return selected;
}

export async function loadRepositorySource(
  integration: GitHubCredential,
  repository: GitHubRepository,
  prompt: string,
  options: { maxFiles?: number; maxBytes?: number } = {},
) {
  const tree = await github<{
    sha: string;
    truncated: boolean;
    tree: TreeEntry[];
  }>(
    integration,
    `/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`,
  );
  const selected = selectSourceEntries(tree.tree, prompt, {
    maxFiles: options.maxFiles ?? 16,
    maxBytes: options.maxBytes ?? 80_000,
  });
  const files = await Promise.all(
    selected.map(async (entry): Promise<GitHubSourceFile | null> => {
      const blob = await github<{ content?: string; encoding?: string }>(
        integration,
        `/repos/${repository.full_name}/git/blobs/${entry.sha}`,
      );
      if (blob.encoding !== "base64" || !blob.content) return null;
      const content = decodeBase64(blob.content.replace(/\s/g, ""));
      if (content.includes("\0")) return null;
      return {
        path: entry.path,
        content,
        sha: entry.sha,
        size: entry.size ?? content.length,
      };
    }),
  );
  return {
    branch: repository.default_branch,
    treeSha: tree.sha,
    treeTruncated: tree.truncated,
    availableTextFiles: tree.tree.filter(
      (entry) =>
        entry.type === "blob" &&
        isReadableSourcePath(entry.path, entry.size ?? 0),
    ).length,
    files: files.filter((file): file is GitHubSourceFile => !!file),
  };
}

export async function github<T>(
  integration: GitHubCredential,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`${githubBase}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${integration.token}`,
      "content-type": "application/json",
      "user-agent": "Astrid-Workspace",
      "x-github-api-version": "2022-11-28",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      `GitHub returned ${response.status}${detail.message ? `: ${detail.message}` : ""}`,
    );
  }
  return (await response.json()) as T;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
