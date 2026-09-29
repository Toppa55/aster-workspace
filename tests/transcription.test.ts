import { describe, expect, it } from "vitest";
import {
  buildTranscriptionPrompt,
  estimateTranscriptionCost,
  parseLanguageHints,
  parseVoiceKeywords,
} from "../lib/ai/transcription";

describe("voice transcription helpers", () => {
  it("normalizes multilingual hints", () => {
    expect(parseLanguageHints("EN, af, en, invalid!")).toEqual(["en", "af"]);
  });

  it("sanitizes and deduplicates vocabulary", () => {
    const keywords = parseVoiceKeywords("Suvania, TypeScript, <unsafe>");
    expect(keywords).toContain("Suvania");
    expect(keywords.filter((item) => item === "TypeScript")).toHaveLength(1);
    expect(keywords.join(" ")).not.toContain("<");
  });

  it("asks for cleanup without allowing invention", () => {
    const prompt = buildTranscriptionPrompt(true);
    expect(prompt).toContain("stutter");
    expect(prompt).toContain("Never add facts");
  });

  it("estimates gpt-transcribe usage by recording duration", () => {
    expect(estimateTranscriptionCost("gpt-transcribe", 120)).toBeCloseTo(0.009);
  });
});
