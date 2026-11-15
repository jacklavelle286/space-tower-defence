import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const GOOD = {
  apiBase: "/api",
  releaseId: "2026-11-20-abc1234",
  region: "eu-west-2",
  userPoolId: "eu-west-2_Example1",
  clientId: "exampleclientid",
  authDomain: "scd-example-ops.auth.eu-west-2.amazoncognito.com",
  scope: "ops/content",
};

describe("config.json", () => {
  it("accepts the release's shape", () => {
    expect(parseConfig(GOOD)).toEqual(GOOD);
  });

  it("names the bad key, never its value", () => {
    expect(() => parseConfig({ ...GOOD, authDomain: "evil.example.com" })).toThrow("config.json: authDomain is missing or malformed");
    expect(() => parseConfig({ ...GOOD, apiBase: "https://api.example.com" })).toThrow("apiBase");
    expect(() => parseConfig(null)).toThrow();
  });
});
