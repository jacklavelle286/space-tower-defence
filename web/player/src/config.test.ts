import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseConfig } from "./config";

const GOOD = {
  apiBase: "/api",
  region: "eu-west-2",
  userPoolId: "eu-west-2_AbCdEf123",
  clientId: "abcdefghij0123456789abcd",
  authDomain: "example-players.auth.eu-west-2.amazoncognito.com",
  scope: "game/play",
  releaseId: "20261115T1311Z-fdfd597",
};

describe("config.json", () => {
  it("accepts the shape the release publishes", () => {
    expect(parseConfig(GOOD)).toEqual(GOOD);
  });

  it.each(Object.keys(GOOD))("refuses a missing %s", (key) => {
    const bad: Record<string, unknown> = { ...GOOD };
    delete bad[key];
    expect(() => parseConfig(bad)).toThrow(ConfigError);
  });

  it("refuses a cross-origin API base", () => {
    expect(() => parseConfig({ ...GOOD, apiBase: "https://api.example.com" })).toThrow(/apiBase/);
  });

  it("loads without the HTTP cache and fails on a non-200", async () => {
    let init: RequestInit | undefined;
    const ok = await loadConfig(async (_url, i) => ((init = i), new Response(JSON.stringify(GOOD))));
    expect(ok.clientId).toBe(GOOD.clientId);
    expect(init?.cache).toBe("no-store");
    await expect(loadConfig(async () => new Response("", { status: 404 }))).rejects.toThrow(ConfigError);
  });
});
