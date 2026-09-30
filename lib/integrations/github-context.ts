import { database, id, now } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/crypto";
import type { ChatMessage } from "@/lib/ai/types";
import {
  isGitHubRequest,
  repositoryFromPrompt,
} from "@/lib/integrations/github-selection";
import {
  github,
  loadRepositorySource,
  type GitHubCredential,
  type GitHubRepository,
} from "@/lib/integrations/github-repository";

export async function githubContextForPrompt(
  userId: string,
  prompt: string,
  projectId?: string | null,
): Promise<ChatMessage | null> {
  if (!isGitHubRequest(prompt)) return null;
  const integration = await connectedGitHub(userId);
  if (!integration) {
    return {
      role: "system",
      content:
        "GitHub was mentioned, but no GitHub connection is configured in Astrid. Explain that the user can connect one under Settings → Connections.",
    };
  }

  try {
    const [account, repositories] = await Promise.all([
      github<{ login: string; name: string | null }>(integration, "/user"),
      github<GitHubRepository[]>(
        integration,
        "/user/repos?per_page=100&sort=updated&affiliation=owner%2Ccollaborator%2Corganization_member",
      ),
    ]);
    const selected = repositoryFromPrompt(prompt, repositories);
    const details = selected
      ? await repositoryDetails(
          integration,
          selected,
          prompt,
          projectId,
          userId,
        )
      : undefined;
    const payload = {
      account: { login: account.login, name: account.name },
      access: {
        live: true,
        mode: "read repository source; import into project workspaces; stage edits for approval; explicitly commit and push approved files",
      },
      repositories: repositories.slice(0, 30).map((repository) => ({
        name: repository.full_name,
        private: repository.private,
        description: repository.description,
        defaultBranch: repository.default_branch,
        language: repository.language,
        updatedAt: repository.updated_at,
        openIssues: repository.open_issues_count,
        url: repository.html_url,
      })),
      selectedRepository: details,
    };
    return {
      role: "system",
      content: [
        "Astrid has a working GitHub connection. The following is live data fetched server-side for this request.",
        "Never claim that GitHub or source-file access is unavailable when this context contains sourceFiles or importedFiles. Answer from the actual source and name the files inspected.",
        "Only the selected, bounded source files were retrieved. Do not claim to have inspected files not listed here.",
        "The GitHub token itself is never available to you. Do not request it from the user.",
        JSON.stringify(payload),
      ].join("\n"),
    };
  } catch (error) {
    return {
      role: "system",
      content: `Astrid has a GitHub connection, but the live GitHub lookup failed for this request: ${safeError(error)}. Explain the failure without asking the user to paste a token.`,
    };
  }
}

async function connectedGitHub(
  userId: string,
): Promise<GitHubCredential | null> {
  const row = await database()
    .prepare(
      "SELECT encrypted_secret,config FROM integrations WHERE user_id=? AND type='github' AND enabled=1 LIMIT 1",
    )
    .bind(userId)
    .first<{ encrypted_secret: string; config: string }>();
  if (!row) return null;
  const config = JSON.parse(row.config || "{}") as { login?: string };
  return {
    token: await decryptSecret(row.encrypted_secret),
    login: config.login || "",
  };
}

async function repositoryDetails(
  integration: GitHubCredential,
  repository: GitHubRepository,
  prompt: string,
  projectId?: string | null,
  userId?: string,
) {
  const path = `/repos/${repository.full_name}`;
  const [contents, commits, pulls, issues, source] = await Promise.all([
    github<
      Array<{ name: string; path: string; type: "file" | "dir"; size: number }>
    >(integration, `${path}/contents`).catch(() => []),
    github<
      Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { name: string; date: string } };
      }>
    >(integration, `${path}/commits?per_page=10`).catch(() => []),
    github<
      Array<{
        number: number;
        title: string;
        state: string;
        html_url: string;
        updated_at: string;
      }>
    >(integration, `${path}/pulls?state=open&per_page=20`).catch(() => []),
    github<
      Array<{
        number: number;
        title: string;
        state: string;
        html_url: string;
        updated_at: string;
        pull_request?: unknown;
      }>
    >(integration, `${path}/issues?state=open&per_page=20`).catch(() => []),
    loadRepositorySource(integration, repository, prompt, {
      maxFiles: projectId ? 180 : 16,
      maxBytes: projectId ? 1_500_000 : 80_000,
    }).catch(() => null),
  ]);
  let importedFiles: string[] | undefined;
  if (projectId && source?.files.length) {
    const project = await database()
      .prepare("SELECT id FROM projects WHERE id=? AND user_id=?")
      .bind(projectId, userId)
      .first<{ id: string }>();
    if (project) {
      const time = now();
      await database().batch(
        source.files.map((file) =>
          database()
            .prepare(
              "INSERT INTO project_files (id,project_id,path,content,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(project_id,path) DO NOTHING",
            )
            .bind(id(), projectId, file.path, file.content, time, time),
        ),
      );
      importedFiles = source.files.map((file) => file.path);
    }
  }
  return {
    name: repository.full_name,
    defaultBranch: repository.default_branch,
    rootFiles: contents.slice(0, 100),
    recentCommits: commits.map((commit) => ({
      sha: commit.sha.slice(0, 12),
      message: commit.commit.message.slice(0, 300),
      author: commit.commit.author.name,
      date: commit.commit.author.date,
      url: commit.html_url,
    })),
    openPullRequests: pulls,
    openIssues: issues.filter((issue) => !issue.pull_request),
    sourceAccess: source
      ? {
          branch: source.branch,
          availableTextFiles: source.availableTextFiles,
          selectedFiles: source.files.length,
          treeTruncated: source.treeTruncated,
        }
      : { error: "GitHub source tree could not be retrieved" },
    importedFiles,
    sourceFiles: projectId
      ? undefined
      : source?.files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
  };
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : "Unknown error";
}
