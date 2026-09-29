import { describe, expect, it } from "vitest";
import { curatedModelIds, visibleModels } from "../lib/ai/model-visibility";
import type { ModelInfo } from "../lib/ai/types";

const capabilities = {
  reasoning: true,
  vision: true,
  imageGeneration: false,
  tools: true,
  structuredOutputs: true,
  streaming: true,
  files: true,
};
const models: ModelInfo[] = [
  { id: "gpt-main", name: "GPT Main", provider: "openai", capabilities },
  {
    id: "text-embedding-3",
    name: "Embeddings",
    provider: "openai",
    capabilities,
  },
  { id: "gpt-fast", name: "GPT Fast", provider: "openai", capabilities },
];

describe("model visibility", () => {
  it("keeps non-chat models out of the default shortlist", () => {
    expect(curatedModelIds(models)).toEqual(["gpt-fast", "gpt-main"]);
  });

  it("honours an explicit Settings selection", () => {
    expect(
      visibleModels("provider-1", models, {
        "provider-1": ["text-embedding-3"],
      }).map((model) => model.id),
    ).toEqual(["text-embedding-3"]);
  });

  it("includes one image model in the default shortlist", () => {
    const withImage: ModelInfo[] = [
      ...models,
      {
        id: "gpt-image-2.5-flare",
        name: "GPT Image 2.5 Flare",
        provider: "openai",
        capabilities: { ...capabilities, imageGeneration: true, tools: false },
      },
    ];
    expect(curatedModelIds(withImage)).toContain("gpt-image-2.5-flare");
  });
});
