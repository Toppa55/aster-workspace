import type { ModelCapabilities, ProviderType } from "./types";

const defaults: ModelCapabilities = {
  reasoning: false,
  vision: false,
  tools: false,
  structuredOutputs: false,
  streaming: true,
  files: false,
};

export const providerMetadata: Record<
  ProviderType,
  { name: string; baseUrl: string; billingUrl?: string }
> = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    billingUrl:
      "https://platform.openai.com/settings/organization/billing/overview",
  },
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    billingUrl: "https://console.anthropic.com/settings/billing",
  },
  google: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    billingUrl: "https://aistudio.google.com/usage",
  },
  xai: {
    name: "xAI",
    baseUrl: "https://api.x.ai/v1",
    billingUrl: "https://console.x.ai",
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    billingUrl: "https://openrouter.ai/credits",
  },
  ollama: { name: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" },
  lmstudio: { name: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1" },
  custom: { name: "Custom endpoint", baseUrl: "" },
};

export function inferCapabilities(
  provider: ProviderType,
  id: string,
): ModelCapabilities {
  const value = id.toLowerCase();
  const multimodal = /gpt-4|gpt-5|claude|gemini|grok|vision|vl/.test(value);
  const reasoning = /reason|thinking|o[134]|gpt-5|claude|gemini|grok/.test(
    value,
  );
  const tools = !/embedding|moderation|tts|audio|image/.test(value);
  return {
    ...defaults,
    reasoning,
    vision: multimodal,
    files: multimodal,
    tools,
    structuredOutputs: tools,
    streaming: true,
  };
}

export function priceFromOpenRouter(pricing?: {
  prompt?: string;
  completion?: string;
  input_cache_read?: string;
}) {
  const million = (value?: string) =>
    value ? Number(value) * 1_000_000 : undefined;
  return {
    inputPricePerMillion: million(pricing?.prompt),
    outputPricePerMillion: million(pricing?.completion),
    cachedInputPricePerMillion: million(pricing?.input_cache_read),
  };
}

export function estimateCost(
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number },
  caps?: ModelCapabilities,
) {
  if (!caps?.inputPricePerMillion && !caps?.outputPricePerMillion)
    return undefined;
  const ordinaryInput = Math.max(0, usage.inputTokens - usage.cachedTokens);
  return (
    (ordinaryInput * (caps.inputPricePerMillion ?? 0)) / 1_000_000 +
    (usage.cachedTokens *
      (caps.cachedInputPricePerMillion ?? caps.inputPricePerMillion ?? 0)) /
      1_000_000 +
    (usage.outputTokens * (caps.outputPricePerMillion ?? 0)) / 1_000_000
  );
}
