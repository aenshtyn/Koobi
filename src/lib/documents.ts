import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/domain/payouts";

/**
 * Verification documents (§2.2, NFR-1): a private bucket, written by the server with the service role.
 * The row that points at the file is inserted under the teacher's own session, so row-level security
 * decides whether the upload belongs to them. Nobody lists documents; a reviewer opens one through
 * public.open_document, which logs the view, and gets a signed link that lasts one minute.
 */
const BUCKET = "verification";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export async function uploadDocument(opts: { file: File; teacherId: string; checkId: string; kind: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasAdmin) return { ok: false, error: "Uploads are not switched on in this environment yet." };
  const { file } = opts;
  if (!file || file.size === 0) return { ok: false, error: "Choose a file." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "The file is over 4 MB. Take a smaller photo or scan." };
  if (!UPLOAD_TYPES.includes(file.type)) return { ok: false, error: "Use a JPG, PNG or PDF." };
  const key = `teacher/${opts.teacherId}/${opts.checkId}/${randomUUID()}.${EXT[file.type]}`;
  const admin = adminClient();
  const up = await admin.storage.from(BUCKET).upload(key, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, error: `Upload failed: ${up.error.message}` };
  const db = await serverClient();
  const { error } = await db.from("verification_documents").insert({ check_id: opts.checkId, teacher_id: opts.teacherId, storage_key: key, kind: opts.kind });
  if (error) {
    await admin.storage.from(BUCKET).remove([key]);
    return { ok: false, error: "This check is no longer taking uploads." };
  }
  return { ok: true };
}

/** For reviewers: logs the view in the database first, then signs a one-minute link. */
export async function openDocument(documentId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!hasAdmin) return { ok: false, error: "Documents are not switched on in this environment yet." };
  const db = await serverClient();
  const { data: key, error } = await db.rpc("open_document", { p_document: documentId });
  if (error || !key) return { ok: false, error: "You cannot open this document." };
  const signed = await adminClient().storage.from(BUCKET).createSignedUrl(String(key), 60);
  if (signed.error || !signed.data) return { ok: false, error: "The file could not be opened." };
  return { ok: true, url: signed.data.signedUrl };
}

/** Parent ID check (FR-ACC-6): same bucket and rules, its own table. */
export async function uploadGuardianDocument(opts: { file: File; checkId: string; kind: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasAdmin) return { ok: false, error: "Uploads are not switched on in this environment yet." };
  const { file } = opts;
  if (!file || file.size === 0) return { ok: false, error: "Choose a photo." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "The file is over 4 MB. Take a smaller photo." };
  if (!UPLOAD_TYPES.includes(file.type)) return { ok: false, error: "Use a JPG, PNG or PDF." };
  const key = `guardian/${opts.checkId}/${randomUUID()}.${EXT[file.type]}`;
  const admin = adminClient();
  const up = await admin.storage.from(BUCKET).upload(key, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, error: `Upload failed: ${up.error.message}` };
  const db = await serverClient();
  const { error } = await db.from("guardian_documents").insert({ check_id: opts.checkId, storage_key: key, kind: opts.kind });
  if (error) {
    await admin.storage.from(BUCKET).remove([key]);
    return { ok: false, error: "This check is no longer taking uploads." };
  }
  return { ok: true };
}

export async function openGuardianDocument(documentId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!hasAdmin) return { ok: false, error: "Documents are not switched on in this environment yet." };
  const db = await serverClient();
  const { data: key, error } = await db.rpc("open_guardian_document", { p_document: documentId });
  if (error || !key) return { ok: false, error: "You cannot open this document." };
  const signed = await adminClient().storage.from(BUCKET).createSignedUrl(String(key), 60);
  if (signed.error || !signed.data) return { ok: false, error: "The file could not be opened." };
  return { ok: true, url: signed.data.signedUrl };
}
