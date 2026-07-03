import crypto from "node:crypto";
import fs from "node:fs";
import { ensureHome, resolvePaths } from "./paths.js";

const KEY_BYTES = 32;

export function getOrCreateMasterKey(): Buffer {
  const paths = ensureHome(resolvePaths());
  if (fs.existsSync(paths.masterKeyPath)) {
    return Buffer.from(fs.readFileSync(paths.masterKeyPath, "utf8").trim(), "base64");
  }
  const key = crypto.randomBytes(KEY_BYTES);
  fs.writeFileSync(paths.masterKeyPath, `${key.toString("base64")}\n`, { mode: 0o600 });
  return key;
}

export function encryptSecret(plain: string): string {
  const key = getOrCreateMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(encoded: string): string {
  const [version, ivB64, tagB64, cipherB64] = encoded.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !cipherB64) {
    throw new Error("Unsupported encrypted secret format");
  }
  const key = getOrCreateMasterKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, "base64")), decipher.final()]).toString("utf8");
}
