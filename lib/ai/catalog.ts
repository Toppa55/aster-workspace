import type { ModelCapabilities, ProviderType } from "./types";

const defaults: ModelCapabilities = {
  reasoning: false,
  vision: false,
  imageGeneration: false,
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
  const multimodal = /gpt-[456]|claude|gemini|grok|vision|vl/.test(value);
  const reasoning = /reason|thinking|o[134]|gpt-[56]|claude|gemini|grok/.test(
    value,
  );
  const tools = !/embedding|moderation|tts|audio|image/.test(value);
  const imageGeneration =
    provider === "openai" && /^(gpt-image-|dall-e-)/.test(value);
  return {
    ...defaults,
    ...priceForModel(provider, id),
    reasoning,
    vision: multimodal,
    imageGeneration,
    files: multimodal,
    tools,
    structuredOutputs: tools,
    streaming: true,
  };
}

type ModelPrice = Pick<
  ModelCapabilities,
  | "inputPricePerMillion"
  | "cachedInputPricePerMillion"
  | "outputPricePerMillion"
>;

const pricingRules: Array<{
  provider: ProviderType;
  pattern: RegExp;
  price: ModelPrice;
}> = [
  // Standard processing prices, USD per one million text tokens.
  {
    provider: "openai",
    pattern: /(^|\/)gpt-image-2\.5-(?:flare|sunburst)(?:$|-)/,
    price: price(5, 1.25, 30),
  },
  {
    provider: "openai",
    pattern: /(^|\/)gpt-6-astra(?:$|-)/,
    price: price(10, 1, 50),
  },
  {
    provider: "openai",
    pattern: /(^|\/)gpt-6-sol(?:$|-)/,
    price: price(2, 0.2, 10),
  },
  {
    provider: "openai",
    pattern: /(^|\/)gpt-6-luna(?:$|-)/,
    price: price(0.1, 0.01, 0.5),
  },
  {
    provider: "openai",
    pattern: /(^|\/)gpt-5\.6-cyber(?:$|-)/,
    price: price(12.5, 1.25, 75),
  },
  {
    provider: "openai",
    pattern: /(^|\/)gpt-5\.6-sol(?:$|-)/,
    price: price(4, 0.4, 20),
  },
  {
    provider: "openai",
    pattern: /(^|\/)gpt-5\.6-terra(?:$|-)/,
    price: price(2, 0.2, 12),
  },
  {
    provider: "openai",
    pattern: /(^|\/)gpt-5\.6-luna(?:$|-)/,
    price: price(0.2, 0.02, 1.2),
  },
  {
    provider: "openai",
    pattern: /(^|\/)chat-latest(?:$|-)/,
    price: price(5, 0.5, 30),
  },
  {
    provider: "anthropic",
    pattern: /claude-(?:sonnet-5|sonnet-4-6)/,
    price: price(3, 0.3, 15),
  },
  {
    provider: "anthropic",
    pattern: /claude-(?:opus-5|opus-4-[678])/,
    price: price(10, 1, 50),
  },
  {
    provider: "anthropic",
    pattern: /claude-haiku-4-5/,
    price: price(1, 0.1, 5),
  },
  {
    provider: "google",
    pattern: /gemini-3\.8-flash/,
    price: price(0.75, 0.075, 3.75),
  },
  {
    provider: "google",
    pattern: /gemini-3\.5-flash/,
    price: price(1.5, 0.15, 9),
  },
  {
    provider: "google",
    pattern: /gemini-3\.1-flash-lite/,
    price: price(0.25, 0.025, 1.5),
  },
  {
    provider: "google",
    pattern: /gemini-3\.1-flash/,
    price: price(0.3, 0.03, 2.5),
  },
  { provider: "xai", pattern: /grok-4\.7/, price: price(2, 0.5, 6) },
  {
    provider: "xai",
    pattern: /grok-(?:4\.3|4\.20)/,
    price: price(1.25, 0.2, 2.5),
  },
];

function price(
  inputPricePerMillion: number,
  cachedInputPricePerMillion: number,
  outputPricePerMillion: number,
): ModelPrice {
  return {
    inputPricePerMillion,
    cachedInputPricePerMillion,
    outputPricePerMillion,
  };
}

export function priceForModel(
  provider: ProviderType,
  modelId: string,
): ModelPrice {
  return (
    pricingRules.find(
      (rule) =>
        rule.provider === provider && rule.pattern.test(modelId.toLowerCase()),
    )?.price ?? {}
  );
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

export function ensureUsage(
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd?: number;
  },
  messages: Array<{ content: string }>,
  output: string,
) {
  return {
    ...usage,
    inputTokens:
      usage.inputTokens > 0
        ? usage.inputTokens
        : estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens:
      usage.outputTokens > 0 ? usage.outputTokens : estimateTokens(output),
  };
}

function estimateTokens(text: string) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
