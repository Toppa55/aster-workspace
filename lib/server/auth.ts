import { headers } from "next/headers";

export async function getUser() {
  const h = await headers();
  const userId = h.get("oai-authenticated-user-id");
  if (userId)
    return {
      id: userId,
      email: h.get("oai-authenticated-user-email"),
      name: decodeName(h),
    };
  if (process.env.NODE_ENV !== "production")
    return { id: "local-user", email: "local@aster.dev", name: "Local user" };
  return null;
}

function decodeName(h: Headers) {
  const encoded = h.get("oai-authenticated-user-full-name");
  if (
    !encoded ||
    h.get("oai-authenticated-user-full-name-encoding") !==
      "percent-encoded-utf-8"
  )
    return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export function authError(error: unknown) {
  return error instanceof Error && error.message === "UNAUTHORIZED"
    ? new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    : null;
}
