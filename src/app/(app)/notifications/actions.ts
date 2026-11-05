"use server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase/server";

export async function markAllRead() {
  const db = await serverClient();
  await db.rpc("mark_notifications_read");
  revalidatePath("/notifications");
}
