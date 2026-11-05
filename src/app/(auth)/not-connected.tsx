import Link from "next/link";
import { hasSupabase } from "@/lib/supabase/config";

/** Local development without Supabase: say so plainly instead of failing on submit. */
export function NotConnected() {
  if (hasSupabase) return null;
  return (
    <div className="panel info" role="note">
      <p>
        <b>Sign-in is not connected here.</b> Add the Supabase keys to <span className="mono">.env.local</span> to send real
        codes. In local development the signed-in screens open without signing in:{" "}
        <Link href="/home">learner</Link>, <Link href="/teach">teacher</Link>, <Link href="/staff">staff</Link>.
      </p>
    </div>
  );
}
