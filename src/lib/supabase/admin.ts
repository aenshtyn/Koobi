import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/**
 * Service-role client for the few server paths that move money or read across users:
 * the payment webhook, checkout and payment verification. Never imported by a page that
 * renders user input, never sent to the browser. Needs SUPABASE_SECRET_KEY on the server.
 */
export const hasAdmin = Boolean(supabaseUrl && process.env.SUPABASE_SECRET_KEY);

export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) throw new Error("SUPABASE_SECRET_KEY is not set on the server.");
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
