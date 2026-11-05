import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { testLogins } from "@/lib/supabase/config";

/**
 * Field encryption for the *_enc columns (KRA PIN, payout number; PRD §2.2, NFR-1). AES-256-GCM with a
 * key held only by the server. Format: "v1:" + base64(iv | tag | ciphertext). The database never sees
 * the plain value; staff screens show it masked.
 *
 * KOOBI_FIELD_KEY is 32 random bytes in base64 (openssl rand -base64 32). Without it, only development
 * and test-login deployments fall back to a fixed development key, which must never protect real data.
 */
const DEV_KEY = createHash("sha256").update("koobi-development-only-field-key").digest();

function key(): Buffer {
  const raw = process.env.KOOBI_FIELD_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("KOOBI_FIELD_KEY must be 32 bytes in base64.");
    return k;
  }
  if (process.env.NODE_ENV !== "production" || testLogins) return DEV_KEY;
  throw new Error("KOOBI_FIELD_KEY is not set.");
}

export const canEncrypt = () => {
  try {
    key();
    return true;
  } catch {
    return false;
  }
};

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value?.startsWith("v1:")) return null;
  const buf = Buffer.from(value.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Last three characters only, for screens. */
export function mask(plain: string | null): string | null {
  return plain ? `•••• ${plain.slice(-3)}` : null;
}
