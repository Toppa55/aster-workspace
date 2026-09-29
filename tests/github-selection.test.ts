import { describe, expect, it } from "vitest";
import {
  isGitHubRequest,
  repositoryFromPrompt,
} from "../lib/integrations/github-selection";

const repositories = [
  { name: "aster-workspace", full_name: "Toppa55/aster-workspace" },
];

describe("GitHub context selection", () => {
  it("recognises GitHub and repository requests", () => {
    expect(isGitHubRequest("What can you see on my GitHub?")).toBe(true);
    expect(isGitHubRequest("Check the latest commit in my repo")).toBe(true);
    expect(isGitHubRequest("Write a birthday message")).toBe(false);
  });

  it("selects a repository from a GitHub URL", () => {
    expect(
      repositoryFromPrompt(
        "Inspect https://github.com/Toppa55/aster-workspace please",
        repositories,
      )?.full_name,
    ).toBe("Toppa55/aster-workspace");
  });

  it("selects a repository by name", () => {
    expect(
      repositoryFromPrompt(
        "Check aster-workspace for open issues",
        repositories,
      )?.full_name,
    ).toBe("Toppa55/aster-workspace");
  });
});
