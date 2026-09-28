import {
  inferCapabilities,
  priceFromOpenRouter,
  providerMetadata,
} from "./catalog";
import type {
  ChatMessage,
  CodingResult,
  ModelInfo,
  ProviderCredential,
  StreamEvent,
  Usage,
} from "./types";

const codingTool = {
  name: "apply_workspace_changes",
  description:
    "Propose source-file operations. Put source code only inside operation content, never in user_message or explanation.",
  input_schema: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "create_file",
                "update_file",
                "delete_file",
                "rename_file",
              ],
            },
            path: { type: "string" },
            newPath: { type: "string" },
            content: { type: "string" },
          },
          required: ["type", "path"],
          additionalProperties: false,
        },
      },
      explanation: { type: "string" },
      user_message: { type: "string" },
    },
    required: ["operations", "explanation", "user_message"],
    additionalProperties: false,
  },
};

function base(credential: ProviderCredential) {
  return (
    credential.baseUrl || providerMetadata[credential.type].baseUrl
  ).replace(/\/$/, "");
}
function headersFor(credential: ProviderCredential): Record<string, string> {
  if (credential.type === "anthropic")
    return {
      "x-api-key": credential.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
  return {
    authorization: `Bearer ${credential.apiKey}`,
    "content-type": "application/json",
  };
}
async function checked(response: Response) {
  if (response.ok) return response;
  const detail = (await response.text()).slice(0, 800);
  throw new Error(
    `Provider request failed (${response.status}): ${detail || response.statusText}`,
  );
}

export async function listModels(
  credential: ProviderCredential,
): Promise<ModelInfo[]> {
  if (credential.type === "google") {
    const response = await checked(
      await fetch(
        `${base(credential)}/models?key=${encodeURIComponent(credential.apiKey)}`,
      ),
    );
    const data = (await response.json()) as {
      models?: Array<{
        name: string;
        displayName?: string;
        inputTokenLimit?: number;
      }>;
    };
    return (data.models ?? [])
      .filter((m) => m.name.includes("gemini"))
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        name: m.displayName || m.name,
        provider: credential.type,
        capabilities: {
          ...inferCapabilities(credential.type, m.name),
          contextWindow: m.inputTokenLimit,
        },
      }));
  }
  const response = await checked(
    await fetch(`${base(credential)}/models`, {
      headers: headersFor(credential),
    }),
  );
  const data = (await response.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: {
        prompt?: string;
        completion?: string;
        input_cache_read?: string;
      };
    }>;
  };
  return (data.data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      provider: credential.type,
      capabilities: {
        ...inferCapabilities(credential.type, m.id),
        contextWindow: m.context_length,
        ...(credential.type === "openrouter"
          ? priceFromOpenRouter(m.pricing)
          : {}),
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function testConnection(credential: ProviderCredential) {
  const models = await listModels(credential);
  return { ok: true, modelCount: models.length, models: models.slice(0, 100) };
}

async function* sse(response: Response) {
  if (!response.body)
    throw new Error("Provider returned an empty streaming response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data && data !== "[DONE]") {
        try {
          yield JSON.parse(data) as Record<string, unknown>;
        } catch {
          /* partial provider event */
        }
      }
    }
  }
}

