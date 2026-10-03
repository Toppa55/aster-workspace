import { describe, expect, it } from "vitest";
import { permits, safeAutonomyLevel } from "../lib/projects/autonomy";

describe("project autonomy ladder", () => {
  it("allows actions only up to the configured authority", () => {
    expect(permits("edit", "edit")).toBe(true);
    expect(permits("edit", "push")).toBe(false);
    expect(permits("pr", "push")).toBe(true);
    expect(permits("pr", "merge")).toBe(false);
  });

  it("falls back safely", () => {
    expect(safeAutonomyLevel("unlimited")).toBe("suggest");
  });
});
