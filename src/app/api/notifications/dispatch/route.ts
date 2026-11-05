import { timingSafeEqual } from "node:crypto";
import { dispatchQueued } from "@/lib/notifications";

/**
 * Called every minute by Supabase (pg_cron + pg_net, see 20261106000600_cron_notifications.sql) with
 * Authorization: Bearer <CRON_SECRET>. Sends queued SMS, WhatsApp and email.
 */
function authorised(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export async function POST(req: Request) {
  if (!authorised(req)) return new Response("Unauthorised", { status: 401 });
  const result = await dispatchQueued(100);
  return Response.json(result);
}

export const GET = POST;
