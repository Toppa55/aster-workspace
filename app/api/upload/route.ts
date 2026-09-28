import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/server/auth";
import { database, id, now } from "@/lib/server/db";

const allowed = new Set([
  "txt",
  "md",
  "pdf",
  "docx",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "html",
  "css",
  "py",
  "sql",
  "yaml",
  "yml",
  "xml",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "go",
  "rs",
  "php",
  "rb",
  "sh",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
]);
const source = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "html",
  "css",
  "py",
  "sql",
  "yaml",
  "yml",
  "xml",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "go",
  "rs",
  "php",
  "rb",
  "sh",
]);
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!env.BUCKET) throw new Error("File storage is unavailable.");
    const form = await request.formData();
    const projectId = string(form.get("projectId"));
    const conversationId = string(form.get("conversationId"));
    if (projectId) {
      const own = await database()
        .prepare("SELECT id FROM projects WHERE id=? AND user_id=?")
        .bind(projectId, user.id)
        .first();
      if (!own)
        return Response.json({ error: "Project not found" }, { status: 404 });
    }
    const incoming = form
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    if (!incoming.length)
      return Response.json(
        { error: "Choose at least one file" },
        { status: 400 },
      );
    if (incoming.length > 10)
      return Response.json(
        { error: "Upload up to 10 files at a time" },
        { status: 400 },
      );
    const saved = [];
    for (const file of incoming) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!allowed.has(ext))
        throw new Error(`${file.name}: unsupported file type`);
      if (file.size > 15 * 1024 * 1024)
        throw new Error(`${file.name}: file exceeds 15 MB`);
      const attachmentId = id();
      const key = `${user.id}/${attachmentId}/${safeName(file.name)}`;
      await env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      const text = source.has(ext)
        ? (await file.text()).slice(0, 1_000_000)
        : null;
      const time = now();
      await database()
        .prepare(
          "INSERT INTO attachments (id,user_id,project_id,conversation_id,name,mime_type,size,object_key,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          attachmentId,
          user.id,
          projectId,
          conversationId,
          file.name,
          file.type || "application/octet-stream",
          file.size,
          key,
          text,
          time,
        )
        .run();
      if (projectId && text != null)
        await database()
          .prepare(
            "INSERT INTO project_files (id,project_id,path,content,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content,version=project_files.version+1,updated_at=excluded.updated_at",
          )
          .bind(id(), projectId, safeName(file.name), text, time, time)
          .run();
      saved.push({ id: attachmentId, name: file.name, size: file.size });
    }
    return Response.json({ files: saved });
  } catch (error) {
    console.error(
      "Upload failed",
      error instanceof Error ? error.message : "Unknown",
    );
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
function string(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? value : null;
}
function safeName(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._/-]/g, "-")
    .replace(/\.\./g, "-")
    .replace(/^\/+/, "");
}
