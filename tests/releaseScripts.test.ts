import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "scripts", "prepare-release.mjs");
const tempRoots: string[] = [];

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-release-"));
  tempRoots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "steadyroute", version: "0.1.20" }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(root, "package-lock.json"),
    `${JSON.stringify({ name: "steadyroute", version: "0.1.20", packages: { "": { version: "0.1.20" } } }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## 0.1.20 - 2026-07-03\n\n- Previous release.\n");
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("prepare-release script", () => {
  it("bumps package files and prepends normalized changelog notes", () => {
    const root = makeFixture();
    const outputPath = path.join(root, "github-output.txt");

    execFileSync(process.execPath, [
      scriptPath,
      "--root",
      root,
      "--bump",
      "patch",
      "--notes",
      "Add release workflow automation\n- Validate release dry-runs",
      "--github-output",
      outputPath
    ]);

    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")) as {
      version: string;
      packages: Record<string, { version: string }>;
    };
    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");

    expect(pkg.version).toBe("0.1.21");
    expect(lock.version).toBe("0.1.21");
    expect(lock.packages[""].version).toBe("0.1.21");
    expect(fs.readFileSync(path.join(root, ".release-version"), "utf8")).toBe("0.1.21\n");
    expect(fs.readFileSync(outputPath, "utf8")).toBe("version=0.1.21\n");
    expect(changelog).toContain("## 0.1.21 - ");
    expect(changelog.indexOf("## Unreleased")).toBeLessThan(changelog.indexOf("## 0.1.21 - "));
    expect(changelog.indexOf("## 0.1.21 - ")).toBeLessThan(changelog.indexOf("## 0.1.20 - "));
    expect(changelog).toContain("- Add release workflow automation\n- Validate release dry-runs");
  });

  it("moves existing unreleased notes into the release entry without duplicating the section", () => {
    const root = makeFixture();
    fs.writeFileSync(path.join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## 0.1.20 - 2026-07-03",
      "",
      "- Previous release.",
      "",
      "## Unreleased",
      "",
      "- Add acceptance audit.",
      ""
    ].join("\n"));

    execFileSync(process.execPath, [
      scriptPath,
      "--root",
      root,
      "--version",
      "0.1.21",
      "--notes",
      "Publish audit command."
    ]);

    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    expect(changelog.match(/^## Unreleased$/gm)).toHaveLength(1);
    expect(changelog.indexOf("## Unreleased")).toBeLessThan(changelog.indexOf("## 0.1.21 - "));
    expect(changelog.indexOf("## 0.1.21 - ")).toBeLessThan(changelog.indexOf("## 0.1.20 - "));
    expect(changelog).toContain("- Add acceptance audit.\n- Publish audit command.");
    const unreleasedBlock = changelog.slice(changelog.indexOf("## Unreleased"), changelog.indexOf("## 0.1.21 - "));
    expect(unreleasedBlock).not.toContain("Add acceptance audit");
  });

  it("allows release notes to come only from the Unreleased changelog section", () => {
    const root = makeFixture();
    fs.writeFileSync(path.join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "- Automate release publishing.",
      "",
      "## 0.1.20 - 2026-07-03",
      "",
      "- Previous release.",
      ""
    ].join("\n"));

    execFileSync(process.execPath, [
      scriptPath,
      "--root",
      root,
      "--version",
      "0.1.21"
    ]);

    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    expect(changelog.match(/^## Unreleased$/gm)).toHaveLength(1);
    expect(changelog).toContain("## 0.1.21 - ");
    expect(changelog).toContain("- Automate release publishing.");
    const unreleasedBlock = changelog.slice(changelog.indexOf("## Unreleased"), changelog.indexOf("## 0.1.21 - "));
    expect(unreleasedBlock).not.toContain("Automate release publishing");
  });

  it("rejects empty release notes before mutating package metadata", () => {
    const root = makeFixture();

    expect(() =>
      execFileSync(process.execPath, [
        scriptPath,
        "--root",
        root,
        "--version",
        "0.1.21"
      ])
    ).toThrow();

    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")) as {
      version: string;
      packages: Record<string, { version: string }>;
    };
    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");

    expect(pkg.version).toBe("0.1.20");
    expect(lock.version).toBe("0.1.20");
    expect(lock.packages[""].version).toBe("0.1.20");
    expect(changelog).not.toContain("## 0.1.21 - ");
    expect(fs.existsSync(path.join(root, ".release-version"))).toBe(false);
  });
});
