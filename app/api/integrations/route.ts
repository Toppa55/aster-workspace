import { authError, requireUser } from "@/lib/server/auth";
import { database, id, now, rows } from "@/lib/server/db";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

const githubBase = "https://api.github.com";

export async function GET() {
  try {
    const user = await requireUser();
    const integrations = await rows(
      database()
        .prepare(
          "SELECT id,type,name,secret_hint,config,enabled,created_at,updated_at FROM integrations WHERE user_id=? ORDER BY name",
        )
        .bind(user.id),
    );
    return Response.json({ integrations });
  } catch (error) {
    return authError(error) ?? fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    const db = database();
    if (action === "save_github") {
      const token = String(body.token || "").trim();
      if (!token)
        return Response.json(
          { error: "GitHub token is required" },
          { status: 400 },
        );
      const account = await github<{ login: string; name?: string }>(
        token,
        "/user",
      );
      const existing = await db
        .prepare(
          "SELECT id FROM integrations WHERE user_id=? AND type='github' LIMIT 1",
        )
        .bind(user.id)
        .first<{ id: string }>();
      const integrationId = existing?.id ?? id();
      const encrypted = await encryptSecret(token);
      const time = now();
      await db
        .prepare(
          "INSERT INTO integrations (id,user_id,type,name,encrypted_secret,secret_hint,config,enabled,created_at,updated_at) VALUES (?,?,'github',?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,encrypted_secret=excluded.encrypted_secret,secret_hint=excluded.secret_hint,config=excluded.config,enabled=1,updated_at=excluded.updated_at WHERE user_id=excluded.user_id",
        )
        .bind(
          integrationId,
          user.id,
          account.name || account.login,
          encrypted,
          keyHint(token),
          JSON.stringify({ login: account.login }),
          time,
          time,
        )
        .run();
      return Response.json({
        id: integrationId,
        login: account.login,
        hint: keyHint(token),
      });
    }
    if (action === "remove") {
      await db
        .prepare("DELETE FROM integrations WHERE id=? AND user_id=?")
        .bind(String(body.id), user.id)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "test") {
      const integration = await githubIntegration(user.id, String(body.id));
      const account = await github<{ login: string }>(
        integration.token,
        "/user",
      );
      return Response.json({ ok: true, login: account.login });
    }
    if (action === "publish_github") {
      const integration = await githubIntegration(
        user.id,
        String(body.integrationId),
      );
      const owner = safeName(String(body.owner || integration.login));
      const repo = safeName(String(body.repo || ""));
      const branch = safeBranch(String(body.branch || "main"));
      const projectId = String(body.projectId || "");
      const project = await db
        .prepare("SELECT id,name FROM projects WHERE id=? AND user_id=?")
        .bind(projectId, user.id)
        .first<{ id: string; name: string }>();
      if (!project)
        return Response.json({ error: "Project not found" }, { status: 404 });
      const files = await rows<{ path: string; content: string }>(
        db
          .prepare(
            "SELECT path,content FROM project_files WHERE project_id=? ORDER BY path",
          )
          .bind(projectId),
      );
      if (!files.length)
        return Response.json(
          { error: "Apply at least one project file before publishing" },
          { status: 400 },
        );
      const result = await publishSnapshot({
        token: integration.token,
        login: integration.login,
        owner,
        repo,
        branch,
        files,
        message: String(body.message || `Update ${project.name}`).slice(0, 200),
        create: body.create === true,
        privateRepo: body.private !== false,
      });
      return Response.json(result);
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return authError(error) ?? fail(error);
  }
}

async function githubIntegration(userId: string, integrationId: string) {
  const row = await database()
    .prepare(
      "SELECT encrypted_secret,config FROM integrations WHERE id=? AND user_id=? AND type='github' AND enabled=1",
    )
    .bind(integrationId, userId)
    .first<{ encrypted_secret: string; config: string }>();
  if (!row) throw new Error("GitHub connection not found");
  const config = JSON.parse(row.config || "{}") as { login?: string };
  return {
    token: await decryptSecret(row.encrypted_secret),
    login: config.login || "",
  };
}

async function publishSnapshot(options: {
  token: string;
  login: string;
  owner: string;
  repo: string;
  branch: string;
  files: Array<{ path: string; content: string }>;
  message: string;
  create: boolean;
  privateRepo: boolean;
}) {
  let repository = await githubMaybe<{ default_branch: string }>(
    options.token,
    `/repos/${options.owner}/${options.repo}`,
  );
  if (!repository && options.create) {
    if (options.owner.toLowerCase() !== options.login.toLowerCase())
      throw new Error(
        "Automatic repository creation is available only for your own GitHub account. Create the organization repository first.",
      );
    repository = await github<{ default_branch: string }>(
      options.token,
      "/user/repos",
      {
        method: "POST",
        body: JSON.stringify({
          name: options.repo,
          private: options.privateRepo,
          auto_init: true,
          description: "Published from Aster AI Workspace",
        }),
      },
    );
  }
  if (!repository)
    throw new Error(
      "Repository not found. Enable ‘Create repository’ or enter an existing repository.",
    );
  const sourceBranch = options.branch || repository.default_branch || "main";
  let ref = await githubMaybe<{ object: { sha: string } }>(
    options.token,
    `/repos/${options.owner}/${options.repo}/git/ref/heads/${encodeURIComponent(sourceBranch)}`,
  );
  if (!ref && sourceBranch !== repository.default_branch) {
    const base = await github<{ object: { sha: string } }>(
      options.token,
      `/repos/${options.owner}/${options.repo}/git/ref/heads/${encodeURIComponent(repository.default_branch)}`,
    );
    await github(
      options.token,
      `/repos/${options.owner}/${options.repo}/git/refs`,
      {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${sourceBranch}`,
          sha: base.object.sha,
        }),
      },
    );
    ref = { object: { sha: base.object.sha } };
  }
  if (!ref) throw new Error("The repository has no branch to publish to");
  const blobs = await Promise.all(
    options.files.map(async (file) => {
      const blob = await github<{ sha: string }>(
        options.token,
        `/repos/${options.owner}/${options.repo}/git/blobs`,
        {
          method: "POST",
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        },
      );
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );
  const tree = await github<{ sha: string }>(
    options.token,
    `/repos/${options.owner}/${options.repo}/git/trees`,
    { method: "POST", body: JSON.stringify({ tree: blobs }) },
  );
  const commit = await github<{ sha: string; html_url?: string }>(
    options.token,
    `/repos/${options.owner}/${options.repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: options.message,
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    },
  );
  await github(
    options.token,
    `/repos/${options.owner}/${options.repo}/git/refs/heads/${encodeURIComponent(sourceBranch)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    },
  );
  return {
    ok: true,
    commit: commit.sha,
    url: `https://github.com/${options.owner}/${options.repo}/commit/${commit.sha}`,
    repositoryUrl: `https://github.com/${options.owner}/${options.repo}`,
    branch: sourceBranch,
    files: options.files.length,
  };
}

async function github<T = unknown>(
  token: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`${githubBase}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2026-03-10",
      "user-agent": "aster-workspace",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      `GitHub request failed (${response.status}): ${detail.message || response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

async function githubMaybe<T>(token: string, path: string) {
  const response = await fetch(`${githubBase}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2026-03-10",
      "user-agent": "aster-workspace",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GitHub request failed (${response.status})`);
  return (await response.json()) as T;
}

function safeName(value: string) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(value))
    throw new Error("Enter a valid GitHub owner and repository name");
  return value;
}

function safeBranch(value: string) {
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(value) || value.includes(".."))
    throw new Error("Enter a valid branch name");
  return value;
}

function fail(error: unknown) {
  console.error(
    "Integration API error",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}
