import { describe, expect, it } from "vitest";
import {
  isGitHubRequest,
  isGitHubWorkspaceRequest,
  repositoryFromPrompt,
} from "../lib/integrations/github-selection";

const repositories = [
  { name: "astrid-workspace", full_name: "Toppa55/astrid-workspace" },
];

describe("GitHub context selection", () => {
  it("recognises GitHub and repository requests", () => {
    expect(isGitHubRequest("What can you see on my GitHub?")).toBe(true);
    expect(isGitHubRequest("Check the latest commit in my repo")).toBe(true);
    expect(isGitHubRequest("Write a birthday message")).toBe(false);
  });

  it("opens source-related GitHub requests in a coding workspace", () => {
    expect(
      isGitHubWorkspaceRequest(
        "Open the Astrid GitHub repository and inspect the source files",
      ),
    ).toBe(true);
    expect(isGitHubWorkspaceRequest("How many repos are in my GitHub?")).toBe(
      false,
    );
  });

  it("selects a repository from a GitHub URL", () => {
    expect(
      repositoryFromPrompt(
        "Inspect https://github.com/Toppa55/astrid-workspace please",
        repositories,
      )?.full_name,
    ).toBe("Toppa55/astrid-workspace");
  });

  it("selects a repository by name", () => {
    expect(
      repositoryFromPrompt(
        "Check astrid-workspace for open issues",
        repositories,
      )?.full_name,
    ).toBe("Toppa55/astrid-workspace");
  });
});
