import { requireUser } from "@/lib/server/auth";
import { database, rows } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await requireUser();
    const db = database();
    const table = async (name: string) =>
      rows(db.prepare(`SELECT * FROM ${name} WHERE user_id=?`).bind(user.id));
    const conversations = await table("conversations");
    const conversationIds = conversations.map((c) =>
      String((c as { id: string }).id),
    );
    const projects = await table("projects");
    const projectIds = projects.map((p) => String((p as { id: string }).id));
    const messages = conversationIds.length
      ? await rows(
          db
            .prepare(
              `SELECT * FROM messages WHERE conversation_id IN (${conversationIds.map(() => "?").join(",")}) ORDER BY created_at`,
            )
            .bind(...conversationIds),
        )
      : [];
    const files = projectIds.length
      ? await rows(
          db
            .prepare(
              `SELECT * FROM project_files WHERE project_id IN (${projectIds.map(() => "?").join(",")}) ORDER BY path`,
            )
            .bind(...projectIds),
        )
      : [];
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      folders: await table("folders"),
      projects,
      conversations,
      messages,
      projectFiles: files,
      memories: await table("memories"),
      settings: await table("settings"),
      usage: await table("usage_events"),
      attachments: await table("attachments"),
    };
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": "attachment; filename=aster-backup.json",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 },
    );
  }
}
