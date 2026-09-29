import { describe, expect, it } from "vitest";
import {
  rankColonyCandidates,
  totalColonyUsage,
  type ColonyCandidate,
} from "../lib/ai/colony";

const openai = {
  id: "openai",
  type: "openai" as const,
  name: "OpenAI",
  apiKey: "test-key",
};

describe("Agent Colony routing", () => {
  it("prefers the lower-cost enabled worker in cheapest mode", () => {
    const candidates: ColonyCandidate[] = [
      { credential: openai, model: "gpt-6-astra" },
      { credential: openai, model: "gpt-6-luna" },
    ];

    expect(rankColonyCandidates(candidates, "cheapest")[0].model).toBe(
      "gpt-6-luna",
    );
  });

  it("combines tokens and cost from every real model call", () => {
    expect(
      totalColonyUsage([
        {
          role: "coordinator",
          provider: "openai",
          model: "gpt-6-astra",
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            cachedTokens: 10,
            costUsd: 0.01,
          },
        },
        {
          role: "worker",
          provider: "openai",
          model: "gpt-6-luna",
          usage: {
            inputTokens: 50,
            outputTokens: 10,
            cachedTokens: 0,
            costUsd: 0.001,
          },
        },
      ]),
    ).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      cachedTokens: 10,
      costUsd: 0.011,
    });
  });
});
