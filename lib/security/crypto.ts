import { env } from "cloudflare:workers";

function secret() {
  const value = env.APP_ENCRYPTION_KEY ?? process.env.APP_ENCRYPTION_KEY;
  if (!value || value.length < 32)
    throw new Error("APP_ENCRYPTION_KEY must contain at least 32 characters.");
  return value;
}

async function key() {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret()),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    new TextEncoder().encode(value),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string) {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext)
    throw new Error("Unsupported encrypted credential format.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    await key(),
    unb64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

export function keyHint(value: string) {
  return value.length < 8
    ? "••••••••"
    : `${value.slice(0, 3)}••••${value.slice(-4)}`;
}
