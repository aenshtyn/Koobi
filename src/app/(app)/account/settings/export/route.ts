import { serverClient } from "@/lib/supabase/server";

/** FR-ACC-7: the caller's data as a JSON download. Logged as an export request. */
export async function GET() {
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response("Sign in first.", { status: 401 });
  const { data, error } = await db.rpc("my_data_export");
  if (error) return new Response("Could not build the export.", { status: 500 });
  const logged = await db.rpc("log_data_export");
  if (logged.error) await db.from("data_requests").insert({ kind: "export", note: "Downloaded from Settings" }); // before migration 0900
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="koobi-my-data.json"`, "Cache-Control": "no-store" },
  });
}
