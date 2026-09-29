import { describe, expect, it } from "vitest";
import {
  isCodingWorkspaceRequest,
  projectNameFromPrompt,
} from "../lib/ai/coding-intent";

describe("coding workspace intent", () => {
  it.each([
    "Build me a budgeting app",
    "Create a website for my business",
    "Add authentication to the dashboard",
    "Please refactor the source code",
    "Generate the project files and folder structure",
  ])("routes %s into a project", (prompt) => {
    expect(isCodingWorkspaceRequest(prompt)).toBe(true);
  });

  it.each([
    "Explain how React works",
    "Write a birthday message",
    "What is an API?",
    "Brainstorm names for my business",
  ])("keeps %s as an ordinary chat", (prompt) => {
    expect(isCodingWorkspaceRequest(prompt)).toBe(false);
  });

  it("creates a short project name", () => {
    expect(
      projectNameFromPrompt("Please build me a stock tracking app today"),
    ).toBe("build me a stock tracking app");
  });
});
