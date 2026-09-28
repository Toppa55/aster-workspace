export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "custom";

export type ModelCapabilities = {
  contextWindow?: number;
  inputPricePerMillion?: number;
  cachedInputPricePerMillion?: number;
  outputPricePerMillion?: number;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
  structuredOutputs: boolean;
  streaming: boolean;
  files: boolean;
};

export type ModelInfo = {
  id: string;
  name: string;
  provider: ProviderType;
  capabilities: ModelCapabilities;
};

export type ProviderCredential = {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl?: string | null;
  apiKey: string;
  config?: Record<string, unknown>;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd?: number;
};
export type StreamEvent =
  { type: "text"; text: string } | { type: "usage"; usage: Usage };

export type CodingOperation =
  | { type: "create_file"; path: string; content: string }
  | { type: "update_file"; path: string; content: string }
  | { type: "delete_file"; path: string }
  | { type: "rename_file"; path: string; newPath: string };

export type CodingResult = {
  operations: CodingOperation[];
  explanation: string;
  userMessage: string;
  usage: Usage;
};
