import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Plan E.5.1: only the player app uses Phaser. oxlint refuses an import in admin/ (web/.oxlintrc.json); this also
// checks the package's own dependencies, so the admin bundle cannot pull Phaser in through package.json either.
const ROOT = join(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sources(join(dir, entry.name)) : /\.(ts|tsx)$/u.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe("admin bundle", () => {
  it("has no Phaser dependency and no Phaser import", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    expect(Object.keys({ ...pkg["dependencies"], ...pkg["devDependencies"] })).not.toContain("phaser");
    const importers = sources(join(ROOT, "src")).filter(
      (file) => !file.endsWith("no-phaser.test.ts") && /from\s+["']phaser/u.test(readFileSync(file, "utf8")),
    );
    expect(importers).toEqual([]);
  });
});
