import { credentialFor } from "@/app/api/providers/route";
import {
  buildTranscriptionPrompt,
  parseLanguageHints,
  parseVoiceKeywords,
} from "@/lib/ai/transcription";
import { authError, requireUser } from "@/lib/server/auth";
import { database, rows } from "@/lib/server/db";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO = new Set([
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File))
      return Response.json(
        { error: "Audio recording is required" },
        { status: 400 },
      );
    if (!audio.size || audio.size > MAX_AUDIO_BYTES)
      return Response.json(
        { error: "Voice recordings must be between 1 byte and 25 MB" },
        { status: 400 },
      );
    const mime = audio.type.split(";")[0].toLowerCase();
    if (!ALLOWED_AUDIO.has(mime))
      return Response.json(
        { error: `Unsupported recording format: ${mime || "unknown"}` },
        { status: 415 },
      );

    const settings = Object.fromEntries(
      (
        await rows<{ key: string; value: string }>(
          database()
            .prepare(
              "SELECT key,value FROM settings WHERE user_id=? AND key IN ('voiceProviderId','voiceTranscriptionModel','voiceLanguages','voiceKeywords','voiceCleanDictation')",
            )
            .bind(user.id),
        )
      ).map((item) => [item.key, parse(item.value)]),
    );
    const preferredProvider = String(settings.voiceProviderId || "");
    const provider = await database()
      .prepare(
        "SELECT id FROM providers WHERE user_id=? AND type='openai' AND enabled=1 AND (?='' OR id=?) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 1",
      )
      .bind(user.id, preferredProvider, preferredProvider, preferredProvider)
      .first<{ id: string }>();
    if (!provider)
      return Response.json(
        {
          error:
            "High-accuracy voice input needs a connected OpenAI provider. Add one in Settings → AI Providers.",
          code: "NO_TRANSCRIPTION_PROVIDER",
        },
        { status: 409 },
      );
    const credential = await credentialFor(user.id, provider.id);
    const model = String(
      settings.voiceTranscriptionModel || "gpt-transcribe",
    ).trim();
    const languages = parseLanguageHints(settings.voiceLanguages);
    const keywords = parseVoiceKeywords(settings.voiceKeywords);
    const cleanDictation = settings.voiceCleanDictation !== false;
    const body = new FormData();
    body.set("file", audio, audio.name || fileNameFor(mime));
    body.set("model", model || "gpt-transcribe");
    body.set("prompt", buildTranscriptionPrompt(cleanDictation));
    languages.forEach((language) => body.append("languages[]", language));
    keywords.forEach((keyword) => body.append("keywords[]", keyword));
    const baseUrl = (credential.baseUrl || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${credential.apiKey}` },
      body,
    });
    const result = (await response.json().catch(() => ({}))) as {
      text?: string;
      languages?: Array<{ code?: string }>;
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(
        `Transcription failed (${response.status}): ${result.error?.message || response.statusText}`,
      );
    const text = result.text?.trim();
    if (!text)
      throw new Error("The recording did not contain recognizable speech");
    return Response.json({
      text,
      provider: "openai",
      model,
      languages: result.languages ?? [],
    });
  } catch (error) {
    return authError(error) ?? fail(error);
  }
}

function fileNameFor(mime: string) {
  if (mime.includes("mp4") || mime.includes("m4a")) return "voice.m4a";
  if (mime.includes("wav")) return "voice.wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "voice.mp3";
  return "voice.webm";
}

function parse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function fail(error: unknown) {
  console.error(
    "Transcription error",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    { error: error instanceof Error ? error.message : "Transcription failed" },
    { status: 500 },
  );
}
