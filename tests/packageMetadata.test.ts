import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("package metadata", () => {
  it("points main and bin entries at source-backed build outputs", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { main?: string; bin?: Record<string, string> };

    expect(pkg.main).toBe("dist/index.js");
    expect(pkg.bin).toMatchObject({ steadyroute: "dist/cli.js" });
    expect(fs.existsSync("src/index.ts")).toBe(true);
    expect(fs.existsSync("src/cli.ts")).toBe(true);
  });
});
