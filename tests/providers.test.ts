import { afterEach, describe, expect, it, vi } from "vitest";
import { completeCoding, listModels, streamChat } from "../lib/ai/adapters";
import { projectWorkspaceMessage } from "../lib/ai/project-message";
import type { ProviderCredential, StreamEvent } from "../lib/ai/types";

const openai: ProviderCredential = {
  id: "openai",
  type: "openai",
  name: "OpenAI",
  apiKey: "test-key",
};
const anthropic: ProviderCredential = {
  id: "anthropic",
  type: "anthropic",
  name: "Anthropic",
  apiKey: "test-key",
};
afterEach(() => vi.restoreAllMocks());

describe("provider adapters", () => {
  it("normalizes dynamic OpenAI model discovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "gpt-test" }] }), {
          status: 200,
        }),
      ),
    );
    const models = await listModels(openai);
    expect(models[0]).toMatchObject({ id: "gpt-test", provider: "openai" });
    expect(models[0].capabilities.streaming).toBe(true);
  });

  it("streams OpenAI-compatible text and token usage", async () => {
    const events = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 1 } } })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(events, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    const result: StreamEvent[] = [];
    for await (const event of streamChat(openai, "gpt-test", [
      { role: "user", content: "Hi" },
    ]))
      result.push(event);
    expect(result[0]).toEqual({ type: "text", text: "Hello" });
    expect(result.at(-1)).toEqual({
      type: "usage",
      usage: {
        inputTokens: 4,
        outputTokens: 2,
        cachedTokens: 1,
        costUsd: undefined,
      },
    });
  });

  it("streams Anthropic messages with normalized usage", async () => {
    const events = [
      `data: ${JSON.stringify({ delta: { type: "text_delta", text: "Claude" } })}\n\n`,
      `data: ${JSON.stringify({ usage: { input_tokens: 8, output_tokens: 3, cache_read_input_tokens: 2 } })}\n\n`,
    ].join("");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(events, { status: 200 })),
    );
    const result: StreamEvent[] = [];
    for await (const event of streamChat(anthropic, "claude-test", [
      { role: "user", content: "Hi" },
    ]))
      result.push(event);
    expect(result[0]).toEqual({ type: "text", text: "Claude" });
    expect(result.at(-1)).toEqual({
      type: "usage",
      usage: { inputTokens: 8, outputTokens: 3, cachedTokens: 2 },
    });
  });

  it("parses structured coding operations without sending invalid reasoning values", async () => {
    const args = {
      operations: [
        {
          type: "create_file",
          path: "src/app.ts",
          content: "export {};",
          newPath: null,
        },
      ],
      explanation: "Created the entry point.",
      user_message: "Done. Review one new file in the workspace.",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "function_call",
              name: "apply_workspace_changes",
              arguments: JSON.stringify(args),
            },
          ],
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await completeCoding(
      openai,
      "gpt-test",
      [{ role: "user", content: "Build it" }],
      "off",
    );
    const request = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as {
      reasoning?: { effort: string };
      input: Array<{ role: string; content: string }>;
      tools: Array<{
        parameters: {
          properties: {
            operations: { items: { required: string[] } };
          };
        };
      }>;
    };
    expect(
      request.tools[0].parameters.properties.operations.items.required,
    ).toEqual(["type", "path", "newPath", "content"]);
    expect(request).not.toHaveProperty("reasoning");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(result.operations).toEqual([
      { type: "create_file", path: "src/app.ts", content: "export {};" },
    ]);
    expect(result.userMessage).not.toContain("export");
  });
});

describe("project chat separation", () => {
  it("summarizes file operations without including their source", () => {
    const secretSource = "export const password = 'must-not-appear';";
    const message = projectWorkspaceMessage([
      { type: "create_file", path: "src/app.ts", content: secretSource },
      { type: "update_file", path: "src/styles.css", content: "body {}" },
    ]);

    expect(message).toContain("src/app.ts");
    expect(message).toContain("src/styles.css");
    expect(message).not.toContain(secretSource);
    expect(message).not.toContain("body {}");
  });
});
