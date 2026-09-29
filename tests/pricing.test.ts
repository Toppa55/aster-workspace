import { describe, expect, it } from "vitest";
import {
  ensureUsage,
  estimateCost,
  inferCapabilities,
} from "../lib/ai/catalog";

describe("usage pricing", () => {
  it("attaches current standard pricing to known provider models", () => {
    const model = inferCapabilities("openai", "gpt-6-sol");
    expect(model.inputPricePerMillion).toBe(2);
    expect(model.cachedInputPricePerMillion).toBe(0.2);
    expect(model.outputPricePerMillion).toBe(10);
  });

  it("calculates cached, ordinary input, and output cost", () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, cachedTokens: 250_000, outputTokens: 100_000 },
      inferCapabilities("openai", "gpt-6-sol"),
    );
    expect(cost).toBeCloseTo(2.55, 8);
  });

  it("estimates token usage when a provider omits its usage trailer", () => {
    const usage = ensureUsage(
      { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      [{ content: "12345678" }],
      "1234",
    );
    expect(usage).toMatchObject({ inputTokens: 2, outputTokens: 1 });
  });

  it("leaves unknown models visibly unpriced", () => {
    expect(
      estimateCost(
        { inputTokens: 10, outputTokens: 10, cachedTokens: 0 },
        inferCapabilities("custom", "private-model"),
      ),
    ).toBeUndefined();
  });
});
