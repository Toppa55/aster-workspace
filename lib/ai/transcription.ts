export function parseLanguageHints(value: unknown) {
  const hints = String(value || "en,af")
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(item));
  return [...new Set(hints)].slice(0, 6);
}

export function parseVoiceKeywords(value: unknown) {
  const defaults = [
    "Aster",
    "OpenAI",
    "Anthropic",
    "Gemini",
    "xAI",
    "OpenRouter",
    "GitHub",
    "TypeScript",
    "JavaScript",
    "React",
    "Next.js",
    "Monaco",
  ];
  const custom = String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.replace(/[<>\r\n]/g, "").trim())
    .filter(Boolean);
  return [...new Set([...defaults, ...custom])].slice(0, 80);
}

export function buildTranscriptionPrompt(cleanDictation: boolean) {
  const base =
    "This is a spoken prompt for a personal AI workspace. Preserve names, technical terms, filenames, commands, numbers, and the speaker's intended meaning. Use natural punctuation and paragraph breaks.";
  if (!cleanDictation) return base;
  return `${base} The speaker may stutter, mumble, pause, repeat a syllable, or restart a short phrase. Produce clean readable dictation by removing accidental filler sounds, abandoned fragments, and duplicate stuttered words only when the intended meaning is clear. Never add facts or instructions the speaker did not say.`;
}
