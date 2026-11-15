import { describe, expect, it } from "vitest";
import { ApiError, adminApi, describeError, makeRequest } from "./api";

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("API client", () => {
  it("sends the access token to the same-origin /api", async () => {
    const calls: Call[] = [];
    const api = adminApi(makeRequest("/api", "token-1", fakeFetch(200, { versionId: "v" }, calls)));
    await api.approve("phoneme-sh", { draftRevision: 3 });
    const call = calls[0];
    if (call === undefined) throw new Error("no request was sent");
    expect(call.url).toBe("/api/admin/speech-definitions/phoneme-sh/approve");
    expect(call.init.method).toBe("POST");
    expect((call.init.headers as Record<string, string>)["Authorization"]).toBe("Bearer token-1");
    expect(call.init.body).toBe(JSON.stringify({ draftRevision: 3 }));
  });

  it("reads our envelope's code and problems", async () => {
    const body = { error: { code: "VALIDATION_FAILED", message: "x", details: [{ field: "draft", rule: "not_previewed" }] } };
    const request = makeRequest("/api", "t", fakeFetch(400, body));
    const error = await request("POST", "/admin/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toEqual([{ field: "draft", rule: "not_previewed" }]);
    expect(describeError(error)).toBe("Not accepted: draft (not_previewed).");
  });

  it("treats a gateway 401 as sign in again, without reading its body", async () => {
    const error = await makeRequest("/api", "t", fakeFetch(401, { message: "Unauthorized" }))("GET", "/admin/x").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("AUTH_REQUIRED");
    expect(describeError(error)).toBe("Your sign-in has expired. Sign in again.");
  });

  it("shows the D8 copy for a non-admin operator and a draft conflict", () => {
    expect(describeError(new ApiError(403, "FORBIDDEN"))).toBe("This account can't use the content admin.");
    expect(describeError(new ApiError(409, "DRAFT_CONFLICT"))).toBe(
      "Someone saved this draft after you opened it. Reload to see their changes.",
    );
  });

  it("does not trust a body that is not our envelope", async () => {
    const error = await makeRequest("/api", "t", fakeFetch(502, "<html>"))("GET", "/admin/x").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("GATEWAY");
  });
});
