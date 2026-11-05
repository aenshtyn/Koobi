import "server-only";
import { cookies } from "next/headers";
import { DRAFT_COOKIE } from "./constants";

/** A request typed before sign-in, restored after it. */
export async function readDraft(): Promise<Record<string, string>> {
  const raw = (await cookies()).get(DRAFT_COOKIE)?.value;
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}
