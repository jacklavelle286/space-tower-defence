import { describe, expect, it } from "vitest";
import { ApiError, adminApi, describeError, makeRequest, pictureUsers, speechUsers } from "./api";

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
    await api.approve("phoneme-sh", { draftRevision: 3, clipKey: "c".repeat(64) });
    const call = calls[0];
    if (call === undefined) throw new Error("no request was sent");
    expect(call.url).toBe("/api/admin/speech-definitions/phoneme-sh/approve");
    expect(call.init.method).toBe("POST");
    expect((call.init.headers as Record<string, string>)["Authorization"]).toBe("Bearer token-1");
    expect(call.init.body).toBe(JSON.stringify({ draftRevision: 3, clipKey: "c".repeat(64) }));
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

  it("deletes an activity with DELETE and no body (R31)", async () => {
    const calls: Call[] = [];
    const api = adminApi(makeRequest("/api", "t", fakeFetch(200, { activityId: "ph-0102", deletedVersions: ["20261115T120000Z"] }, calls)));
    expect(await api.deleteActivity("ph-0102")).toEqual({ activityId: "ph-0102", deletedVersions: ["20261115T120000Z"] });
    expect(calls.map((c) => [c.url, c.init.method, c.init.body])).toEqual([["/api/admin/activities/ph-0102", "DELETE", undefined]]);
    const missing = await adminApi(makeRequest("/api", "t", fakeFetch(404, { error: { code: "NOT_FOUND", message: "x" } })))
      .deleteActivity("ph-0102")
      .catch((e: unknown) => e);
    expect(describeError(missing)).toBe("Not found.");
  });

  it("deletes a speech definition with DELETE and reads a refusal's activities (R32)", async () => {
    const calls: Call[] = [];
    const api = adminApi(makeRequest("/api", "t", fakeFetch(200, { speechId: "word-cat", deletedVersions: [] }, calls)));
    expect(await api.deleteSpeech("word-cat")).toEqual({ speechId: "word-cat", deletedVersions: [] });
    expect(calls.map((c) => [c.url, c.init.method, c.init.body])).toEqual([["/api/admin/speech-definitions/word-cat", "DELETE", undefined]]);
    const details = [
      { field: "usedBy.ph-0102", rule: "speech_in_use" },
      { field: "usedBy.ph-0199", rule: "speech_in_use" },
    ];
    const refused = await adminApi(makeRequest("/api", "t", fakeFetch(400, { error: { code: "VALIDATION_FAILED", message: "x", details } })))
      .deleteSpeech("phoneme-sh")
      .catch((e: unknown) => e);
    expect(speechUsers(refused)).toEqual(["ph-0102", "ph-0199"]);
    expect(speechUsers(new ApiError(400, "VALIDATION_FAILED", [{ field: "speechId", rule: "pattern" }]))).toEqual([]);
    expect(speechUsers(new ApiError(404, "NOT_FOUND"))).toEqual([]);
  });

  it("does not trust a body that is not our envelope", async () => {
    const error = await makeRequest("/api", "t", fakeFetch(502, "<html>"))("GET", "/admin/x").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("GATEWAY");
  });

  it("reads every page of the activity list, following nextCursor", async () => {
    const urls: string[] = [];
    const row = (activityId: string) => ({ activityId });
    const pages: Record<string, unknown> = {
      "/api/admin/activities?limit=200": { items: [row("ma-0001"), row("ma-0002")], nextCursor: "ma-0002" },
      "/api/admin/activities?limit=200&cursor=ma-0002": { items: [row("ph-0001")], nextCursor: null },
    };
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(pages[url]), { status: 200 });
    }) as unknown as typeof fetch;
    const list = await adminApi(makeRequest("/api", "t", fetchFn)).listActivities();
    expect(list.items.map((i) => i.activityId)).toEqual(["ma-0001", "ma-0002", "ph-0001"]);
    expect(urls).toEqual(Object.keys(pages));
  });

  it("calls the picture routes R33-R39 with the design's paths and bodies", async () => {
    const calls: Call[] = [];
    const api = adminApi(makeRequest("/api", "t", fakeFetch(200, {}, calls)));
    const pic = `lib-${"a".repeat(32)}`;
    const job = "0b6f5a4e-1d2c-4b3a-9f8e-7d6c5b4a3f2e";
    await api.listPictures();
    await api.listPictures("APPROVED");
    await api.listPictures("APPROVED", "avatar");
    await api.listPictures(undefined, "activity-scene");
    await api.createPicture({ name: "Cat", source: "UPLOAD", kind: "activity-scene", pngBase64: "iVBO", approve: true, textFree: true });
    await api.getPicture(pic);
    await api.approvePicture(pic, { textFree: true });
    await api.deletePicture(pic);
    await api.startPictureJob({ jobId: job, description: "a red kite", kind: "avatar" });
    await api.getPictureJob(job);
    expect(calls.map((c) => [c.init.method, c.url, c.init.body === undefined ? undefined : JSON.parse(c.init.body as string)])).toEqual([
      ["GET", "/api/admin/pictures", undefined],
      ["GET", "/api/admin/pictures?state=APPROVED", undefined],
      ["GET", "/api/admin/pictures?state=APPROVED&kind=avatar", undefined],
      ["GET", "/api/admin/pictures?kind=activity-scene", undefined],
      ["POST", "/api/admin/pictures", { name: "Cat", source: "UPLOAD", kind: "activity-scene", pngBase64: "iVBO", approve: true, textFree: true }],
      ["GET", `/api/admin/pictures/${pic}`, undefined],
      ["POST", `/api/admin/pictures/${pic}/approve`, { textFree: true }],
      ["DELETE", `/api/admin/pictures/${pic}`, undefined],
      ["POST", "/api/admin/picture-jobs", { jobId: job, description: "a red kite", kind: "avatar" }],
      ["GET", `/api/admin/picture-jobs/${job}`, undefined],
    ]);
  });

  it("keeps a code's structured details (the cap's period) and reads a picture delete refusal", async () => {
    const capped = await makeRequest("/api", "t", fakeFetch(429, { error: { code: "PICTURE_CAP_REACHED", message: "x", details: { period: "day", resetsAt: "2026-11-17T00:00:00Z" } } }))(
      "POST",
      "/admin/picture-jobs",
    ).catch((e: unknown) => e);
    expect((capped as ApiError).info).toEqual({ period: "day", resetsAt: "2026-11-17T00:00:00Z" });
    expect((capped as ApiError).details).toEqual([]);
    const details = [{ field: "usedBy.ph-0102", rule: "picture_in_use" }, { field: "usedBy.ph-0102", rule: "speech_in_use" }];
    const refused = await makeRequest("/api", "t", fakeFetch(400, { error: { code: "VALIDATION_FAILED", message: "x", details } }))("DELETE", "/admin/pictures/x").catch(
      (e: unknown) => e,
    );
    expect(pictureUsers(refused)).toEqual(["ph-0102"]);
    expect((refused as ApiError).info).toEqual({});
    expect(pictureUsers(new ApiError(404, "NOT_FOUND"))).toEqual([]);
  });
});
