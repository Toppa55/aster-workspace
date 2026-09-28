import { listModels, testConnection } from "@/lib/ai/adapters";
import type { ProviderCredential, ProviderType } from "@/lib/ai/types";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/security/crypto";
import { authError, requireUser } from "@/lib/server/auth";
import { database, id, now } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const db = database();
    if (action === "save") {
      const apiKey = String(body.apiKey ?? "").trim();
      if (!apiKey)
        return Response.json({ error: "API key is required" }, { status: 400 });
      const type = String(body.type) as ProviderType;
      const providerId = body.id ? String(body.id) : id();
      const encrypted = await encryptSecret(apiKey);
      const time = now();
      await db
        .prepare(
          "INSERT INTO providers (id,user_id,type,name,base_url,encrypted_key,key_hint,enabled,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,name=excluded.name,base_url=excluded.base_url,encrypted_key=excluded.encrypted_key,key_hint=excluded.key_hint,enabled=excluded.enabled,config=excluded.config,updated_at=excluded.updated_at WHERE user_id=excluded.user_id",
        )
        .bind(
          providerId,
          user.id,
          type,
          String(body.name || type),
          body.baseUrl ? String(body.baseUrl) : null,
          encrypted,
          keyHint(apiKey),
          body.enabled === false ? 0 : 1,
          JSON.stringify(body.config ?? {}),
          time,
          time,
        )
        .run();
      return Response.json({ id: providerId, keyHint: keyHint(apiKey) });
    }
    if (action === "remove") {
      await db
        .prepare("DELETE FROM providers WHERE id=? AND user_id=?")
        .bind(String(body.id), user.id)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "toggle") {
      await db
        .prepare(
          "UPDATE providers SET enabled=?,updated_at=? WHERE id=? AND user_id=?",
        )
        .bind(body.enabled ? 1 : 0, now(), String(body.id), user.id)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "test" || action === "models") {
      const credential = await credentialFor(user.id, String(body.id));
      return Response.json(
        action === "test"
          ? await testConnection(credential)
          : { models: await listModels(credential) },
      );
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return authError(error) ?? fail(error);
  }
}

export async function credentialFor(
  userId: string,
  providerId: string,
): Promise<ProviderCredential> {
  const row = await database()
    .prepare("SELECT * FROM providers WHERE id=? AND user_id=? AND enabled=1")
    .bind(providerId, userId)
    .first<Record<string, unknown>>();
  if (!row) throw new Error("Provider is unavailable or disabled.");
  return {
    id: String(row.id),
    type: String(row.type) as ProviderType,
    name: String(row.name),
    baseUrl: row.base_url ? String(row.base_url) : null,
    apiKey: await decryptSecret(String(row.encrypted_key)),
    config: parse(String(row.config ?? "{}")),
  };
}
function parse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
function fail(error: unknown) {
  console.error(
    "Provider API error",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}
