import { database } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/crypto";
import type { ChatMessage } from "@/lib/ai/types";
import {
  isGitHubRequest,
  repositoryFromPrompt,
} from "@/lib/integrations/github-selection";

const githubBase = "https://api.github.com";

type GitHubIntegration = {
  token: string;
  login: string;
};

type Repository = {
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

export async function githubContextForPrompt(
  userId: string,
  prompt: string,
): Promise<ChatMessage | null> {
  if (!isGitHubRequest(prompt)) return null;
  const integration = await connectedGitHub(userId);
  if (!integration) {
    return {
      role: "system",
      content:
        "GitHub was mentioned, but no GitHub connection is configured in Aster. Explain that the user can connect one under Settings → Connections.",
    };
  }

  try {
    const [account, repositories] = await Promise.all([
      github<{ login: string; name: string | null }>(integration, "/user"),
      github<Repository[]>(
        integration,
        "/user/repos?per_page=100&sort=updated&affiliation=owner%2Ccollaborator%2Corganization_member",
      ),
    ]);
    const selected = repositoryFromPrompt(prompt, repositories);
    const details = selected
      ? await repositoryDetails(integration, selected)
      : undefined;
    const payload = {
      account: { login: account.login, name: account.name },
      access: {
        live: true,
        mode: "read repository data in chat; create and push repositories from project workspaces",
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
        "Aster has a working GitHub connection. The following is live data fetched server-side for this request.",
        "Never claim that GitHub is unavailable when this context is present. Answer from this data and be explicit about what was inspected.",
        "The GitHub token itself is never available to you. Do not request it from the user.",
        JSON.stringify(payload),
      ].join("\n"),
    };
  } catch (error) {
    return {
      role: "system",
      content: `Aster has a GitHub connection, but the live GitHub lookup failed for this request: ${safeError(error)}. Explain the failure without asking the user to paste a token.`,
    };
  }
}

async function connectedGitHub(
  userId: string,
): Promise<GitHubIntegration | null> {
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
  integration: GitHubIntegration,
  repository: Repository,
) {
  const path = `/repos/${repository.full_name}`;
  const [contents, commits, pulls, issues] = await Promise.all([
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
  ]);
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
  };
}

async function github<T>(integration: GitHubIntegration, path: string) {
  const response = await fetch(`${githubBase}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${integration.token}`,
      "user-agent": "Aster-Workspace",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }
  return (await response.json()) as T;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : "Unknown error";
}