export async function* streamChat(
  credential: ProviderCredential,
  model: string,
  messages: ChatMessage[],
  reasoning: "off" | "low" | "medium" | "high" = "off",
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  if (credential.type === "anthropic") {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const body = {
      model,
      max_tokens: reasoning === "high" ? 16000 : 8192,
      stream: true,
      system: system || undefined,
      messages: messages.filter((m) => m.role !== "system"),
      thinking:
        reasoning === "off"
          ? undefined
          : {
              type: "enabled",
              budget_tokens:
                reasoning === "low"
                  ? 1024
                  : reasoning === "medium"
                    ? 4096
                    : 8192,
            },
    };
    const response = await checked(
      await fetch(`${base(credential)}/messages`, {
        method: "POST",
        headers: headersFor(credential),
        body: JSON.stringify(body),
        signal,
      }),
    );
    let inputTokens = 0,
      outputTokens = 0,
      cachedTokens = 0;
    for await (const event of sse(response)) {
      const delta = event.delta as
        | { type?: string; text?: string; usage?: { output_tokens?: number } }
        | undefined;
      const usage = event.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
          }
        | undefined;
      if (delta?.type === "text_delta" && delta.text)
        yield { type: "text", text: delta.text };
      inputTokens = usage?.input_tokens ?? inputTokens;
      outputTokens =
        usage?.output_tokens ?? delta?.usage?.output_tokens ?? outputTokens;
      cachedTokens = usage?.cache_read_input_tokens ?? cachedTokens;
    }
    yield { type: "usage", usage: { inputTokens, outputTokens, cachedTokens } };
    return;
  }
  if (credential.type === "google") {
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const response = await checked(
      await fetch(
        `${base(credential)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(credential.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: systemText
              ? { parts: [{ text: systemText }] }
              : undefined,
            contents,
            generationConfig:
              reasoning === "off"
                ? undefined
                : {
                    thinkingConfig: {
                      thinkingBudget:
                        reasoning === "low"
                          ? 1024
                          : reasoning === "medium"
                            ? 4096
                            : 8192,
                    },
                  },
          }),
          signal,
        },
      ),
    );
    let usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    for await (const event of sse(response)) {
      const data = event as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          cachedContentTokenCount?: number;
        };
      };
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("") ?? "";
      if (text) yield { type: "text", text };
      if (data.usageMetadata)
        usage = {
          inputTokens: data.usageMetadata.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
          cachedTokens: data.usageMetadata.cachedContentTokenCount ?? 0,
        };
    }
    yield { type: "usage", usage };
    return;
  }
  const response = await checked(
    await fetch(`${base(credential)}/chat/completions`, {
      method: "POST",
      headers: headersFor(credential),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        reasoning_effort:
          reasoning !== "off" && ["openai", "xai"].includes(credential.type)
            ? reasoning
            : undefined,
      }),
      signal,
    }),
  );
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  for await (const event of sse(response)) {
    const data = event as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
        cost?: number;
        cost_in_usd?: number;
      };
    };
    const text = data.choices?.[0]?.delta?.content;
    if (text) yield { type: "text", text };
    if (data.usage)
      usage = {
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
        cachedTokens: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
        costUsd: data.usage.cost_in_usd ?? data.usage.cost,
      };
  }
  yield { type: "usage", usage };
}

export async function completeCoding(
  credential: ProviderCredential,
  model: string,
  messages: ChatMessage[],
  reasoning: "off" | "low" | "medium" | "high" = "medium",
  signal?: AbortSignal,
): Promise<CodingResult> {
  if (credential.type === "anthropic") {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const response = await checked(
      await fetch(`${base(credential)}/messages`, {
        method: "POST",
        headers: headersFor(credential),
        body: JSON.stringify({
          model,
          max_tokens: 20000,
          system,
          messages: messages.filter((m) => m.role !== "system"),
          tools: [codingTool],
          tool_choice: { type: "tool", name: codingTool.name },
          thinking:
            reasoning === "off"
              ? undefined
              : {
                  type: "enabled",
                  budget_tokens:
                    reasoning === "low"
                      ? 1024
                      : reasoning === "medium"
                        ? 4096
                        : 8192,
                },
        }),
        signal,
      }),
    );
    const data = (await response.json()) as {
      content?: Array<{
        type: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    const input = data.content?.find(
      (c) => c.type === "tool_use" && c.name === codingTool.name,
    )?.input;
    return normalizeCoding(input, {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cachedTokens: data.usage?.cache_read_input_tokens ?? 0,
    });
  }
  if (credential.type === "google") {
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const declaration = {
      name: codingTool.name,
      description: codingTool.description,
      parameters: codingTool.input_schema,
    };
    const response = await checked(
      await fetch(
        `${base(credential)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(credential.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: systemText
              ? { parts: [{ text: systemText }] }
              : undefined,
            contents,
            tools: [{ functionDeclarations: [declaration] }],
            generationConfig:
              reasoning === "off"
                ? undefined
                : {
                    thinkingConfig: {
                      thinkingBudget:
                        reasoning === "low"
                          ? 1024
                          : reasoning === "medium"
                            ? 4096
                            : 8192,
                    },
                  },
            toolConfig: {
              functionCallingConfig: {
                mode: "ANY",
                allowedFunctionNames: [codingTool.name],
              },
            },
          }),
          signal,
        },
      ),
    );
    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            functionCall?: { name?: string; args?: Record<string, unknown> };
          }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        cachedContentTokenCount?: number;
      };
    };
    const input = data.candidates?.[0]?.content?.parts?.find(
      (p) => p.functionCall?.name === codingTool.name,
    )?.functionCall?.args;
    return normalizeCoding(input, {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      cachedTokens: data.usageMetadata?.cachedContentTokenCount ?? 0,
    });
  }
  const tool = {
    type: "function",
    function: {
      name: codingTool.name,
      description: codingTool.description,
      parameters: codingTool.input_schema,
      strict: true,
    },
  };
  const response = await checked(
    await fetch(`${base(credential)}/chat/completions`, {
      method: "POST",
      headers: headersFor(credential),
      body: JSON.stringify({
        model,
        messages,
        tools: [tool],
        tool_choice: { type: "function", function: { name: codingTool.name } },
        reasoning_effort:
          reasoning !== "off" && ["openai", "xai"].includes(credential.type)
            ? reasoning
            : undefined,
      }),
      signal,
    }),
  );
  const data = (await response.json()) as {
    choices?: Array<{
      message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      cost?: number;
      cost_in_usd?: number;
    };
  };
  const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const input = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return normalizeCoding(input, {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    costUsd: data.usage?.cost_in_usd ?? data.usage?.cost,
  });
}

function normalizeCoding(
  input: Record<string, unknown> | undefined,
  usage: Usage,
): CodingResult {
  if (!input || !Array.isArray(input.operations))
    throw new Error("The model did not return valid workspace operations.");
  const operations = input.operations
    .filter(
      (
        op,
      ): op is {
        type: string;
        path: string;
        content?: string;
        newPath?: string;
      } =>
        !!op &&
        typeof op === "object" &&
        typeof (op as { type?: unknown }).type === "string" &&
        typeof (op as { path?: unknown }).path === "string",
    )
    .map((op) => ({
      ...op,
      path: safePath(op.path),
      ...(op.newPath ? { newPath: safePath(op.newPath) } : {}),
    })) as CodingResult["operations"];
  return {
    operations,
    explanation: String(input.explanation ?? ""),
    userMessage: String(
      input.user_message ?? "Changes are ready to review in the workspace.",
    ),
    usage,
  };
}

function safePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.split("/").some((part) => part === ".." || !part)
  )
    throw new Error(`Unsafe project path: ${path}`);
  return normalized;
}
