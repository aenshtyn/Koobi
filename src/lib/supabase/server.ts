import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseKey, supabaseUrl } from "./config";

/**
 * Request-scoped client that carries the signed-in user's session. Call inside <Suspense>.
 * `connection()` marks the caller as request-time: supabase-js reads the clock to check token
 * expiry, which Cache Components does not allow while prerendering.
 */
export async function serverClient() {
  await connection();
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
