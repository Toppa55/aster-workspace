import { env } from "cloudflare:workers";

export function database() {
  if (!env.DB) throw new Error("Database binding is unavailable.");
  return env.DB;
}

export const now = () => Date.now();
export const id = () => crypto.randomUUID();

export async function rows<T>(statement: D1PreparedStatement) {
  const result = await statement.all<T>();
  return result.results ?? [];
}

export async function ensureUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}) {
  const time = now();
  await database()
    .prepare(
      "INSERT INTO users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=excluded.updated_at",
    )
    .bind(user.id, user.email ?? null, user.name ?? null, time, time)
    .run();
}
