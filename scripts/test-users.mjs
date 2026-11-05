#!/usr/bin/env node
// Creates or resets one test account per role in a NON-production Supabase project.
// Run:  npm run test-users     (reads .env.local)
//
// Needs in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL   the project URL
//   SUPABASE_SECRET_KEY        Settings → API Keys → secret key (never commit, never NEXT_PUBLIC_)
//   KOOBI_TEST_LOGINS=true     the same flag that shows /signin/test; refuses to run without it
//   KOOBI_TEST_PASSWORD        optional; generated and written to .env.local when missing
//
// Accounts use the reserved .test domain, so no email is ever sent. Re-running resets passwords,
// names and roles, and returns the "new" account to a just-signed-up state.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import TEST_ACCOUNTS from "../src/config/test-accounts.json" with { type: "json" };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (process.env.KOOBI_TEST_LOGINS !== "true") die("KOOBI_TEST_LOGINS is not true. Test accounts are for dev and staging projects only.");
if (!url) die("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.");
if (!secret) die("SUPABASE_SECRET_KEY is missing from .env.local (Supabase → Settings → API Keys → secret key).");

let password = process.env.KOOBI_TEST_PASSWORD;
if (!password) {
  password = randomBytes(15).toString("base64url");
  appendFileSync(".env.local", `\n# Shared password for the test accounts (scripts/test-users.mjs)\nKOOBI_TEST_PASSWORD=${password}\n`);
  console.log("• Generated KOOBI_TEST_PASSWORD and saved it to .env.local");
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const ref = new URL(url).hostname.split(".")[0];
console.log(`Target project: ${ref}\n`);

const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) die(`Could not list users: ${error.message}`);
  for (const u of data.users) if (u.email) existing.set(u.email, u.id);
  if (data.users.length < 1000) break;
}

for (const a of TEST_ACCOUNTS) {
  const attrs = { password, email_confirm: true, user_metadata: { display_name: a.name ?? "" } };
  let id = existing.get(a.email);
  if (id) {
    const { error } = await db.auth.admin.updateUserById(id, attrs);
    if (error) die(`${a.email}: ${error.message}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({ email: a.email, ...attrs });
    if (error) die(`${a.email}: ${error.message}`);
    id = data.user.id;
  }

  const { error: pErr } = await db.from("profiles").update({ display_name: a.name }).eq("id", id);
  if (pErr) die(`${a.email} profile: ${pErr.message}`);
  const { error: dErr } = await db.from("user_roles").delete().eq("user_id", id);
  if (dErr) die(`${a.email} roles: ${dErr.message}`);
  if (a.roles.length) {
    const { error: rErr } = await db.from("user_roles").insert(a.roles.map((role) => ({ user_id: id, role })));
    if (rErr) die(`${a.email} roles: ${rErr.message}`);
  }
  console.log(`✓ ${a.key.padEnd(10)} ${a.email.padEnd(24)} ${a.roles.join(", ") || "(no role yet: tests the welcome screen)"}`);
}

console.log(`\nSign in at /signin/test with any account above and the password in .env.local (KOOBI_TEST_PASSWORD).`);
