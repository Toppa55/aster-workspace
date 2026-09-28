import { completeCoding, streamChat } from "@/lib/ai/adapters";
import { buildContext } from "@/lib/ai/context";
import { inferCapabilities, estimateCost } from "@/lib/ai/catalog";
import type { CodingOperation, Usage } from "@/lib/ai/types";
import { credentialFor } from "@/app/api/providers/route";
import { requireUser } from "@/lib/server/auth";
import { database, id, now } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const body = (await request.json()) as {
    conversationId?: string;
    projectId?: string;
    providerId?: string;
    modelId?: string;
    message?: string;
    reasoning?: "off" | "low" | "medium" | "high";
  };
  if (
    !body.conversationId ||
    !body.providerId ||
    !body.modelId ||
    !body.message?.trim()
  )
    return Response.json(
      { error: "Conversation, provider, model and message are required." },
      { status: 400 },
    );
  const conversation = await database()
    .prepare("SELECT * FROM conversations WHERE id=? AND user_id=?")
    .bind(body.conversationId, user.id)
    .first<Record<string, unknown>>();
  if (!conversation)
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  const projectId =
    body.projectId ||
    (conversation.project_id ? String(conversation.project_id) : null);
  const projectMode = !!projectId;
  const stream = new ReadableStream({
    start: async (controller) => {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      try {
        const credential = await credentialFor(user.id, body.providerId!);
        const context = await buildContext(
          user.id,
          body.conversationId!,
          body.message!,
          projectId,
        );
        const time = now();
        const userMessageId = id();
        await database()
          .prepare(
            "INSERT INTO messages (id,conversation_id,role,content,created_at,updated_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            userMessageId,
            body.conversationId,
            "user",
            body.message!.trim(),
            time,
            time,
          )
          .run();
        let responseText = "";
        let usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
        const assistantId = id();
        if (projectMode) {
          const result = await completeCoding(
            credential,
            body.modelId!,
            context.messages,
            body.reasoning ?? "medium",
            request.signal,
          );
          usage = result.usage;
          responseText = safeProjectMessage(
            result.userMessage || result.explanation,
          );
          const changes = await stageOperations(
            projectId!,
            body.conversationId!,
            assistantId,
            result.operations,
            time,
          );
          send("delta", { text: responseText });
          send("changes", { count: changes });
        } else {
          for await (const event of streamChat(
            credential,
            body.modelId!,
            context.messages,
            body.reasoning ?? "off",
            request.signal,
          )) {
            if (event.type === "text") {
              responseText += event.text;
              send("delta", { text: event.text });
            } else usage = event.usage;
          }
        }
        const capabilities = inferCapabilities(credential.type, body.modelId!);
        const cost = usage.costUsd ?? estimateCost(usage, capabilities);
        const finish = now();
        await database().batch([
          database()
            .prepare(
              "INSERT INTO messages (id,conversation_id,role,content,provider,model,input_tokens,cached_tokens,output_tokens,cost_usd,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              assistantId,
              body.conversationId,
              "assistant",
              responseText,
              credential.type,
              body.modelId,
              usage.inputTokens,
              usage.cachedTokens,
              usage.outputTokens,
              cost ?? null,
              finish,
              finish,
            ),
          database()
            .prepare(
              "INSERT INTO usage_events (id,user_id,project_id,conversation_id,message_id,provider,model,input_tokens,cached_tokens,output_tokens,cost_usd,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              id(),
              user.id,
              projectId,
              body.conversationId,
              assistantId,
              credential.type,
              body.modelId,
              usage.inputTokens,
              usage.cachedTokens,
              usage.outputTokens,
              cost ?? null,
              finish,
            ),
          database()
            .prepare(
              "UPDATE conversations SET provider_id=?,model_id=?,title=CASE WHEN title IN ('New chat','Project chat') THEN ? ELSE title END,updated_at=? WHERE id=? AND user_id=?",
            )
            .bind(
              body.providerId,
              body.modelId,
              titleFrom(body.message!),
              finish,
              body.conversationId,
              user.id,
            ),
        ]);
        send("done", {
          messageId: assistantId,
          provider: credential.type,
          model: body.modelId,
          usage: { ...usage, costUsd: cost },
        });
        controller.close();
      } catch (error) {
        console.error(
          "Chat generation failed",
          error instanceof Error ? error.message : "Unknown error",
        );
        send("error", {
          error: error instanceof Error ? error.message : "Generation failed",
        });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

async function stageOperations(
  projectId: string,
  conversationId: string,
  messageId: string,
  operations: CodingOperation[],
  time: number,
) {
  const db = database();
  let count = 0;
  for (const operation of operations) {
    const current = await db
      .prepare(
        "SELECT content FROM project_files WHERE project_id=? AND path=?",
      )
      .bind(projectId, operation.path)
      .first<{ content: string }>();
    const after = "content" in operation ? operation.content : null;
    await db
      .prepare(
        "INSERT INTO proposed_changes (id,project_id,conversation_id,message_id,operation,path,new_path,before_content,after_content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)",
      )
      .bind(
        id(),
        projectId,
        conversationId,
        messageId,
        operation.type,
        operation.path,
        "newPath" in operation ? operation.newPath : null,
        current?.content ?? null,
        after,
        time,
        time,
      )
      .run();
    count++;
  }
  const auto = await db
    .prepare("SELECT auto_apply FROM projects WHERE id=?")
    .bind(projectId)
    .first<{ auto_apply: number }>();
  if (auto?.auto_apply) {
    const pending = await db
      .prepare(
        "SELECT * FROM proposed_changes WHERE project_id=? AND message_id=? AND status='pending'",
      )
      .bind(projectId, messageId)
      .all<Record<string, unknown>>();
    for (const change of pending.results) {
      const op = String(change.operation),
        path = String(change.path);
      if (op === "delete_file")
        await db
          .prepare("DELETE FROM project_files WHERE project_id=? AND path=?")
          .bind(projectId, path)
          .run();
      else if (op === "rename_file")
        await db
          .prepare(
            "UPDATE project_files SET path=?,updated_at=? WHERE project_id=? AND path=?",
          )
          .bind(String(change.new_path), time, projectId, path)
          .run();
      else
        await db
          .prepare(
            "INSERT INTO project_files (id,project_id,path,content,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content,version=project_files.version+1,updated_at=excluded.updated_at",
          )
          .bind(
            id(),
            projectId,
            path,
            String(change.after_content ?? ""),
            time,
            time,
          )
          .run();
      await db
        .prepare(
          "UPDATE proposed_changes SET status='applied',updated_at=? WHERE id=?",
        )
        .bind(time, String(change.id))
        .run();
    }
  }
  return count;
}
function safeProjectMessage(value: string) {
  const withoutFences = value.replace(
    /```[\s\S]*?```/g,
    "[Source change available in the workspace]",
  );
  return withoutFences.length > 1400
    ? `${withoutFences.slice(0, 1400)}… Review the full changes in the workspace.`
    : withoutFences;
}
function titleFrom(value: string) {
  return (
    value
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .slice(0, 7)
      .join(" ")
      .slice(0, 72) || "New chat"
  );
}
