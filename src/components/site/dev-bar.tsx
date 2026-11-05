import Link from "next/link";
import { useDevSeed } from "@/lib/supabase/config";

/** Visible only when dev fixtures stand in for Supabase, so sample data is never mistaken for real. */
export function DevBar() {
  if (!useDevSeed) return null;
  return (
    <div className="devbar" role="note">
      <div className="page-wrap flex flex-wrap items-center justify-between gap-2 py-2">
        <span>Local preview: the people and offers shown are sample data. Add Supabase keys to show real listings.</span>
        <Link href="/dev/pages">Page map</Link>
      </div>
    </div>
  );
}
