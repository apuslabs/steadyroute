import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addProviderKey, getProviderKey, listProviderKeys, openDb, removeProviderKey } from "../src/db.js";

describe("provider key store", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("lists and removes provider key aliases without exposing secret values", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-keys-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();

    addProviderKey(db, "openrouter", "default", "sk-secret-never-list");
    addProviderKey(db, "openrouter", "dogfood", "sk-second-secret");

    const listed = listProviderKeys(db);
    expect(listed).toHaveLength(2);
    expect(listed.map((key) => `${key.provider}/${key.alias}`)).toEqual(["openrouter/default", "openrouter/dogfood"]);
    expect(JSON.stringify(listed)).not.toContain("sk-secret");

    expect(removeProviderKey(db, "openrouter", "dogfood")).toBe(true);
    expect(getProviderKey(db, "openrouter", "dogfood")).toBeNull();
    expect(getProviderKey(db, "openrouter", "default")).toBe("sk-secret-never-list");
    expect(removeProviderKey(db, "openrouter", "missing")).toBe(false);
  });
});
