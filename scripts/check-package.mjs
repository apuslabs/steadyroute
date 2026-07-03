import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];

function requireFile(label, relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    failures.push(`${label} is not configured`);
    return;
  }
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`${label} points to missing file: ${relativePath}`);
  }
}

requireFile("main", pkg.main);
for (const [name, relativePath] of Object.entries(pkg.bin ?? {})) {
  requireFile(`bin.${name}`, relativePath);
}

let packFiles = [];
try {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  const parsed = JSON.parse(output);
  packFiles = parsed.flatMap((entry) => entry.files?.map((file) => file.path) ?? []);
} catch (error) {
  failures.push(`npm pack --dry-run --json failed: ${error instanceof Error ? error.message : String(error)}`);
}

for (const relativePath of [pkg.main, ...Object.values(pkg.bin ?? {})].filter(Boolean)) {
  if (!packFiles.includes(relativePath)) {
    failures.push(`package tarball is missing ${relativePath}`);
  }
}

const requiredDocs = ["README.md", "CHANGELOG.md", "LICENSE", "SECURITY.md"];
for (const relativePath of requiredDocs) {
  if (!packFiles.includes(relativePath)) failures.push(`package tarball is missing ${relativePath}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`package metadata ok: ${pkg.name}@${pkg.version}`);
