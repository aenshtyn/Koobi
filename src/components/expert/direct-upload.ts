"use client";

/**
 * Sends one file from the browser straight to storage, to a one-time link the server issued. Used for
 * the profile photo, documents and the introduction video (up to 200 MB, far over what a form post
 * to the server may carry). Reports progress as a whole per cent.
 */
export function putFile(url: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      let message = "The upload did not go through. Try again.";
      if (xhr.status === 413) message = "The file is too large for storage to accept.";
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        if (/exceeded the maximum allowed size/i.test(parsed.message ?? "")) message = "The file is too large for storage to accept.";
        else if (/mime type/i.test(parsed.message ?? "")) message = "That kind of file is not accepted.";
      } catch {
        // keep the plain message
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("The connection dropped during the upload. Try again."));
    xhr.send(body);
  });
}

/** Reads a video file's length in seconds without uploading it. */
export function videoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const src = URL.createObjectURL(file);
    const done = (v: number | null) => {
      URL.revokeObjectURL(src);
      resolve(v);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = src;
  });
}
