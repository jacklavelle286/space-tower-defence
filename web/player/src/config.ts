/**
 * The site's runtime settings, published by the release as /config.json (H.8.5 f; scripts/publish_static.py). The
 * build itself has no hostnames or pool IDs, so the same bundle works in any environment. Identifiers only: a public
 * Cognito client has no secret.
 */
export interface PlayerConfig {
  apiBase: string;
  region: string;
  userPoolId: string;
  clientId: string;
  authDomain: string;
  scope: string;
  releaseId: string;
}

// The same shapes scripts/publish_static.py checks when it writes the file.
const SHAPES: Record<keyof PlayerConfig, RegExp> = {
  apiBase: /^\/api$/,
  region: /^[a-z]{2}(?:-[a-z]+)+-\d$/,
  userPoolId: /^[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/,
  clientId: /^[a-z0-9]{20,128}$/,
  authDomain: /^[a-z0-9-]+\.auth\.[a-z]{2}(?:-[a-z]+)+-\d\.amazoncognito\.com$/,
  scope: /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/,
  releaseId: /^[A-Za-z0-9._-]{1,80}$/,
};

export class ConfigError extends Error {}

/** Checks a parsed config.json; throws ConfigError naming the first bad key (never its value). */
export function parseConfig(raw: unknown): PlayerConfig {
  if (typeof raw !== "object" || raw === null) throw new ConfigError("config.json is not an object");
  const record = raw as Record<string, unknown>;
  const out: Partial<PlayerConfig> = {};
  for (const key of Object.keys(SHAPES) as (keyof PlayerConfig)[]) {
    const value = record[key];
    if (typeof value !== "string" || !SHAPES[key].test(value)) throw new ConfigError(`config.json: ${key} is missing or malformed`);
    out[key] = value;
  }
  return out as PlayerConfig;
}

/** Loads /config.json, never from a cache (it changes with every release). */
export async function loadConfig(fetchImpl: typeof fetch = fetch): Promise<PlayerConfig> {
  const response = await fetchImpl("/config.json", { cache: "no-store" });
  if (!response.ok) throw new ConfigError(`config.json: HTTP ${response.status}`);
  return parseConfig(await response.json());
}
