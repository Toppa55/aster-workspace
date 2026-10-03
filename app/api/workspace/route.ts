import { authError, requireUser } from "@/lib/server/auth";
import { database, ensureUser, id, now, rows } from "@/lib/server/db";
import { estimateCost, inferCapabilities } from "@/lib/ai/catalog";
import type { ProviderType } from "@/lib/ai/types";
import { safeAutonomyLevel } from "@/lib/projects/autonomy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await ensureUser(user);
    const db = database();
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    const projectId = url.searchParams.get("projectId");
    const monthStart = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      1,
    );
    const [
      folders,
      projects,
      conversations,
      providers,
      memories,
      usageRaw,
      monthlyUsageRaw,
    ] = await Promise.all([
      rows(
        db
          .prepare(
            "SELECT * FROM folders WHERE user_id=? ORDER BY sort_order,name",
          )
          .bind(user.id),
      ),
      rows(
        db
          .prepare(
            "SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC",
          )
          .bind(user.id),
      ),
      rows(
        db
          .prepare(
            "SELECT * FROM conversations WHERE user_id=? ORDER BY pinned DESC,updated_at DESC LIMIT 250",
          )
          .bind(user.id),
      ),
      rows(
        db
          .prepare(
            "SELECT id,type,name,base_url,key_hint,enabled,config,created_at,updated_at FROM providers WHERE user_id=? ORDER BY name",
          )
          .bind(user.id),
      ),
      rows(
        db
          .prepare(
            "SELECT * FROM memories WHERE user_id=? ORDER BY updated_at DESC",
          )
          .bind(user.id),
      ),
      rows(db.prepare(usageSummarySql()).bind(user.id)),
      rows(
        db
          .prepare(usageSummarySql("AND created_at>=?"))
          .bind(user.id, monthStart),
      ),
    ]);
    const usage = priceUsageRows(usageRaw as UsageAggregate[]);
    const monthlyUsage = priceUsageRows(monthlyUsageRaw as UsageAggregate[]);
    const settingsRows = await rows<{ key: string; value: string }>(
      db
        .prepare("SELECT key,value FROM settings WHERE user_id=?")
        .bind(user.id),
    );
    const settings = Object.fromEntries(
      settingsRows.map((s) => [s.key, json(s.value)]),
    );
    const messages = conversationId
      ? await rows(
          db
            .prepare(
              "SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.conversation_id=? AND c.user_id=? ORDER BY m.created_at",
            )
            .bind(conversationId, user.id),
        )
      : [];
    const files = projectId
      ? await rows(
          db
            .prepare(
              "SELECT f.* FROM project_files f JOIN projects p ON p.id=f.project_id WHERE f.project_id=? AND p.user_id=? ORDER BY f.path",
            )
            .bind(projectId, user.id),
        )
      : [];
    const changes = projectId
      ? await rows(
          db
            .prepare(
              "SELECT pc.* FROM proposed_changes pc JOIN projects p ON p.id=pc.project_id WHERE pc.project_id=? AND p.user_id=? AND pc.status='pending' ORDER BY pc.created_at",
            )
            .bind(projectId, user.id),
        )
      : [];
    const activity = projectId
      ? await rows(
          db
            .prepare(
              "SELECT * FROM activity_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100",
            )
            .bind(projectId),
        )
      : [];
    const checkpoints = projectId
      ? await rows(
          db
            .prepare(
              "SELECT id,message,created_at FROM git_commits WHERE project_id=? AND is_checkpoint=1 ORDER BY created_at DESC LIMIT 20",
            )
            .bind(projectId),
        )
      : [];
    return Response.json({
      user,
      folders,
      projects,
      conversations,
      providers,
      memories,
      usage,
      monthlyUsage,
      settings,
      messages,
      files,
      changes,
      activity,
      checkpoints,
    });
  } catch (error) {
    return authError(error) ?? fail(error);
  }
}

type UsageAggregate = {
  provider: ProviderType;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number;
  unpriced_input_tokens: number;
  unpriced_output_tokens: number;
  unpriced_cached_tokens: number;
  unpriced_requests: number;
  requests: number;
};

