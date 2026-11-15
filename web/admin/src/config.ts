// The admin site's runtime settings, from /config.json (plan H.8.5 f, E.2). The release writes it from the Terraform
// output `admin_config` plus `releaseId`: the operator pool, its app client and managed-login domain, and the route
// scope. Identifiers only: a public Cognito client has no secret. Nothing is baked into the build.

export type AdminConfig = {
  readonly apiBase: string;
  readonly releaseId: string;
  readonly region: string;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly authDomain: string;
  readonly scope: string;
};

const PATTERNS: Record<keyof AdminConfig, RegExp> = {
  apiBase: /^\/api$/u,
  releaseId: /^[A-Za-z0-9._-]{1,80}$/u,
  region: /^[a-z]{2}-[a-z]+-[0-9]$/u,
  userPoolId: /^[a-z]{2}-[a-z]+-[0-9]_[A-Za-z0-9]+$/u,
  clientId: /^[a-z0-9]{1,128}$/u,
  authDomain: /^[a-z0-9-]+\.auth\.[a-z]{2}-[a-z]+-[0-9]\.amazoncognito\.com$/u,
  scope: /^[a-z0-9-]+\/[a-z0-9-]+$/u,
};

/** Check a parsed config.json; throws with the first bad key's name (never its value). */
export function parseConfig(raw: unknown): AdminConfig {
  if (typeof raw !== "object" || raw === null) throw new Error("config.json is not an object");
  const record = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(PATTERNS) as (keyof AdminConfig)[]) {
    const value = record[key];
    if (typeof value !== "string" || !PATTERNS[key].test(value)) throw new Error(`config.json: ${key} is missing or malformed`);
    out[key] = value;
  }
  return out as AdminConfig;
}

export async function loadConfig(fetchFn: typeof fetch = fetch): Promise<AdminConfig> {
  const response = await fetchFn("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`config.json: HTTP ${response.status}`);
  return parseConfig(await response.json());
}
