import { describe, expect, it } from "vitest";
import { projectReadOnlyMessage } from "../lib/ai/project-message";

describe("project read-only messages", () => {
  it("keeps inspection results when no file edit was requested", () => {
    expect(
      projectReadOnlyMessage(
        "I inspected app/api/chat/route.ts. No files were changed.",
        "",
      ),
    ).toContain("No files were changed");
  });

  it("does not leak fenced source code into project chat", () => {
    const message = projectReadOnlyMessage(
      "Review complete.\n```ts\nconst secret = 'code';\n```",
      "",
    );
    expect(message).not.toContain("const secret");
    expect(message).toContain("Code workspace");
  });
});
