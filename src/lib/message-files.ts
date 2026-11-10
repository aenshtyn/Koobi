import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/domain/payouts";

/**
 * Files in messages: a private bucket written by the server. The message row that points at the file
 * is inserted under the sender's own session, where the database checks the file belongs to the
 * conversation and that the pair may share files yet. A reader gets a signed link that lasts a minute.
 */
const BUCKET = "messages";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export async function uploadMessageFile(threadId: string, file: File): Promise<{ ok: true; key: string; name: string } | { ok: false; error: string }> {
  if (!hasAdmin) return { ok: false, error: "Files are not switched on in this environment yet." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "The file is over 4 MB. Send a smaller one." };
  if (!UPLOAD_TYPES.includes(file.type)) return { ok: false, error: "Send a JPG, PNG or PDF." };
  const key = `thread/${threadId}/${randomUUID()}.${EXT[file.type]}`;
  const up = await adminClient().storage.from(BUCKET).upload(key, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, error: `The file could not be sent: ${up.error.message}` };
  const name = (file.name || `file.${EXT[file.type]}`).replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 120) || `file.${EXT[file.type]}`;
  return { ok: true, key, name };
}

export async function removeMessageFile(key: string) {
  if (hasAdmin) await adminClient().storage.from(BUCKET).remove([key]);
}

export async function signMessageFile(key: string): Promise<string | null> {
  if (!hasAdmin) return null;
  const signed = await adminClient().storage.from(BUCKET).createSignedUrl(key, 60);
  return signed.error || !signed.data ? null : signed.data.signedUrl;
}
