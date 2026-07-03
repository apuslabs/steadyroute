#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    bump: process.env.INPUT_BUMP || "patch",
    version: process.env.INPUT_VERSION || "",
    notes: process.env.RELEASE_NOTES || "",
    versionFile: ".release-version",
    githubOutput: process.env.GITHUB_OUTPUT || ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value) fail(`${arg} requires a value`);
      index += 1;
      return value;
    };

    if (arg === "--root") args.root = readValue();
    else if (arg === "--bump") args.bump = readValue();
    else if (arg === "--version") args.version = readValue();
    else if (arg === "--notes") args.notes = readValue();
    else if (arg === "--version-file") args.versionFile = readValue();
    else if (arg === "--github-output") args.githubOutput = readValue();
    else fail(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseStableVersion(value, label) {
  const match = String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) fail(`${label} must be a stable x.y.z version`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareVersion(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextVersion(current, exactVersion, bump) {
  if (exactVersion) return parseStableVersion(exactVersion, "version input");
  if (bump === "major") return { major: current.major + 1, minor: 0, patch: 0 };
  if (bump === "minor") return { major: current.major, minor: current.minor + 1, patch: 0 };
  if (bump === "patch") return { major: current.major, minor: current.minor, patch: current.patch + 1 };
  fail(`Unsupported bump: ${bump}`);
}

function normalizeNotes(rawNotes) {
  const notes = String(rawNotes)
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line.replace(/^[-*]\s+/, "")}`)
    .join("\n");

  if (!notes) fail("Release notes are required");
  return notes;
}

function updateChangelog(changelog, version, notes) {
  const marker = "# Changelog";
  const body = changelog.startsWith(marker) ? changelog.slice(marker.length).replace(/^\s*/, "") : changelog.trimStart();
  const sections = body.split(/(?=^## )/m).filter((section) => section.trim());
  const unreleasedIndex = sections.findIndex((section) => /^## Unreleased\b/m.test(section));
  const unreleased = unreleasedIndex >= 0 ? sections.splice(unreleasedIndex, 1)[0] : "## Unreleased\n\n";
  const unreleasedBody = unreleased.replace(/^## Unreleased[^\n]*\n?/, "").trim();
  const combinedNotes = [unreleasedBody, notes].filter(Boolean).join("\n");
  const entry = `## ${version} - ${shanghaiDate()}\n\n${combinedNotes}\n\n`;
  return `${marker}\n\n## Unreleased\n\n${entry}${sections.join("").replace(/^\s*/, "")}`;
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root);
const pkgPath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const changelogPath = path.join(root, "CHANGELOG.md");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const current = parseStableVersion(pkg.version, "package.json version");
const target = nextVersion(current, args.version.trim(), args.bump.trim());

if (compareVersion(target, current) <= 0) {
  fail(`Release version ${formatVersion(target)} must be greater than current version ${formatVersion(current)}`);
}

const version = formatVersion(target);
const notes = normalizeNotes(args.notes);

pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
lock.version = version;
if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const changelog = fs.readFileSync(changelogPath, "utf8");
if (new RegExp(`^## ${version} - `, "m").test(changelog)) {
  fail(`CHANGELOG.md already contains a ${version} entry`);
}

fs.writeFileSync(changelogPath, updateChangelog(changelog, version, notes));

fs.writeFileSync(path.resolve(root, args.versionFile), `${version}\n`);
if (args.githubOutput) fs.appendFileSync(path.resolve(args.githubOutput), `version=${version}\n`);

console.log(`Prepared v${version}`);
