import { database, rows } from "@/lib/server/db";
import type { ChatMessage } from "./types";

type FileRow = { path: string; content: string; language?: string };

export async function buildContext(
  userId: string,
  conversationId: string,
  prompt: string,
  projectId?: string | null,
): Promise<{ messages: ChatMessage[]; files: FileRow[]; system: string }> {
  const db = database();
  const conversation = await db
    .prepare(
      "SELECT c.*,p.instructions project_instructions,p.memory project_memory,p.summary project_summary,p.architecture FROM conversations c LEFT JOIN projects p ON p.id=c.project_id WHERE c.id=? AND c.user_id=?",
    )
    .bind(conversationId, userId)
    .first<Record<string, unknown>>();
  if (!conversation) throw new Error("Conversation not found.");
  const [history, memories] = await Promise.all([
    rows<{ role: string; content: string }>(
      db
        .prepare(
          "SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 16",
        )
        .bind(conversationId),
    ),
    rows<{ content: string }>(
      db
        .prepare(
          "SELECT content FROM memories WHERE user_id=? AND enabled=1 AND (scope='global' OR project_id=? OR conversation_id=?) ORDER BY updated_at DESC LIMIT 12",
        )
        .bind(userId, projectId ?? null, conversationId),
    ),
  ]);
  const files = projectId ? await selectRelevantFiles(projectId, prompt) : [];
  const instructions = [
    "You are Astrid, a concise and capable personal AI assistant.",
    String(conversation.instructions || ""),
    String(conversation.project_instructions || ""),
    memories.length
      ? `Relevant memories:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
      : "",
    projectId
      ? "This is a coding project. Keep the chat response concise and conversational. Never include raw source code or fenced code blocks in user_message or explanation. Source changes must be returned only through the apply_workspace_changes tool. Return an empty operations array only when the user asks exclusively for inspection, review, explanation, or feedback with no requested modification. When a request combines inspection with a concrete change, inspect first and then return the requested file operations. For CAD requests, prefer editable parametric source such as CadQuery or OpenSCAD. Shapr3D can import STEP; do not claim that a proprietary native .shapr file was generated unless a real converter produced it."
      : "",
    conversation.project_summary
      ? `Project summary: ${conversation.project_summary}`
      : "",
    conversation.architecture
      ? `Architecture: ${conversation.architecture}`
      : "",
    files.length
      ? `Relevant project files:\n${files.map((f) => `--- ${f.path}\n${f.content}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    system: instructions,
    files,
    messages: [
      { role: "system", content: instructions },
      ...history.reverse().map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as
          "assistant" | "user",
        content: m.content,
      })),
      { role: "user", content: prompt },
    ],
  };
}

async function selectRelevantFiles(projectId: string, prompt: string) {
  const all = await rows<FileRow>(
    database()
      .prepare(
        "SELECT path,content,language FROM project_files WHERE project_id=? ORDER BY updated_at DESC LIMIT 200",
      )
      .bind(projectId),
  );
  const terms = new Set(
    prompt
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .filter((v) => v.length > 2),
  );
  return all
    .map((file) => {
      const hay = `${file.path} ${file.content.slice(0, 4000)}`.toLowerCase();
      let score = file.content.length < 5000 ? 1 : 0;
      for (const term of terms)
        if (hay.includes(term)) score += term.includes(".") ? 5 : 2;
      if (
        /package\.json|readme|config|schema|types/.test(file.path.toLowerCase())
      )
        score += 1;
      return { file, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .reduce<FileRow[]>((selected, item) => {
      const used = selected.reduce((sum, f) => sum + f.content.length, 0);
      if (used >= 24000) return selected;
      selected.push({
        ...item.file,
        content: item.file.content.slice(0, Math.max(0, 24000 - used)),
      });
      return selected;
    }, []);
}
