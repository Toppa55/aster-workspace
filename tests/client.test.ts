import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../components/workspace/client";

describe("workspace API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves the HTTP status on authentication errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Sign in required" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const request = api("/api/workspace");
    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      message: "Sign in required",
      status: 401,
    } satisfies Partial<ApiError>);
  });
});