function usageSummarySql(extra = "") {
  return `SELECT provider,model,
    SUM(input_tokens) input_tokens,
    SUM(output_tokens) output_tokens,
    SUM(cached_tokens) cached_tokens,
    SUM(COALESCE(cost_usd,0)) cost_usd,
    SUM(CASE WHEN cost_usd IS NULL THEN input_tokens ELSE 0 END) unpriced_input_tokens,
    SUM(CASE WHEN cost_usd IS NULL THEN output_tokens ELSE 0 END) unpriced_output_tokens,
    SUM(CASE WHEN cost_usd IS NULL THEN cached_tokens ELSE 0 END) unpriced_cached_tokens,
    SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END) unpriced_requests,
    COUNT(*) requests
    FROM usage_events WHERE user_id=? ${extra}
    GROUP BY provider,model ORDER BY cost_usd DESC`;
}

function priceUsageRows(values: UsageAggregate[]) {
  return values
    .map((row) => {
      const estimated = estimateCost(
        {
          inputTokens: Number(row.unpriced_input_tokens || 0),
          outputTokens: Number(row.unpriced_output_tokens || 0),
          cachedTokens: Number(row.unpriced_cached_tokens || 0),
        },
        inferCapabilities(row.provider, row.model),
      );
      return {
        ...row,
        cost_usd: Number(row.cost_usd || 0) + (estimated ?? 0),
        estimated: Number(row.unpriced_requests || 0) > 0,
        priced: estimated != null || Number(row.unpriced_requests || 0) === 0,
      };
    })
    .sort((a, b) => b.cost_usd - a.cost_usd);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await ensureUser(user);
    const db = database();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const time = now();
    if (action === "create_project") {
      const projectId = id();
      const conversationId = id();
      await db.batch([
        db
          .prepare(
            "INSERT INTO projects (id,user_id,name,description,created_at,updated_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            projectId,
            user.id,
            String(body.name || "Untitled project"),
            String(body.description || ""),
            time,
            time,
          ),
        db
          .prepare(
            "INSERT INTO conversations (id,user_id,project_id,title,mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            conversationId,
            user.id,
            projectId,
            "Project chat",
            "project",
            time,
            time,
          ),
      ]);
      return Response.json({ id: projectId, conversationId });
    }
    if (action === "create_conversation") {
      const newId = id();
      const projectId = body.projectId ? String(body.projectId) : null;
      await db
        .prepare(
          "INSERT INTO conversations (id,user_id,project_id,folder_id,title,mode,provider_id,model_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          newId,
          user.id,
          projectId,
          body.folderId ? String(body.folderId) : null,
          String(body.title || "New chat"),
          projectId ? "project" : "chat",
          body.providerId ? String(body.providerId) : null,
          body.modelId ? String(body.modelId) : null,
          time,
          time,
        )
        .run();
      return Response.json({ id: newId });
    }
    if (action === "convert_conversation_to_project") {
      const conversationId = String(body.conversationId || "");
      const conversation = await db
        .prepare(
          "SELECT id,title,project_id FROM conversations WHERE id=? AND user_id=?",
        )
        .bind(conversationId, user.id)
        .first<{ id: string; title: string; project_id?: string }>();
      if (!conversation)
        return Response.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      if (conversation.project_id)
        return Response.json({
          id: conversation.project_id,
          conversationId,
        });
      const projectId = id();
      await db.batch([
        db
          .prepare(
            "INSERT INTO projects (id,user_id,name,description,created_at,updated_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            projectId,
            user.id,
            String(body.name || conversation.title || "New project").slice(
              0,
              80,
            ),
            "Created automatically from a coding request.",
            time,
            time,
          ),
        db
          .prepare(
            "UPDATE conversations SET project_id=?,folder_id=NULL,mode='project',updated_at=? WHERE id=? AND user_id=?",
          )
          .bind(projectId, time, conversationId, user.id),
      ]);
      return Response.json({ id: projectId, conversationId });
    }
    if (action === "create_folder") {
      const newId = id();
      await db
        .prepare(
          "INSERT INTO folders (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)",
        )
        .bind(newId, user.id, String(body.name || "New folder"), time, time)
        .run();
      return Response.json({ id: newId });
    }
    if (action === "update_conversation") {
      const allowed = [
        "title",
        "folder_id",
        "project_id",
        "provider_id",
        "model_id",
        "instructions",
        "pinned",
        "archived",
      ] as const;
      const fields = allowed.filter((k) => Object.hasOwn(body, k));
      if (!fields.length) return Response.json({ ok: true });
      const sql = fields.map((k) => `${k}=?`).join(",");
      await db
        .prepare(
          `UPDATE conversations SET ${sql},updated_at=? WHERE id=? AND user_id=?`,
        )
        .bind(
          ...fields.map((k) => body[k] ?? null),
          time,
          String(body.id),
          user.id,
        )
        .run();
      return Response.json({ ok: true });
    }
    if (action === "delete_conversation") {
      const cid = String(body.id);
      await db.batch([
        db
          .prepare(
            "DELETE FROM messages WHERE conversation_id=? AND EXISTS(SELECT 1 FROM conversations WHERE id=? AND user_id=?)",
          )
          .bind(cid, cid, user.id),
        db
          .prepare("DELETE FROM conversations WHERE id=? AND user_id=?")
          .bind(cid, user.id),
      ]);
      return Response.json({ ok: true });
    }
    if (action === "update_project") {
      const allowed = [
        "name",
        "description",
        "instructions",
        "memory",
        "architecture",
        "decisions",
        "dependencies",
        "tech_stack",
        "summary",
        "auto_apply",
        "folder_id",
        "autonomy_level",
        "github_owner",
        "github_repo",
        "github_base_branch",
        "github_working_branch",
      ] as const;
      const fields = allowed.filter((k) => Object.hasOwn(body, k));
      if (!fields.length) return Response.json({ ok: true });
      await db
        .prepare(
          `UPDATE projects SET ${fields.map((k) => `${k}=?`).join(",")},updated_at=? WHERE id=? AND user_id=?`,
        )
        .bind(
          ...fields.map((k) =>
            k === "autonomy_level"
              ? safeAutonomyLevel(body[k])
              : body[k] ?? null,
          ),
          time,
          String(body.id),
          user.id,
        )
        .run();
      return Response.json({ ok: true });
    }
    if (action === "delete_project") {
      const pid = String(body.id);
      await db.batch([
        db
          .prepare(
            "DELETE FROM project_files WHERE project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)",
          )
          .bind(pid, pid, user.id),
        db
          .prepare(
            "DELETE FROM proposed_changes WHERE project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)",
          )
          .bind(pid, pid, user.id),
        db
          .prepare(
            "UPDATE conversations SET project_id=NULL,mode='chat' WHERE project_id=? AND user_id=?",
          )
          .bind(pid, user.id),
        db
          .prepare("DELETE FROM projects WHERE id=? AND user_id=?")
          .bind(pid, user.id),
      ]);
      return Response.json({ ok: true });
    }
    if (action === "save_file") {
      const pid = String(body.projectId);
      const path = safePath(String(body.path));
      const content = String(body.content ?? "");
      const language = body.language ? String(body.language) : null;
      const fileId = id();
      await db
        .prepare(
          "INSERT INTO project_files (id,project_id,path,content,language,version,created_at,updated_at) SELECT ?,?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content,language=excluded.language,version=project_files.version+1,updated_at=excluded.updated_at",
        )
        .bind(fileId, pid, path, content, language, time, time, pid, user.id)
        .run();
      return Response.json({ id: fileId });
    }
    if (action === "delete_file") {
      const pid = String(body.projectId);
      await db
        .prepare(
          "DELETE FROM project_files WHERE project_id=? AND path=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)",
        )
        .bind(pid, safePath(String(body.path)), pid, user.id)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "rename_file") {
      const pid = String(body.projectId);
      await db
        .prepare(
          "UPDATE project_files SET path=?,version=version+1,updated_at=? WHERE project_id=? AND path=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)",
        )
        .bind(
          safePath(String(body.newPath)),
          time,
          pid,
          safePath(String(body.path)),
          pid,
          user.id,
        )
        .run();
      return Response.json({ ok: true });
    }
    if (action === "resolve_change") {
      const change = await db
        .prepare(
          "SELECT pc.* FROM proposed_changes pc JOIN projects p ON p.id=pc.project_id WHERE pc.id=? AND p.user_id=?",
        )
        .bind(String(body.id), user.id)
        .first<Record<string, unknown>>();
      if (!change)
        return Response.json({ error: "Change not found" }, { status: 404 });
      const status = String(body.status);
      if (status === "applied") await applyChange(change, time);
      await db
        .prepare("UPDATE proposed_changes SET status=?,updated_at=? WHERE id=?")
        .bind(status, time, String(body.id))
        .run();
      return Response.json({ ok: true });
    }
    if (action === "resolve_all_changes") {
      const pid = String(body.projectId);
      const pending = await rows<Record<string, unknown>>(
        db
          .prepare(
            "SELECT pc.* FROM proposed_changes pc JOIN projects p ON p.id=pc.project_id WHERE pc.project_id=? AND pc.status='pending' AND p.user_id=?",
          )
          .bind(pid, user.id),
      );
      if (String(body.status) === "applied")
        for (const change of pending) await applyChange(change, time);
      await db
        .prepare(
          "UPDATE proposed_changes SET status=?,updated_at=? WHERE project_id=? AND status='pending' AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)",
        )
        .bind(String(body.status), time, pid, pid, user.id)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "save_memory") {
      const memoryId = body.id ? String(body.id) : id();
      await db
        .prepare(
          "INSERT INTO memories (id,user_id,project_id,conversation_id,scope,content,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,enabled=excluded.enabled,updated_at=excluded.updated_at",
        )
        .bind(
          memoryId,
          user.id,
          body.projectId ? String(body.projectId) : null,
          body.conversationId ? String(body.conversationId) : null,
          String(body.scope || "global"),
          String(body.content || ""),
          body.enabled === false ? 0 : 1,
          time,
          time,
        )
        .run();
      return Response.json({ id: memoryId });
    }
    if (action === "delete_memory") {
      await db
        .prepare("DELETE FROM memories WHERE id=? AND user_id=?")
        .bind(String(body.id), user.id)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "save_setting") {
      const key = String(body.key);
      await db
        .prepare(
          "INSERT INTO settings (id,user_id,key,value,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        )
        .bind(id(), user.id, key, JSON.stringify(body.value), time, time)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "git_status") {
      const pid = String(body.projectId);
      const project = await db
        .prepare("SELECT id FROM projects WHERE id=? AND user_id=?")
        .bind(pid, user.id)
        .first();
      if (!project)
        return Response.json({ error: "Project not found" }, { status: 404 });
      const files = await rows<{ path: string; content: string }>(
        db
          .prepare(
            "SELECT path,content FROM project_files WHERE project_id=? ORDER BY path",
          )
          .bind(pid),
      );
      const last = await db
        .prepare(
          "SELECT id,message,snapshot,created_at FROM git_commits WHERE project_id=? AND branch='main' ORDER BY created_at DESC LIMIT 1",
        )
        .bind(pid)
        .first<{
          id: string;
          message: string;
          snapshot: string;
          created_at: number;
        }>();
      const before = last
        ? (json(last.snapshot) as Record<string, string>)
        : {};
      const current = Object.fromEntries(files.map((f) => [f.path, f.content]));
      const changed = Object.keys(current).filter(
        (path) => before[path] !== current[path],
      );
      const deleted = Object.keys(before).filter((path) => !(path in current));
      return Response.json({
        branch: "main",
        changed,
        deleted,
        lastCommit: last
          ? { id: last.id, message: last.message, createdAt: last.created_at }
          : null,
      });
    }
    if (action === "git_commit") {
      const pid = String(body.projectId);
      const project = await db
        .prepare("SELECT id FROM projects WHERE id=? AND user_id=?")
        .bind(pid, user.id)
        .first();
      if (!project)
        return Response.json({ error: "Project not found" }, { status: 404 });
      const files = await rows<{ path: string; content: string }>(
        db
          .prepare(
            "SELECT path,content FROM project_files WHERE project_id=? ORDER BY path",
          )
          .bind(pid),
      );
      const parent = await db
        .prepare(
          "SELECT id FROM git_commits WHERE project_id=? AND branch='main' ORDER BY created_at DESC LIMIT 1",
        )
        .bind(pid)
        .first<{ id: string }>();
      const commitId = id();
      await db
        .prepare(
          "INSERT INTO git_commits (id,project_id,parent_id,branch,message,snapshot,created_at) VALUES (?,?,?,'main',?,?,?)",
        )
        .bind(
          commitId,
          pid,
          parent?.id ?? null,
          String(body.message || "Update project"),
          JSON.stringify(
            Object.fromEntries(files.map((f) => [f.path, f.content])),
          ),
          time,
        )
        .run();
      return Response.json({
        id: commitId,
        branch: "main",
        files: files.length,
      });
    }
    if (action === "create_checkpoint") {
      const pid = String(body.projectId);
      const project = await db
        .prepare("SELECT id FROM projects WHERE id=? AND user_id=?")
        .bind(pid, user.id)
        .first();
      if (!project)
        return Response.json({ error: "Project not found" }, { status: 404 });
      const files = await rows<{ path: string; content: string }>(
        db
          .prepare(
            "SELECT path,content FROM project_files WHERE project_id=? ORDER BY path",
          )
          .bind(pid),
      );
      const checkpointId = id();
      const message = String(body.message || "Astrid checkpoint").slice(0, 160);
      await db.batch([
        db
          .prepare(
            "INSERT INTO git_commits (id,project_id,parent_id,branch,message,snapshot,is_checkpoint,created_at) VALUES (?,?,NULL,'astrid/checkpoints',?,?,1,?)",
          )
          .bind(
            checkpointId,
            pid,
            message,
            JSON.stringify(
              Object.fromEntries(files.map((file) => [file.path, file.content])),
            ),
            time,
          ),
        activityStatement(
          pid,
          body.conversationId ? String(body.conversationId) : null,
          "checkpoint",
          `Created checkpoint: ${message}`,
          "complete",
          time,
        ),
      ]);
      return Response.json({ id: checkpointId, files: files.length });
    }
    if (action === "restore_checkpoint") {
      const pid = String(body.projectId);
      const checkpoint = await db
        .prepare(
          "SELECT gc.id,gc.snapshot FROM git_commits gc JOIN projects p ON p.id=gc.project_id WHERE gc.id=? AND gc.project_id=? AND gc.is_checkpoint=1 AND p.user_id=?",
        )
        .bind(String(body.checkpointId), pid, user.id)
        .first<{ id: string; snapshot: string }>();
      if (!checkpoint)
        return Response.json({ error: "Checkpoint not found" }, { status: 404 });
      const snapshot = json(checkpoint.snapshot) as Record<string, string>;
      const restoreTime = now();
      const statements = [
        db.prepare("DELETE FROM project_files WHERE project_id=?").bind(pid),
        ...Object.entries(snapshot).map(([path, content]) =>
          db
            .prepare(
              "INSERT INTO project_files (id,project_id,path,content,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)",
            )
            .bind(id(), pid, safePath(path), content, restoreTime, restoreTime),
        ),
        activityStatement(
          pid,
          body.conversationId ? String(body.conversationId) : null,
          "restore",
          `Restored checkpoint ${checkpoint.id.slice(0, 8)}`,
          "complete",
          restoreTime,
        ),
      ];
      await db.batch(statements);
      return Response.json({ ok: true, files: Object.keys(snapshot).length });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return authError(error) ?? fail(error);
  }
}

function activityStatement(
  projectId: string,
  conversationId: string | null,
  kind: string,
  message: string,
  status: string,
  createdAt: number,
) {
  return database()
    .prepare(
      "INSERT INTO activity_events (id,project_id,conversation_id,kind,message,status,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(id(), projectId, conversationId, kind, message, status, createdAt);
}

async function applyChange(change: Record<string, unknown>, time: number) {
  const db = database();
  const operation = String(change.operation),
    pid = String(change.project_id),
    path = safePath(String(change.path));
  if (operation === "delete_file")
    await db
      .prepare("DELETE FROM project_files WHERE project_id=? AND path=?")
      .bind(pid, path)
      .run();
  else if (operation === "rename_file")
    await db
      .prepare(
        "UPDATE project_files SET path=?,version=version+1,updated_at=? WHERE project_id=? AND path=?",
      )
      .bind(safePath(String(change.new_path)), time, pid, path)
      .run();
  else
    await db
      .prepare(
        "INSERT INTO project_files (id,project_id,path,content,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content,version=project_files.version+1,updated_at=excluded.updated_at",
      )
      .bind(id(), pid, path, String(change.after_content ?? ""), time, time)
      .run();
}
function safePath(path: string) {
  const value = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!value || value.split("/").some((part) => part === ".." || !part))
    throw new Error("Unsafe file path");
  return value;
}
function json(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function fail(error: unknown) {
  console.error(
    "Workspace API error",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}
