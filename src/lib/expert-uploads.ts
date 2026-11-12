import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { DOCUMENT, PHOTO, VIDEO } from "@/domain/expert";

/**
 * Files an expert uploads: the profile photo, identity and qualification documents, and the
 * introduction video. A video of 200 MB cannot pass through a server action (4 MB at most), so every
 * file goes from the browser straight to storage with a signed upload link that the server issues for
 * one exact path under the expert's own folder. Afterwards the server looks at what actually arrived
 * (size and type) before any row points at it.
 *
 * Buckets: photos are public (they show on the public profile); documents and videos are private and
 * open only through signed links that last a short time.
 */
export type UploadKind = "photo" | "document" | "video";

const RULES: Record<UploadKind, { bucket: string; maxBytes: number; types: readonly string[] }> = {
  photo: { bucket: "expert-photos", ...PHOTO },
  document: { bucket: "verification", ...DOCUMENT },
  video: { bucket: "expert-videos", ...VIDEO },
};
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf", "video/mp4": "mp4", "video/quicktime": "mov" };

const OFF = "Uploads are not switched on in this environment yet.";
const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export type UploadTarget = { url: string; path: string };

export function checkFile(kind: UploadKind, mime: string, size: number): string | null {
  const rule = RULES[kind];
  if (!rule.types.includes(mime)) return kind === "video" ? "Use an MP4 or MOV file." : kind === "photo" ? "Use a JPG or PNG." : "Use a PDF, JPG or PNG.";
  if (!Number.isFinite(size) || size <= 0) return "Choose a file.";
  if (size > rule.maxBytes) return `The file is over ${mb(rule.maxBytes)}.`;
  return null;
}

/** A one-time link the browser can PUT one file to. */
export async function signUpload(kind: UploadKind, teacherId: string, mime: string, size: number): Promise<{ ok: true; target: UploadTarget } | { ok: false; error: string }> {
  if (!hasAdmin) return { ok: false, error: OFF };
  const problem = checkFile(kind, mime, size);
  if (problem) return { ok: false, error: problem };
  const path = `expert/${teacherId}/${randomUUID()}.${EXT[mime]}`;
  const signed = await adminClient().storage.from(RULES[kind].bucket).createSignedUploadUrl(path);
  if (signed.error || !signed.data) return { ok: false, error: /not found/i.test(signed.error?.message ?? "") ? "Uploads are being switched on. Try again later." : `The upload could not start: ${signed.error?.message ?? "unknown error"}` };
  return { ok: true, target: { url: signed.data.signedUrl, path } };
}

/** What really arrived at a path the server issued: must sit in the expert's folder and keep the rules. */
export async function verifyUpload(kind: UploadKind, teacherId: string, path: string): Promise<{ ok: true; size: number; mime: string } | { ok: false; error: string }> {
  if (!hasAdmin) return { ok: false, error: OFF };
  if (!new RegExp(`^expert/${teacherId}/[0-9a-f-]{36}\\.[a-z0-9]{3,4}$`).test(path)) return { ok: false, error: "That file does not belong to you." };
  const bucket = adminClient().storage.from(RULES[kind].bucket);
  const info = await bucket.info(path);
  if (info.error || !info.data) return { ok: false, error: "The file did not finish uploading. Try again." };
  const size = Number(info.data.size ?? info.data.metadata?.size ?? 0);
  const mime = String(info.data.contentType ?? info.data.metadata?.mimetype ?? "");
  const problem = checkFile(kind, mime, size);
  if (problem) {
    await bucket.remove([path]);
    return { ok: false, error: problem };
  }
  return { ok: true, size, mime };
}

export async function removeUploads(kind: UploadKind, paths: string[]) {
  if (hasAdmin && paths.length) await adminClient().storage.from(RULES[kind].bucket).remove(paths);
}

export function photoUrl(path: string): string {
  return adminClient().storage.from(RULES.photo.bucket).getPublicUrl(path).data.publicUrl;
}

/** True when a photo address is one of ours, so nobody can point their profile at an outside image. */
export function isOwnPhoto(url: string, teacherId: string): boolean {
  return hasAdmin && url.startsWith(photoUrl(`expert/${teacherId}/`));
}

/** A link to a private file that lasts a short time (a document for a minute, a video for an hour). */
export async function signView(kind: "document" | "video", key: string, seconds: number): Promise<string | null> {
  if (!hasAdmin) return null;
  const signed = await adminClient().storage.from(RULES[kind].bucket).createSignedUrl(key, seconds);
  return signed.error || !signed.data ? null : signed.data.signedUrl;
}
