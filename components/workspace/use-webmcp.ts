"use client";
import { useEffect } from "react";

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          annotations?: {
            readOnlyHint?: boolean;
            untrustedContentHint?: boolean;
          };
          execute: (input: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

export function useWebMcp(actions: {
  createChat: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
}) {
  const { createChat, createProject } = actions;
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const report = (error: unknown) =>
      console.warn(
        "WebMCP registration failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "create_chat",
            title: "Create chat",
            description:
              "Create a new empty Astrid conversation and make it the active view.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async () => {
              await createChat();
              return { status: "created" };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(report);
      void Promise.resolve(
        context.registerTool(
          {
            name: "create_project",
            title: "Create project",
            description:
              "Create a persistent coding project with its first project chat.",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
              },
              required: ["name"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async (input) => {
              const name = (input as { name?: unknown }).name;
              if (typeof name !== "string" || !name.trim())
                throw new Error("A non-empty project name is required.");
              await createProject(name.trim());
              return { status: "created", name: name.trim() };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(report);
    } catch (error) {
      report(error);
    }
    return () => lifecycle.abort();
  }, [createChat, createProject]);
}
