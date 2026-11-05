/** Supabase is optional in local development: without keys the app runs on dev fixtures. */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const hasSupabase = Boolean(supabaseUrl && supabaseKey);

/**
 * Fixtures stand in for the catalogue only when Supabase is not configured AND we are in
 * development (or a preview opts in with KOOBI_DEV_SEED=true). Production without a database
 * shows empty states, never sample data (PRD FR-MATCH-6, nothing fabricated).
 */
/**
 * Test accounts (one per role, password sign-in at /signin/test) for dev and staging projects.
 * Never set on production: it also relaxes the staff authenticator requirement.
 */
export const testLogins = process.env.KOOBI_TEST_LOGINS === "true";

export const useDevSeed =
  !hasSupabase && (process.env.NODE_ENV === "development" || process.env.KOOBI_DEV_SEED === "true");
