import { env } from "cloudflare:workers";
import { credentialFor } from "@/app/api/providers/route";
import { generateImage } from "@/lib/ai/adapters";
import { estimateCost, inferCapabilities } from "@/lib/ai/catalog";
import { requireUser } from "@/lib/server/auth";
import { database, id, now } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!env.BUCKET) throw new Error("File storage is unavailable.");
    const body = (await request.json()) as {
      conversationId?: string;
      providerId?: string;
      modelId?: string;
      prompt?: string;
    };
    if (
      !body.conversationId ||
      !body.providerId ||
      !body.modelId ||
      !body.prompt?.trim()
    )
      return Response.json(
        {
          error: "Conversation, provider, image model and prompt are required.",
        },
        { status: 400 },
      );
    const conversation = await database()
      .prepare(
        "SELECT id,project_id FROM conversations WHERE id=? AND user_id=?",
      )
      .bind(body.conversationId, user.id)
      .first<{ id: string; project_id?: string }>();
    if (!conversation)
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );

    const credential = await credentialFor(user.id, body.providerId);
    const generated = await generateImage(
      credential,
      body.modelId,
      body.prompt.trim(),
      request.signal,
    );
    const attachmentId = id();
    const name = `astrid-image-${Date.now()}.${generated.extension}`;
    const objectKey = `${user.id}/${attachmentId}/${name}`;
    await env.BUCKET.put(objectKey, generated.bytes, {
      httpMetadata: { contentType: generated.mimeType },
    });
    const time = now();
    const userMessageId = id();
    const assistantId = id();
    const content = `![Generated image](/api/attachments/${attachmentId})\n\n[Download ${name}](/api/attachments/${attachmentId}?download=1)`;
    const cost = estimateCost(
      generated.usage,
      inferCapabilities(credential.type, body.modelId),
    );
    await database().batch([
      database()
        .prepare(
          "INSERT INTO messages (id,conversation_id,role,content,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          userMessageId,
          body.conversationId,
          "user",
          body.prompt.trim(),
          time,
          time,
        ),
      database()
        .prepare(
          "INSERT INTO attachments (id,user_id,project_id,conversation_id,name,mime_type,size,object_key,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          attachmentId,
          user.id,
          conversation.project_id ?? null,
          body.conversationId,
          name,
          generated.mimeType,
          generated.bytes.byteLength,
          objectKey,
          null,
          time,
        ),
      database()
        .prepare(
          "INSERT INTO messages (id,conversation_id,role,content,provider,model,input_tokens,cached_tokens,output_tokens,cost_usd,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          assistantId,
          body.conversationId,
          "assistant",
          content,
          credential.type,
          body.modelId,
          generated.usage.inputTokens,
          generated.usage.cachedTokens,
          generated.usage.outputTokens,
          cost ?? null,
          JSON.stringify({ attachmentId, kind: "generated_image" }),
          time,
          time,
        ),
      database()
        .prepare(
          "INSERT INTO usage_events (id,user_id,project_id,conversation_id,message_id,provider,model,input_tokens,cached_tokens,output_tokens,cost_usd,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id(),
          user.id,
          conversation.project_id ?? null,
          body.conversationId,
          assistantId,
          credential.type,
          body.modelId,
          generated.usage.inputTokens,
          generated.usage.cachedTokens,
          generated.usage.outputTokens,
          cost ?? null,
          time,
        ),
      database()
        .prepare(
          "UPDATE conversations SET provider_id=?,model_id=?,title=CASE WHEN title IN ('New chat','Project chat') THEN ? ELSE title END,updated_at=? WHERE id=? AND user_id=?",
        )
        .bind(
          body.providerId,
          body.modelId,
          titleFrom(body.prompt),
          time,
          body.conversationId,
          user.id,
        ),
    ]);
    return Response.json({
      messageId: assistantId,
      attachmentId,
      usage: { ...generated.usage, costUsd: cost },
    });
  } catch (error) {
    console.error(
      "Image generation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Image generation failed",
      },
      { status: 500 },
    );
  }
}

function titleFrom(value: string) {
  return (
    value
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .slice(0, 7)
      .join(" ")
      .slice(0, 72) || "Generated image"
  );
}
