import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/server/auth";
import { database } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!env.BUCKET) throw new Error("File storage is unavailable.");
    const { id } = await context.params;
    const attachment = await database()
      .prepare(
        "SELECT name,mime_type,object_key FROM attachments WHERE id=? AND user_id=?",
      )
      .bind(id, user.id)
      .first<{ name: string; mime_type: string; object_key: string }>();
    if (!attachment)
      return Response.json({ error: "File not found" }, { status: 404 });
    const object = await env.BUCKET.get(attachment.object_key);
    if (!object)
      return Response.json({ error: "File not found" }, { status: 404 });
    const download = new URL(request.url).searchParams.has("download");
    return new Response(object.body, {
      headers: {
        "content-type": attachment.mime_type,
        "cache-control": "private, max-age=3600",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeHeader(attachment.name)}"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "File unavailable" },
      { status: 500 },
    );
  }
}

function safeHeader(value: string) {
  return value.replace(/["\r\n]/g, "-");
}
