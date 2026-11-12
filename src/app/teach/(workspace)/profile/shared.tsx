import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Application } from "@/domain/expert";
import { getMyApplication, getProfileChanges, type MyApplication, type ProfileChange } from "@/lib/data/expert";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export function BackToProfile() {
  return (
    <Link className="btn3 self-start" href="/teach/profile">
      <ArrowLeft size={16} aria-hidden="true" />
      Back to Public Profile
    </Link>
  );
}

/** The approved expert's row, the change waiting for review, and the two merged: the draft they are editing. */
export async function loadDraft(): Promise<{ app: MyApplication; pending: ProfileChange | null; draft: Application; email: string | null }> {
  const { app } = await getMyApplication();
  if (!app) redirect("/teach/apply");
  const [{ pending }, email] = await Promise.all([getProfileChanges(app.id), accountEmail()]);
  const draft = { ...app, ...((pending?.changes ?? {}) as Partial<Application>) };
  return { app, pending, draft, email };
}

async function accountEmail(): Promise<string | null> {
  if (!hasSupabase) return null;
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  return data.user?.email ?? null;
}

export function PendingNote({ pending, fields }: { pending: ProfileChange | null; fields: string[] }) {
  if (!pending || !fields.some((f) => f in pending.changes)) return null;
  return (
    <p className="panel info" role="status">
      You are looking at your draft. Some of these details are waiting for review; learners still see the earlier version.
    </p>
  );
}
