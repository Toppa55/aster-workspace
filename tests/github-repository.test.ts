import { describe, expect, it } from "vitest";
import {
  isReadableSourcePath,
  selectSourceEntries,
} from "../lib/integrations/github-repository";

const entry = (path: string, size = 100) => ({
  path,
  size,
  sha: path,
  mode: "100644",
  type: "blob" as const,
});

describe("GitHub repository source selection", () => {
  it("accepts source files and rejects dependencies and generated files", () => {
    expect(isReadableSourcePath("src/app/page.tsx", 500)).toBe(true);
    expect(isReadableSourcePath("README.md", 500)).toBe(true);
    expect(isReadableSourcePath("node_modules/pkg/index.js", 500)).toBe(false);
    expect(isReadableSourcePath("dist/app.js", 500)).toBe(false);
    expect(isReadableSourcePath("public/photo.png", 500)).toBe(false);
  });

  it("ranks files mentioned in the prompt ahead of generic files", () => {
    const selected = selectSourceEntries(
      [
        entry("src/chat/message.tsx"),
        entry("src/settings/page.tsx"),
        entry("README.md"),
      ],
      "Review the chat message component",
      { maxFiles: 2, maxBytes: 10_000 },
    );
    expect(selected[0].path).toBe("src/chat/message.tsx");
  });

  it("respects file and byte limits", () => {
    const selected = selectSourceEntries(
      [entry("README.md", 80), entry("package.json", 80), entry("app.ts", 80)],
      "inspect source",
      { maxFiles: 3, maxBytes: 160 },
    );
    expect(selected).toHaveLength(2);
  });
});
