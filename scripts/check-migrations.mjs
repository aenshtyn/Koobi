#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-expressions -- assertions are written as `cond ? pass() : fail()` */
// Applies supabase/migrations/*.sql and supabase/seed.sql to an in-memory Postgres (PGlite) with stubs
// for what Supabase provides, then checks the schema's contracts and invariants.
// Usage: node scripts/check-migrations.mjs   (exit code 1 on any failure)

import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const seedPath = path.join(root, 'supabase', 'seed.sql');

let failures = 0;
let passes = 0;
const pass = (name) => { passes++; console.log(`PASS ${name}`); };
const fail = (name, detail) => { failures++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); };

// What Supabase gives every project: roles, the auth schema, auth.uid()/role()/jwt(), default grants.
const SUPABASE_STUBS = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Like the hosted project: no automatic table or sequence grants, so every table a later migration
-- adds must grant itself (the sprint 1 grants ran once, over the tables that existed then).
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const db = new PGlite();

async function main() {
  await db.exec(SUPABASE_STUBS);

  // ---------------------------------------------------------------- migrations
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const cronAvailable = (await db.query(`select 1 from pg_available_extensions where name = 'pg_cron'`)).rows.length > 0;
  for (const file of files) {
    if (/cron/i.test(file) && !cronAvailable) {
      console.log(`SKIP ${file} (pg_cron not available in PGlite)`);
      continue;
    }
    try {
      await db.exec(await readFile(path.join(migrationsDir, file), 'utf8'));
      pass(`migration ${file} applies`);
    } catch (e) {
      fail(`migration ${file} applies`, e.message);
      return;
    }
  }
  try {
    await db.exec(await readFile(seedPath, 'utf8'));
    pass('seed.sql applies');
    await db.exec(await readFile(seedPath, 'utf8'));
    pass('seed.sql is idempotent (applied twice)');
  } catch (e) {
    fail('seed.sql applies', e.message);
    return;
  }

  await checkStatic();
  await checkLedgerCommit();

  await db.exec('begin');
  try {
    await checkInTransaction();
  } finally {
    await db.exec('rollback');
  }

  await db.exec('begin');
  try {
    await checkAppListingFlow();
  } finally {
    await db.exec('rollback');
  }

  await db.exec('begin');
  try {
    await checkAppMatchingFlow();
  } finally {
    await db.exec('rollback');
  }

  await db.exec('begin');
  try {
    await checkAppBookingFlow();
  } finally {
    await db.exec('rollback');
  }

  await db.exec('begin');
  try {
    await checkAppSessionFlow();
  } finally {
    await db.exec('rollback');
  }

  await db.exec('begin');
  try {
    await checkAppPayoutFlow();
  } finally {
    await db.exec('rollback');
  }

  await db.exec('begin');
  try {
    await checkAppSprint7Flow();
  } finally {
    await db.exec('rollback');
  }

  await db.exec('begin');
  try {
    await checkHardening();
  } finally {
    await db.exec('rollback');
  }
}

// ---------------------------------------------------------------------------- helpers
async function rows(sql, params) {
  return (await db.query(sql, params)).rows;
}

let sp = 0;
// Runs fn as a Supabase role (anon / authenticated) with JWT claims, inside a savepoint that is
// rolled back afterwards. Returns fn's value or throws its error.
async function as(role, sub, fn) {
  const name = `sp_${++sp}`;
  await db.exec(`savepoint ${name}`);
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    if (role !== 'postgres') await db.exec(`set local role ${role}`);
    return await fn();
  } finally {
    await db.exec(`rollback to savepoint ${name}; release savepoint ${name}`);
  }
}

async function expectOk(name, role, sub, fn, check) {
  try {
    const value = await as(role, sub, fn);
    if (check) {
      const problem = check(value);
      if (problem) return fail(name, problem);
    }
    pass(name);
  } catch (e) {
    fail(name, `unexpected error: ${e.message}`);
  }
}

async function expectError(name, role, sub, fn, pattern) {
  try {
    await as(role, sub, fn);
    fail(name, 'expected an error, got success');
  } catch (e) {
    if (pattern && !pattern.test(e.message)) fail(name, `wrong error: ${e.message}`);
    else pass(name);
  }
}

const q = (sql, params) => () => db.query(sql, params);

// ---------------------------------------------------------------------------- static checks
async function checkStatic() {
  const ungranted = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v') and not has_table_privilege('service_role', c.oid, 'select')`)).rows.map((r) => r.relname);
  ungranted.length ? fail('every public table and view is readable by the server role', ungranted.join(', ')) : pass('every public table and view is readable by the server role');

  const noRls = await rows(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`);
  if (noRls.length) fail('RLS enabled on every public table', noRls.map((r) => r.relname).join(', '));
  else pass(`RLS enabled on every public table (${(await rows(`select count(*)::int n from pg_tables where schemaname = 'public'`))[0].n} tables)`);

  // Seed contents
  const cats = (await rows(`select code from public.categories order by sort_order`)).map((r) => r.code);
  const expectedCats = ['career_professional_growth', 'business_entrepreneurship', 'school_academic', 'digital_practical_skills'];
  JSON.stringify(cats) === JSON.stringify(expectedCats) ? pass('seed: exactly the four categories') : fail('seed: exactly the four categories', cats.join(','));

  const tracks = (await rows(`select code from public.tracks order by sort_order`)).map((r) => r.code);
  JSON.stringify(tracks) === JSON.stringify(['school', 'adults_professional', 'practical'])
    ? pass('seed: exactly the three tracks') : fail('seed: exactly the three tracks', tracks.join(','));

  const formats = Object.fromEntries((await rows(`select code, price_basis from public.formats`)).map((r) => [r.code, r.price_basis]));
  const expectedFormats = { one_to_one: 'session', small_group: 'seat', cohort: 'programme', workshop: 'seat', site_visit: 'visit' };
  JSON.stringify(formats, Object.keys(expectedFormats)) === JSON.stringify(expectedFormats) && Object.keys(formats).length === 5
    ? pass('seed: five formats with price basis') : fail('seed: five formats with price basis', JSON.stringify(formats));

  const mapping = (await rows(`select category_code || ':' || track_code as m from public.category_tracks order by 1`)).map((r) => r.m);
  const expectedMapping = ['business_entrepreneurship:adults_professional', 'business_entrepreneurship:practical',
    'career_professional_growth:adults_professional', 'digital_practical_skills:adults_professional',
    'digital_practical_skills:practical', 'school_academic:school'];
  JSON.stringify(mapping) === JSON.stringify(expectedMapping) ? pass('seed: category to track mapping (PRD §1.1)') : fail('seed: category to track mapping', mapping.join(','));

  const forms = await rows(`select count(*)::int n from public.levels where code like 'form_%' and sunset_on is not null`);
  forms[0].n === 4 ? pass('seed: 8-4-4 Form 1 to 4 carry a sunset date') : fail('seed: 8-4-4 Form 1 to 4 carry a sunset date', String(forms[0].n));

  const estates = (await rows(`select code from public.estates order by sort_order`)).map((r) => r.code);
  estates.length === 9 ? pass('seed: the nine named estates') : fail('seed: the nine named estates', estates.join(','));

  const params = await rows(`select private.param('rating_min_reviews') #>> '{}' as rmr,
                                    private.param('withholding_rate') #>> '{}' as wht,
                                    private.param('commission_rate', null, 'one_to_one', 'online') -> 'tiers' -> 1 ->> 'rate' as c50`);
  params[0].rmr === '3' && params[0].wht === '0.05' && params[0].c50 === '0.15'
    ? pass('seed: dated parameters resolve (rating_min_reviews, withholding, sliding commission)')
    : fail('seed: dated parameters resolve', JSON.stringify(params[0]));

  // Banned words in seed and migrations
  const sources = [seedPath, ...(await readdir(migrationsDir)).map((f) => path.join(migrationsDir, f))];
  const offenders = [];
  for (const file of sources) {
    if (/\b(tutor\w*|holiday tuition)\b/i.test(await readFile(file, 'utf8'))) offenders.push(path.basename(file));
  }
  offenders.length ? fail('no "tutor" or "holiday tuition" in seed or migrations', offenders.join(', ')) : pass('no "tutor" or "holiday tuition" in seed or migrations');

  // Public read contract: exact columns and types
  const contract = {
    explore_offers: 'id uuid, slug text, title text, summary text, category text, track text, format text, price_kes int4, price_basis text, duration_minutes int4, sessions_in_run int4, modes _text, county text, estate text, next_start timestamptz, seats_left int4, rating_avg numeric, review_count int4, teacher_slug text, teacher_name text, teacher_headline text, teacher_photo_url text, badges jsonb, published_at timestamptz, rank_tier int4',
    offer_details: 'id uuid, slug text, description text, outcomes _text, languages _text, meeting_tool text, trial_price_kes int4, package_prices jsonb, next_slots _timestamptz',
    public_teachers: 'slug text, display_name text, headline text, bio text, photo_url text, languages _text, county text, badges jsonb, response_time_minutes int4, review_count int4, rating_avg numeric, member_since date',
    public_reviews: 'offering_id uuid, teacher_slug text, rating int4, body text, created_at timestamptz, reviewer_first_name text',
  };
  for (const [view, expected] of Object.entries(contract)) {
    const actual = (await rows(`select column_name || ' ' || udt_name as c from information_schema.columns
                                 where table_schema = 'public' and table_name = $1 order by ordinal_position`, [view]))
      .map((r) => r.c).join(', ');
    actual === expected ? pass(`contract: public.${view} columns`) : fail(`contract: public.${view} columns`, `got [${actual}]`);
  }

  const tableContract = {
    categories: ['code text', 'label text', 'description text', 'sort_order int4', 'is_active bool'],
    tracks: ['code text', 'label text'],
    formats: ['code text', 'label text', 'price_basis text'],
    profiles: ['display_name text', 'phone_e164 text'],
    user_roles: ['user_id uuid', 'role app_role'],
    requests: ['id uuid', 'requester_id uuid', 'learner_id uuid', 'category text', 'track text', 'subject text', 'goal text',
      'level text', 'mode text', 'county text', 'estate text', 'budget_max_kes int4', 'schedule_notes text', 'notes text',
      'status request_status', 'created_at timestamptz'],
  };
  for (const [table, cols] of Object.entries(tableContract)) {
    const actual = new Set((await rows(`select column_name || ' ' || udt_name as c from information_schema.columns
                                         where table_schema = 'public' and table_name = $1`, [table])).map((r) => r.c));
    const missing = cols.filter((c) => !actual.has(c));
    missing.length ? fail(`contract: public.${table} columns`, `missing ${missing.join(', ')}`) : pass(`contract: public.${table} columns`);
  }
  const reqDefaults = await rows(`select column_name, column_default, is_nullable from information_schema.columns
                                   where table_schema = 'public' and table_name = 'requests'
                                     and column_name in ('requester_id', 'status', 'learner_id', 'level', 'notes')`);
  const d = Object.fromEntries(reqDefaults.map((r) => [r.column_name, r]));
  /auth\.uid\(\)/.test(d.requester_id?.column_default ?? '') && /'submitted'/.test(d.status?.column_default ?? '')
    && d.learner_id?.is_nullable === 'YES' && d.level?.is_nullable === 'YES' && d.notes?.is_nullable === 'YES'
    ? pass('contract: requests defaults (requester_id = auth.uid(), status = submitted) and nullables')
    : fail('contract: requests defaults', JSON.stringify(reqDefaults));
}

// ---------------------------------------------------------------------------- ledger commit checks
async function checkLedgerCommit() {
  // A balanced journal commits.
  try {
    await db.exec(`
      begin;
      insert into public.ledger_transactions (id, kind, idempotency_key, posted_by)
        values ('00000000-0000-0000-0000-00000000a001', 'test_payout', 'check:balanced', 'system:check');
      insert into public.ledger_entries (txn_id, account, side, amount_kes) values
        ('00000000-0000-0000-0000-00000000a001', 'expense_verification', 'debit', 30),
        ('00000000-0000-0000-0000-00000000a001', 'cash_provider', 'credit', 30);
      commit;`);
    pass('ledger: a balanced journal commits');
  } catch (e) {
    await db.exec('rollback').catch(() => {});
    fail('ledger: a balanced journal commits', e.message);
  }

  // An unbalanced journal is rejected at commit.
  try {
    await db.exec(`
      begin;
      insert into public.ledger_transactions (id, kind, idempotency_key, posted_by)
        values ('00000000-0000-0000-0000-00000000a002', 'payment_hold', 'check:unbalanced', 'system:check');
      insert into public.ledger_entries (txn_id, account, side, amount_kes) values
        ('00000000-0000-0000-0000-00000000a002', 'cash_provider', 'debit', 1475),
        ('00000000-0000-0000-0000-00000000a002', 'expense_payment_fees', 'debit', 25),
        ('00000000-0000-0000-0000-00000000a002', 'client_funds_held', 'credit', 1400);
      commit;`);
    fail('ledger: an unbalanced journal is rejected at commit', 'committed');
  } catch (e) {
    await db.exec('rollback').catch(() => {});
    /unbalanced ledger journal/.test(e.message) ? pass('ledger: an unbalanced journal is rejected at commit')
      : fail('ledger: an unbalanced journal is rejected at commit', e.message);
  }
  const leaked = await rows(`select count(*)::int n from public.ledger_transactions where idempotency_key = 'check:unbalanced'`);
  leaked[0].n === 0 ? pass('ledger: nothing of the rejected journal persists') : fail('ledger: nothing of the rejected journal persists');

  // A journal with no legs is rejected at commit.
  try {
    await db.exec(`begin;
      insert into public.ledger_transactions (kind, idempotency_key, posted_by) values ('payment_hold', 'check:empty', 'system:check');
      commit;`);
    fail('ledger: a journal without legs is rejected', 'committed');
  } catch {
    await db.exec('rollback').catch(() => {});
    pass('ledger: a journal without legs is rejected');
  }
}

// ---------------------------------------------------------------------------- behaviour (rolled back)
const U = {
  teacher: '11111111-1111-1111-1111-111111111111',
  guardian: '22222222-2222-2222-2222-222222222222',
  other: '33333333-3333-3333-3333-333333333333',
  reviewer: '44444444-4444-4444-4444-444444444444',
};
const ID = {
  teacher: 'aaaaaaaa-0000-0000-0000-000000000001',
  offerApproved: 'bbbbbbbb-0000-0000-0000-000000000001',
  offerDraft: 'bbbbbbbb-0000-0000-0000-000000000002',
  guardian: 'cccccccc-0000-0000-0000-000000000001',
  learner: 'dddddddd-0000-0000-0000-000000000001',
};

async function checkInTransaction() {
  // Ledger immutability (on the journal committed above)
  await expectError('ledger: entries are append-only (update)', 'postgres', null,
    q(`update public.ledger_entries set amount_kes = 31 where txn_id = '00000000-0000-0000-0000-00000000a001'`), /append-only/);
  await expectError('ledger: entries are append-only (delete)', 'postgres', null,
    q(`delete from public.ledger_entries where txn_id = '00000000-0000-0000-0000-00000000a001'`), /append-only/);
  await expectError('ledger: a closed journal cannot be extended', 'postgres', null,
    q(`insert into public.ledger_entries (txn_id, account, side, amount_kes) values
       ('00000000-0000-0000-0000-00000000a001', 'cash_provider', 'debit', 5),
       ('00000000-0000-0000-0000-00000000a001', 'adjustments', 'credit', 5)`), /closed/);
  await expectError('ledger: adjustments need two different staff', 'postgres', null,
    q(`insert into public.ledger_transactions (kind, idempotency_key, requested_by) values ('adjustment', 'check:adj', null)`), /ledger_dual_control/);
  await expectError('ledger: authenticated users cannot post entries', 'authenticated', U.other,
    q(`insert into public.ledger_transactions (kind, idempotency_key) values ('payment_hold', 'check:user')`), /permission denied/);

  // ---- fixtures (as the system)
  await db.exec(`
    insert into auth.users (id, email, phone, raw_user_meta_data) values
      ('${U.teacher}',  't@example.test', '254700000001', '{"display_name": "Wanjiru Teacher"}'),
      ('${U.guardian}', 'g@example.test', '254700000002', '{"display_name": "Achieng Parent"}'),
      ('${U.other}',    'o@example.test', '254700000003', '{}'),
      ('${U.reviewer}', 'r@example.test', '254700000004', '{}');
    insert into public.user_roles (user_id, role) values
      ('${U.teacher}', 'teacher'), ('${U.guardian}', 'guardian'), ('${U.reviewer}', 'reviewer');
    insert into public.teachers (id, user_id, display_name, headline, county_code, base_estate_code, languages)
      values ('${ID.teacher}', '${U.teacher}', 'Wanjiru K.', 'Mathematics teacher, 8 years', 'nairobi', 'kilimani', '{en,sw}');
    insert into public.teacher_tracks (teacher_id, track) values ('${ID.teacher}', 'school');
    insert into public.offerings (id, teacher_id, title, summary, category, track, format, modes, meeting_tool,
                                  price_hour_kes, duration_minutes, trial_discount_pct, price_pkg8_kes, outcomes, language_codes)
      values ('${ID.offerApproved}', '${ID.teacher}', 'KCSE Mathematics revision', 'Past papers and weak topics',
              'school_academic', 'school', 'one_to_one', '{online,in_home}', 'google_meet', 1500, 60, 50, 11000,
              '{"Quadratic equations","Past paper timing"}', '{en}'),
             ('${ID.offerDraft}', '${ID.teacher}', 'Draft physics offer', null,
              'school_academic', 'school', 'one_to_one', '{online}', null, 1200, 60, null, null, '{}', '{en}');
    insert into public.availability_windows (offering_id, kind, weekday, starts, ends)
      select '${ID.offerApproved}', 'weekly', d, '06:00', '22:00' from generate_series(0, 6) d;
    insert into public.verification_checks (teacher_id, tier, check_type) values ('${ID.teacher}', 1, 'identity_iprs');
    update public.verification_checks set status = 'in_review' where check_type = 'identity_iprs';
    update public.verification_checks set status = 'passed' where check_type = 'identity_iprs';
    insert into public.verification_checks (teacher_id, tier, check_type, track) values ('${ID.teacher}', 3, 'good_conduct', 'school');
    insert into public.guardians (id, user_id, display_name) values ('${ID.guardian}', '${U.guardian}', 'Achieng');
    insert into public.learners (id, guardian_id, alias, year_of_birth) values ('${ID.learner}', '${ID.guardian}', 'A.', 2010);
    insert into public.consents (guardian_id, learner_id, text_version, channel) values ('${ID.guardian}', '${ID.learner}', 'v1', 'web');
  `);
  const prof = await rows(`select phone_e164, display_name from public.profiles where id = $1`, [U.teacher]);
  prof[0]?.phone_e164 === '+254700000001' && prof[0]?.display_name === 'Wanjiru Teacher'
    ? pass('profiles: created on auth sign-up with E.164 phone') : fail('profiles: created on auth sign-up', JSON.stringify(prof));
  const minor = await rows(`select is_minor, consent_status from public.learners where id = $1`, [ID.learner]);
  minor[0].is_minor === true && minor[0].consent_status === 'active'
    ? pass('learners: minor derived and consent recorded') : fail('learners: minor derived and consent recorded', JSON.stringify(minor[0]));

  // ---- roles
  await expectOk('claim_role: a user can claim guardian (idempotent)', 'authenticated', U.other, async () => {
    await db.query(`select public.claim_role('guardian')`);
    await db.query(`select public.claim_role('guardian')`);
    return (await db.query(`select public.has_role('guardian') as ok, public.my_roles() as roles`)).rows[0];
  }, (r) => (r.ok ? null : `has_role false, roles ${r.roles}`));
  await expectError("claim_role: claiming 'admin' fails", 'authenticated', U.other, q(`select public.claim_role('admin')`), /cannot be self-assigned/);
  await expectError("claim_role: claiming 'reviewer' fails", 'authenticated', U.other, q(`select public.claim_role('reviewer')`), /cannot be self-assigned/);
  await expectError('claim_role: anon cannot call it', 'anon', null, q(`select public.claim_role('learner')`), /permission denied/);
  await expectError('user_roles: a user cannot insert a staff role directly', 'authenticated', U.other,
    q(`insert into public.user_roles (user_id, role) values ('${U.other}', 'admin')`), /row-level security/);

  // ---- onboarding flows the UI runs with the user's JWT (insert ... returning, as supabase-js does)
  await expectOk('onboarding: a new teacher creates a profile, a track and a draft offer', 'authenticated', U.other, async () => {
    await db.query(`select public.claim_role('teacher')`);
    const t = (await db.query(`insert into public.teachers (display_name, headline) values ('Otieno O.', 'Excel for small business')
                               returning id, slug, listing_status, status`)).rows[0];
    await db.query(`insert into public.teacher_tracks (teacher_id, track) values ($1, 'adults_professional')`, [t.id]);
    const o = (await db.query(`insert into public.offerings (teacher_id, title, category, track, format, modes, price_hour_kes)
                               values ($1, 'Excel for bookkeeping', 'digital_practical_skills', 'adults_professional', 'one_to_one', '{online}', 1200)
                               returning id, slug, listing_status`, [t.id])).rows[0];
    return { t, o };
  }, ({ t, o }) => (t.listing_status === 'draft' && t.status === 'applied' && /^otieno-o-[0-9a-f]{6}$/.test(t.slug)
    && o.listing_status === 'draft' && /^excel-for-bookkeeping-/.test(o.slug) ? null : JSON.stringify({ t, o })));
  await expectError('onboarding: a teacher cannot waitlist-release or tier themselves', 'authenticated', U.other, async () => {
    const t = (await db.query(`insert into public.teachers (display_name) values ('Otieno O.') returning id`)).rows[0];
    await db.query(`insert into public.teacher_tracks (teacher_id, track, waitlist_status) values ($1, 'practical', 'waitlisted')`, [t.id]);
  }, /not allowed for this caller/);
  await expectOk('onboarding: a guardian adds a child with consent', 'authenticated', U.other, async () => {
    const g = (await db.query(`insert into public.guardians (display_name) values ('Otieno') returning id`)).rows[0];
    const l = (await db.query(`insert into public.learners (guardian_id, alias, year_of_birth, level_code) values ($1, 'Kid', 2014, 'junior_school')
                               returning id, consent_status`, [g.id])).rows[0];
    await db.query(`insert into public.consents (guardian_id, learner_id, text_version, channel) values ($1, $2, 'v1', 'web')`, [g.id, l.id]);
    return { before: l.consent_status, after: (await db.query(`select consent_status from public.learners where id = $1`, [l.id])).rows[0].consent_status };
  }, (r) => (r.before === 'pending' && r.after === 'active' ? null : JSON.stringify(r)));

  // ---- listing state machine
  await expectError('listing: draft -> approved is rejected', 'postgres', null,
    q(`update public.offerings set listing_status = 'approved' where id = '${ID.offerDraft}'`), /illegal listing transition: draft -> approved/);
  await expectOk('listing: the teacher submits their own offer (draft -> pending_review)', 'authenticated', U.teacher,
    q(`update public.offerings set listing_status = 'pending_review' where id = '${ID.offerApproved}' returning listing_status`),
    (r) => (r.rows[0]?.listing_status === 'pending_review' ? null : 'not updated'));
  await expectError('listing: a teacher cannot approve their own offer', 'authenticated', U.teacher, async () => {
    await db.query(`update public.offerings set listing_status = 'pending_review' where id = '${ID.offerApproved}'`);
    await db.query(`update public.offerings set listing_status = 'approved' where id = '${ID.offerApproved}'`);
  }, /not allowed for this caller/);

  // Reviewer approves the teacher profile and the first offer (committed to the test transaction)
  await db.exec(`
    update public.teachers set listing_status = 'pending_review' where id = '${ID.teacher}';
    update public.offerings set listing_status = 'pending_review' where id = '${ID.offerApproved}';`);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.reviewer, role: 'authenticated' })]);
  await db.exec(`set local role authenticated;
    update public.teachers set listing_status = 'approved' where id = '${ID.teacher}';
    update public.offerings set listing_status = 'approved' where id = '${ID.offerApproved}';
    reset role;`);
  await db.query(`select set_config('request.jwt.claims', '', true)`);
  const approved = await rows(`select listing_status, published_at is not null as published, reviewed_by from public.offerings where id = $1`, [ID.offerApproved]);
  approved[0].listing_status === 'approved' && approved[0].published && approved[0].reviewed_by === U.reviewer
    ? pass('listing: a reviewer approves; published_at and reviewed_by are stamped') : fail('listing: reviewer approval', JSON.stringify(approved[0]));
  const hist = await rows(`select count(*)::int n from public.state_history where entity_id = $1`, [ID.offerApproved]);
  const outbox = await rows(`select count(*)::int n from public.outbox where topic = 'listing.approved' and aggregate_id = $1`, [ID.offerApproved]);
  hist[0].n >= 3 && outbox[0].n === 1 ? pass('transitions write state_history and an outbox event')
    : fail('transitions write state_history and an outbox event', `history ${hist[0].n}, outbox ${outbox[0].n}`);

  // ---- anonymous access
  for (const rel of ['explore_offers', 'offer_details', 'public_teachers', 'public_reviews', 'categories', 'tracks', 'formats', 'modes', 'estates']) {
    await expectOk(`anon: can read public.${rel}`, 'anon', null, q(`select * from public.${rel} limit 5`));
  }
  for (const rel of ['teachers', 'payments', 'profiles', 'offerings', 'requests', 'verification_checks', 'verification_documents', 'ledger_entries', 'learners']) {
    await expectError(`anon: cannot read public.${rel}`, 'anon', null, q(`select * from public.${rel} limit 1`), /permission denied/);
  }

  // ---- explore_offers visibility and fields
  await expectOk('explore_offers: shows the approved offer, hides the draft', 'anon', null,
    q(`select * from public.explore_offers`), (r) => {
      const ids = r.rows.map((x) => x.id);
      if (!ids.includes(ID.offerApproved)) return 'approved offer missing';
      if (ids.includes(ID.offerDraft)) return 'draft offer visible';
      return null;
    });
  await expectOk('explore_offers: card fields (price, basis, locality, badges, no rating yet)', 'anon', null,
    q(`select * from public.explore_offers where id = $1`, [ID.offerApproved]), (r) => {
      const o = r.rows[0];
      const labels = (o.badges ?? []).map((b) => b.label);
      const problems = [];
      if (o.price_kes !== 1500) problems.push(`price_kes ${o.price_kes}`);
      if (o.price_basis !== 'session') problems.push(`price_basis ${o.price_basis}`);
      if (o.county !== 'Nairobi' || o.estate !== 'Kilimani') problems.push(`locality ${o.county}/${o.estate}`);
      if (JSON.stringify(labels) !== '["ID verified"]') problems.push(`badges ${JSON.stringify(o.badges)}`);
      if (!o.badges?.[0]?.passed_at) problems.push('badge without passed_at');
      if (o.rating_avg !== null || o.review_count !== 0) problems.push(`rating ${o.rating_avg}/${o.review_count}`);
      if (!o.next_start) problems.push('next_start null');
      if (o.teacher_slug == null || o.teacher_name !== 'Wanjiru K.') problems.push('teacher fields');
      return problems.join('; ') || null;
    });
  await expectOk('offer_details: trial, packages, meeting tool, languages, next slots', 'anon', null,
    q(`select * from public.offer_details where id = $1`, [ID.offerApproved]), (r) => {
      const o = r.rows[0];
      if (!o) return 'row missing';
      const problems = [];
      if (o.trial_price_kes !== 750) problems.push(`trial_price_kes ${o.trial_price_kes}`);
      if (JSON.stringify(o.package_prices) !== '[{"sessions":8,"price_kes":11000}]') problems.push(`package_prices ${JSON.stringify(o.package_prices)}`);
      if (o.meeting_tool !== 'Google Meet') problems.push(`meeting_tool ${o.meeting_tool}`);
      if (JSON.stringify(o.languages) !== '["English"]') problems.push(`languages ${JSON.stringify(o.languages)}`);
      if (!Array.isArray(o.next_slots) || o.next_slots.length < 1 || o.next_slots.length > 6) problems.push(`next_slots ${o.next_slots?.length}`);
      if (JSON.stringify(o.outcomes) !== '["Quadratic equations","Past paper timing"]') problems.push('outcomes');
      return problems.join('; ') || null;
    });
  await expectOk('offer_details: hides the draft offer', 'anon', null,
    q(`select count(*)::int n from public.offer_details where id = $1`, [ID.offerDraft]), (r) => (r.rows[0].n === 0 ? null : 'visible'));
  await expectOk('public_teachers: shows the approved teacher with languages and county', 'anon', null,
    q(`select * from public.public_teachers`), (r) => {
      const t = r.rows[0];
      if (r.rows.length !== 1) return `${r.rows.length} rows`;
      if (JSON.stringify(t.languages) !== '["English","Kiswahili"]' || t.county !== 'Nairobi') return JSON.stringify(t);
      return null;
    });
  await expectOk('explore_offers: a waitlisted teacher is hidden', 'postgres', null, async () => {
    await db.query(`update public.teacher_tracks set waitlist_status = 'waitlisted' where teacher_id = $1`, [ID.teacher]);
    return (await db.query(`select (select count(*) from public.explore_offers)::int as offers,
                                   (select count(*) from public.public_teachers)::int as teachers`)).rows[0];
  }, (r) => (r.offers === 0 && r.teachers === 0 ? null : JSON.stringify(r)));
  await expectOk('explore_offers: a suspended teacher is hidden', 'postgres', null, async () => {
    await db.query(`update public.teachers set status = 'suspended' where id = $1`, [ID.teacher]);
    return (await db.query(`select count(*)::int n from public.explore_offers`)).rows[0].n;
  }, (n) => (n === 0 ? null : `${n} rows`));

  // ---- requests
  await expectOk('requests: a user inserts a request for themselves and reads it back', 'authenticated', U.guardian, async () => {
    await db.query(`insert into public.requests (category, track, subject, goal, mode, notes)
                    values ('school_academic', 'school', 'Mathematics', 'Pass KCSE', 'online', 'Evenings please')`);
    return (await db.query(`select requester_id, status from public.requests`)).rows;
  }, (r) => (r.length === 1 && r[0].requester_id === U.guardian && r[0].status === 'submitted' ? null : JSON.stringify(r)));
  await expectError('requests: a user cannot insert a request for someone else', 'authenticated', U.guardian,
    q(`insert into public.requests (requester_id, category, track, subject, goal, mode)
       values ('${U.other}', 'school_academic', 'school', 'Mathematics', 'Pass KCSE', 'online')`), /row-level security/);
  await expectError("requests: a user cannot attach someone else's learner", 'authenticated', U.other,
    q(`insert into public.requests (learner_id, category, track, subject, goal, mode)
       values ('${ID.learner}', 'school_academic', 'school', 'Mathematics', 'Pass KCSE', 'online')`), /row-level security/);
  await expectError('requests: notes over 500 characters are rejected', 'authenticated', U.guardian,
    q(`insert into public.requests (category, track, subject, goal, mode, notes)
       values ('school_academic', 'school', 'Maths', 'Pass', 'online', repeat('x', 501))`), /check constraint/);
  await expectError('requests: the track must be one the category allows', 'authenticated', U.guardian,
    q(`insert into public.requests (category, track, subject, goal, mode)
       values ('school_academic', 'practical', 'Maths', 'Pass', 'online')`), /requests_category_allows_track/);
  await expectError('requests: anon cannot insert', 'anon', null,
    q(`insert into public.requests (requester_id, category, track, subject, goal, mode)
       values ('${U.guardian}', 'school_academic', 'school', 'Maths', 'Pass', 'online')`), /permission denied/);
  await expectError('requests: a requester cannot triage their own request', 'authenticated', U.guardian, async () => {
    await db.query(`insert into public.requests (category, track, subject, goal, mode) values ('school_academic', 'school', 'Maths', 'Pass', 'online')`);
    await db.query(`update public.requests set status = 'triaged'`);
  }, /not allowed for this caller/);
  await expectOk("requests: other users cannot see someone's request", 'postgres', null, async () => {
    await db.query(`insert into public.requests (requester_id, category, track, subject, goal, mode)
                    values ($1, 'school_academic', 'school', 'Maths', 'Pass', 'online')`, [U.guardian]);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.other, role: 'authenticated' })]);
    await db.exec('set local role authenticated');
    return (await db.query(`select count(*)::int n from public.requests`)).rows[0].n;
  }, (n) => (n === 0 ? null : `${n} visible`));

  // ---- bookings, payments, reviews (teacher restored to visible first)
  await expectOk('bookings: price and teacher come from the offering; payment amount from the booking', 'authenticated', U.guardian, async () => {
    const b = (await db.query(`insert into public.bookings (offering_id, learner_id, kind, mode, starts_at)
                               values ($1, $2, 'trial', 'online', now() + interval '3 days')
                               returning id, teacher_id, price_kes, discount_kes, status`, [ID.offerApproved, ID.learner])).rows[0];
    await db.query(`update public.bookings set status = 'awaiting_payment' where id = $1`, [b.id]);
    const p = (await db.query(`insert into public.payments (booking_id) values ($1) returning amount_kes, status, platform_ref`, [b.id])).rows[0];
    return { b, p };
  }, ({ b, p }) => (b.teacher_id === ID.teacher && b.price_kes === 1500 && b.discount_kes === 750 && b.status === 'requested'
    && p.amount_kes === 750 && p.status === 'initiated' && /^KB\d{6}-/.test(p.platform_ref) ? null : JSON.stringify({ b, p })));
  await expectError('bookings: a payer cannot mark their own booking paid', 'authenticated', U.guardian, async () => {
    const b = (await db.query(`insert into public.bookings (offering_id, learner_id, kind, mode, starts_at)
                               values ($1, $2, 'single', 'online', now() + interval '3 days') returning id`, [ID.offerApproved, ID.learner])).rows[0];
    await db.query(`update public.bookings set status = 'awaiting_payment' where id = $1`, [b.id]);
    await db.query(`update public.bookings set status = 'paid' where id = $1`, [b.id]);
  }, /not allowed for this caller|booking actions/);
  await expectError('bookings: an illegal transition (requested -> confirmed) is rejected', 'postgres', null, async () => {
    const b = (await db.query(`insert into public.bookings (offering_id, learner_id, teacher_id, booked_by_user_id, kind, mode, starts_at, price_kes)
                               values ($1, $2, $3, $4, 'single', 'online', now() + interval '3 days', 1500) returning id`,
                              [ID.offerApproved, ID.learner, ID.teacher, U.guardian])).rows[0];
    await db.query(`update public.bookings set status = 'confirmed' where id = $1`, [b.id]);
  }, /illegal booking transition: requested -> confirmed/);
  await expectError('bookings: a user cannot book for a learner they do not own', 'authenticated', U.other,
    q(`insert into public.bookings (offering_id, learner_id, kind, mode, starts_at) values ($1, $2, 'single', 'online', now() + interval '3 days')`,
      [ID.offerApproved, ID.learner]), /row-level security/);
  await expectError('bookings: a draft offering cannot be booked', 'authenticated', U.guardian,
    q(`insert into public.bookings (offering_id, learner_id, kind, mode, starts_at) values ($1, $2, 'single', 'online', now() + interval '3 days')`,
      [ID.offerDraft, ID.learner]), /not approved/);
  await expectError('reviews: rejected for a booking that is not completed', 'authenticated', U.guardian, async () => {
    const b = (await db.query(`insert into public.bookings (offering_id, learner_id, kind, mode, starts_at)
                               values ($1, $2, 'single', 'online', now() + interval '3 days') returning id`, [ID.offerApproved, ID.learner])).rows[0];
    await db.query(`insert into public.reviews (booking_id, rating, body) values ($1, 5, 'Great')`, [b.id]);
  }, /only accepted for completed bookings/);
  await expectOk('reviews: accepted for a confirmed booking; rating stays hidden below the minimum', 'postgres', null, async () => {
    const b = (await db.query(`insert into public.bookings (offering_id, learner_id, teacher_id, booked_by_user_id, kind, mode, starts_at, price_kes)
                               values ($1, $2, $3, $4, 'single', 'online', now() - interval '3 days', 1500) returning id`,
                              [ID.offerApproved, ID.learner, ID.teacher, U.guardian])).rows[0];
    for (const s of ['awaiting_payment', 'paid', 'accepted', 'scheduled', 'in_progress', 'awaiting_note', 'awaiting_confirmation', 'confirmed']) {
      await db.query(`update public.bookings set status = $2 where id = $1`, [b.id, s]);
    }
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.guardian, role: 'authenticated' })]);
    await db.exec('set local role authenticated');
    await db.query(`insert into public.reviews (booking_id, rating, body) values ($1, 4, 'Clear and patient')`, [b.id]);
    await db.exec('set local role anon');
    const card = (await db.query(`select rating_avg, review_count from public.explore_offers where id = $1`, [ID.offerApproved])).rows[0];
    const rev = (await db.query(`select * from public.public_reviews`)).rows;
    return { card, rev };
  }, ({ card, rev }) => (card?.review_count === 1 && card.rating_avg === null && rev.length === 1
    && rev[0].reviewer_first_name === 'Achieng' && rev[0].rating === 4 ? null : JSON.stringify({ card, rev })));

  // ---- privacy between users
  await expectOk('profiles: a user sees only their own profile', 'authenticated', U.guardian,
    q(`select id from public.profiles`), (r) => (r.rows.length === 1 && r.rows[0].id === U.guardian ? null : `${r.rows.length} rows`));
  await expectOk('teachers: a guardian cannot read teacher rows directly', 'authenticated', U.guardian,
    q(`select count(*)::int n from public.teachers`), (r) => (r.rows[0].n === 0 ? null : `${r.rows[0].n} rows`));
  await expectOk('my_verification_checks: a teacher sees status of own checks only', 'authenticated', U.teacher,
    q(`select status, check_type from public.my_verification_checks order by check_type`),
    (r) => (r.rows.length === 2 ? null : `${r.rows.length} rows`));
  await expectError('verification_checks: a teacher cannot pass their own check', 'authenticated', U.teacher,
    q(`update public.verification_checks set status = 'passed' where check_type = 'good_conduct' returning id`), /permission denied/);

  // ---- webhooks and seats
  await expectError('provider_events: a duplicate provider event id is rejected', 'postgres', null, async () => {
    await db.query(`insert into public.provider_events (provider, event_id, raw_body) values ('paystack', 'evt_1', '{}')`);
    await db.query(`insert into public.provider_events (provider, event_id, raw_body) values ('paystack', 'evt_1', '{}')`);
  }, /provider_events_dedupe/);
  await expectError('runs: seats cannot exceed capacity', 'postgres', null, async () => {
    const o = (await db.query(`insert into public.offerings (teacher_id, title, category, track, format, modes, price_seat_kes, capacity_min, capacity_max, sessions_in_run)
                               values ($1, 'Revision group', 'school_academic', 'school', 'small_group', '{online}', 800, 3, 3, 4) returning id`, [ID.teacher])).rows[0];
    await db.query(`update public.offerings set listing_status = 'pending_review' where id = $1`, [o.id]);
    await db.query(`update public.offerings set listing_status = 'approved' where id = $1`, [o.id]);
    const r = (await db.query(`insert into public.runs (offering_id, starts_at, ends_at) values ($1, now() + interval '7 days', now() + interval '35 days') returning id`, [o.id])).rows[0];
    await db.query(`update public.runs set status = 'open' where id = $1`, [r.id]);
    for (let i = 0; i < 4; i++) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.guardian, role: 'authenticated' })]);
      await db.exec('set local role authenticated');
      await db.query(`insert into public.bookings (offering_id, learner_id, run_id, kind, mode, starts_at) values ($1, $2, $3, 'seat', 'online', now())`, [o.id, ID.learner, r.id]);
      await db.exec('reset role');
    }
  }, /runs_seats_within_capacity/);

  // ---- jobs run cleanly (bodies only; scheduling is pg_cron)
  await expectOk('jobs: reconciliation runs and records a result', 'postgres', null, async () => {
    const id = (await db.query(`select private.job_daily_reconciliation() as id`)).rows[0].id;
    return (await db.query(`select status from public.reconciliation_runs where id = $1`, [id])).rows[0];
  }, (r) => (r?.status ? null : 'no run recorded'));
  await expectOk('jobs: the other job bodies execute', 'postgres', null, async () => {
    await db.query(`select private.job_outbox_relay(), private.job_lapse_unanswered_bookings(), private.job_auto_confirm(),
                           private.job_weekly_payout_batch(), private.job_release_waitlist()`);
  });
}

try {
  await main();
} catch (e) {
  fail('validator crashed', e.stack ?? e.message);
} finally {
  await db.close();
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);


// ---------------------------------------------------------------------------- app flow: sprint 2 listings
// Mirrors the writes in src/app/teach/actions.ts and src/app/staff/(console)/listings/actions.ts,
// step by step, as the real roles. Unlike as(), each step keeps its changes so the next user sees them.
async function act(role, sub, sql, params) {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role').catch(() => {}); // after an error the transaction is aborted; keep the first error
  }
}

async function checkAppListingFlow() {
  const T = '66666666-6666-6666-6666-666666666666';
  const R = '77777777-7777-7777-7777-777777777777';
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`app flow: ${name}`);
      return r;
    } catch (e) {
      fail(`app flow: ${name}`, e.message);
      throw e;
    }
  };
  try {
    await act('postgres', null, `insert into auth.users (id, email, raw_user_meta_data) values
      ($1, 'teacher@koobi.test', '{"display_name": "Test Teacher"}'), ($2, 'reviewer@koobi.test', '{"display_name": "Test Reviewer"}')`, [T, R]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'reviewer')`, [R]);

    await step('a new user claims the teacher role', () => act('authenticated', T, `select public.claim_role('teacher')`));
    const [teacher] = await step('the application inserts a teacher row', () =>
      act('authenticated', T, `insert into public.teachers (display_name, headline, bio, teacher_type, employment_status,
          employment_declaration_version, employment_declared_at, county_code, languages)
        values ('Test Teacher', 'Ran communications at a Nairobi bank for nine years.', $1, 'professional', 'self_employed',
          '2026-11-v1', now(), 'nairobi', '{en,sw}') returning id, slug, listing_status`, ['x'.repeat(90)]));
    await step('the application adds the category track', () =>
      act('authenticated', T, `insert into public.teacher_tracks (teacher_id, track) values ($1, 'adults_professional')`, [teacher.id]));
    const [offer] = await step('the editor inserts a one-to-one offer', () =>
      act('authenticated', T, `insert into public.offerings (teacher_id, title, summary, description, outcomes, category, track, format,
          subject_text, curriculum_code, goal, modes, meeting_tool, duration_minutes, price_hour_kes, trial_discount_pct, language_codes)
        values ($1, 'Business English for professionals', 'Emails, meetings, presentations.', 'Built around your own work.',
          '{"Emails that get read","Leading meetings"}', 'career_professional_growth', 'adults_professional', 'one_to_one',
          'Business English', null, null, '{online}', 'google_meet', 50, 1800, 50, '{en}') returning id, slug, listing_status`, [teacher.id]));
    await step('availability: a weekly window is added', () =>
      act('authenticated', T, `insert into public.availability_windows (offering_id, kind, weekday, starts, ends)
        values ($1, 'weekly', 1, '17:00', '20:00'), ($1, 'weekly', 4, '17:00', '20:00')`, [offer.id]));
    await step('the teacher sends profile and offer for review', async () => {
      await act('authenticated', T, `update public.teachers set listing_status = 'pending_review' where id = $1`, [teacher.id]);
      await act('authenticated', T, `update public.offerings set listing_status = 'pending_review' where id = $1`, [offer.id]);
    });
    await expectError('app flow: the teacher cannot approve their own offer', 'authenticated', T,
      q(`update public.offerings set listing_status = 'approved' where id = '${offer.id}'`));
    const hidden = await act('anon', null, `select 1 from public.explore_offers where id = $1`, [offer.id]);
    hidden.length === 0 ? pass('app flow: a pending offer is not on Explore') : fail('app flow: a pending offer is not on Explore', 'visible');

    await step('a reviewer approves the profile and the offer', async () => {
      const a = await act('authenticated', R, `update public.teachers set listing_status = 'approved' where id = $1 and listing_status = 'pending_review' returning id`, [teacher.id]);
      const b = await act('authenticated', R, `update public.offerings set listing_status = 'approved' where id = $1 and listing_status = 'pending_review' returning id`, [offer.id]);
      if (a.length !== 1 || b.length !== 1) throw new Error('approve updated no row');
    });
    const [card] = await act('anon', null, `select * from public.explore_offers where id = $1`, [offer.id]);
    !card ? fail('app flow: the approved offer is on Explore', 'missing')
      : card.price_kes === 1500 && card.price_basis === 'session' && card.rating_avg === null && card.teacher_name === 'Test Teacher'
        ? pass('app flow: Explore shows it at KES 1,500 per 50-minute session, no rating yet')
        : fail('app flow: Explore card fields', JSON.stringify({ p: card.price_kes, b: card.price_basis, r: card.rating_avg, n: card.teacher_name }));
    const [details] = await act('anon', null, `select next_slots, trial_price_kes, meeting_tool from public.offer_details where id = $1`, [offer.id]);
    details && details.next_slots.length > 0 && details.trial_price_kes === 750
      ? pass('app flow: offer details list upcoming slots and a KES 750 trial')
      : fail('app flow: offer details', JSON.stringify(details));
    const prof = await act('anon', null, `select slug from public.public_teachers where slug = $1`, [teacher.slug]);
    prof.length === 1 ? pass('app flow: the profile is public') : fail('app flow: the profile is public', 'missing');

    const [second] = await act('authenticated', T, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, language_codes)
      values ($1, 'Interview practice', 'Mock interviews with feedback.', 'career_professional_growth', 'adults_professional', 'one_to_one',
        'Interviews', '{online}', 'zoom', 60, 2000, '{en}') returning id`, [teacher.id]);
    await act('authenticated', T, `update public.offerings set listing_status = 'pending_review' where id = $1`, [second.id]);
    await expectError('app flow: rejecting needs a reason', 'authenticated', R,
      q(`update public.offerings set listing_status = 'rejected' where id = '${second.id}'`), /rejection_reason/);
    await step('a reviewer sends an offer back with a reason', () =>
      act('authenticated', R, `update public.offerings set listing_status = 'rejected', rejection_reason = 'Add what learners will work on.' where id = $1`, [second.id]));
    await step('the teacher edits and resubmits (rejected, draft, in review)', async () => {
      await act('authenticated', T, `update public.offerings set listing_status = 'draft', rejection_reason = null, outcomes = '{"Answering behavioural questions"}' where id = $1`, [second.id]);
      await act('authenticated', T, `update public.offerings set listing_status = 'pending_review' where id = $1`, [second.id]);
    });
    await step('editing a live offer sends it back to review', async () => {
      await act('authenticated', T, `update public.offerings set price_hour_kes = 2000 where id = $1`, [offer.id]);
      await act('authenticated', T, `update public.offerings set listing_status = 'draft', rejection_reason = null where id = $1`, [offer.id]);
      await act('authenticated', T, `update public.offerings set listing_status = 'pending_review' where id = $1`, [offer.id]);
    });
    const gone = await act('anon', null, `select 1 from public.explore_offers where id = $1`, [offer.id]);
    gone.length === 0 ? pass('app flow: an edited live offer leaves Explore until re-approved') : fail('app flow: edited offer still visible', 'visible');
    const other = await act('authenticated', U.other, `select id from public.offerings where teacher_id = $1`, [teacher.id]).catch(() => []);
    other.length === 0 ? pass("app flow: another user cannot read this teacher's offers") : fail('app flow: offers leak to another user', `${other.length} rows`);
  } catch {
    // a failed step already reported; the remaining steps depend on it
  }
}


// ---------------------------------------------------------------------------- app flow: sprint 3 matching and messaging
async function checkAppMatchingFlow() {
  const L = '81111111-1111-1111-1111-111111111111'; // learner (requester)
  const T = '82222222-2222-2222-2222-222222222222'; // teacher
  const C = '83333333-3333-3333-3333-333333333333'; // concierge
  const X = '84444444-4444-4444-4444-444444444444'; // someone else
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`matching: ${name}`);
      return r;
    } catch (e) {
      fail(`matching: ${name}`, e.message);
      throw e;
    }
  };
  try {
    await act('postgres', null, `insert into auth.users (id, email, raw_user_meta_data) values
      ($1, 'l@koobi.test', '{"display_name": "Amina Learner"}'), ($2, 't@koobi.test', '{"display_name": "Tom Teacher"}'),
      ($3, 'c@koobi.test', '{"display_name": "Cate Concierge"}'), ($4, 'x@koobi.test', '{}')`, [L, T, C, X]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'learner'), ($2, 'teacher'), ($3, 'concierge')`, [L, T, C]);
    const [teacher] = await act('postgres', null, `insert into public.teachers (user_id, display_name, headline, listing_status)
      values ($1, 'Tom Teacher', 'Engineer, ten years on site.', 'draft') returning id`, [T]);
    await act('postgres', null, `insert into public.teacher_tracks (teacher_id, track) values ($1, 'adults_professional')`, [teacher.id]);
    const [offer] = await act('postgres', null, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, language_codes)
      values ($1, 'English for engineers', 'Site meetings and reports.', 'career_professional_growth', 'adults_professional', 'one_to_one',
        'English', '{online}', 'zoom', 60, 1800, '{en}') returning id`, [teacher.id]);
    await act('postgres', null, `update public.teachers set listing_status = 'pending_review' where id = $1`, [teacher.id]);
    await act('postgres', null, `update public.teachers set listing_status = 'approved' where id = $1`, [teacher.id]);
    await act('postgres', null, `update public.offerings set listing_status = 'pending_review' where id = $1`, [offer.id]);
    await act('postgres', null, `update public.offerings set listing_status = 'approved' where id = $1`, [offer.id]);

    const [req] = await step('a learner posts a request', () =>
      act('authenticated', L, `insert into public.requests (category, track, subject, goal, mode, budget_max_kes, schedule_notes)
        values ('career_professional_growth', 'adults_professional', 'Site English', 'Run site meetings in English', 'online', 2000, 'Evenings')
        returning id, status`));
    const inbox = await step("the teacher sees it in their inbox, without the requester's identity", async () => {
      const rows = await act('authenticated', T, `select * from public.open_requests_for_teacher()`);
      if (rows.length !== 1 || rows[0].id !== req.id || 'requester_id' in rows[0]) throw new Error(JSON.stringify(rows));
      return rows[0];
    });
    await step('the teacher applies with a short pitch', () =>
      act('authenticated', T, `insert into public.teacher_applications (request_id, teacher_id, offering_id, pitch, proposed_price_kes)
        values ($1, $2, $3, 'I run site meetings every week.', 1800)`, [req.id, teacher.id, inbox.offering_ids[0]]));
    const noRows = await act('authenticated', X, `select * from public.open_requests_for_teacher()`);
    noRows.length === 0 ? pass('matching: a non-teacher sees no open requests') : fail('matching: inbox leak', `${noRows.length} rows`);
    await expectError('matching: a learner cannot send a shortlist', 'authenticated', L,
      q(`select public.send_shortlist('${req.id}', 10, null, '[{"offering_id": "${offer.id}", "rank": 1, "reason": "x"}]')`), /concierge/);
    await expectError('matching: the concierge must log minutes', 'authenticated', C,
      q(`select public.send_shortlist('${req.id}', 0, null, '[{"offering_id": "${offer.id}", "rank": 1, "reason": "x"}]')`), /minutes/);
    await step('the concierge sends a shortlist with logged minutes', () =>
      act('authenticated', C, `select public.send_shortlist($1, 12, 'Called the learner', $2::jsonb)`,
        [req.id, JSON.stringify([{ offering_id: offer.id, rank: 1, reason: 'Runs site meetings weekly.', source: 'teacher_applied', snapshot: { tier: 0 } }])]));
    const [state] = await act('postgres', null, `select r.status, (select count(*)::int from public.staff_time_log where subject_id = r.id) minutes,
        (select status from public.teacher_applications where request_id = r.id) app from public.requests r where r.id = $1`, [req.id]);
    state.status === 'shortlisted' && state.minutes === 1 && state.app === 'shortlisted'
      ? pass('matching: request shortlisted, minutes logged, application marked')
      : fail('matching: shortlist state', JSON.stringify(state));
    const mine = await act('authenticated', L, `select id, status, concierge_reason from public.matches where request_id = $1`, [req.id]);
    mine.length === 1 && mine[0].status === 'sent' ? pass('matching: the learner sees the sent match') : fail('matching: learner match view', JSON.stringify(mine));
    const others = await act('authenticated', X, `select id from public.matches where request_id = $1`, [req.id]);
    others.length === 0 ? pass("matching: others cannot see the shortlist") : fail('matching: shortlist leak', `${others.length}`);
    await expectError('matching: someone else cannot accept it', 'authenticated', X, q(`select public.accept_match('${mine[0].id}')`), /not your request/);
    const [{ accept_match: thread }] = await step('the learner accepts and a thread opens', () =>
      act('authenticated', L, `select public.accept_match($1)`, [mine[0].id]));
    const [after] = await act('postgres', null, `select r.status, m.status ms, m.accepted_at is not null acc,
        (select count(*)::int from public.thread_participants where thread_id = $2) parts
        from public.requests r join public.matches m on m.request_id = r.id where r.id = $1`, [req.id, thread]);
    after.status === 'matched' && after.ms === 'accepted' && after.acc && after.parts === 2
      ? pass('matching: request matched, match accepted, two participants') : fail('matching: after accept', JSON.stringify(after));

    await step('the teacher writes, with a phone number and an email in the text', () =>
      act('authenticated', T, `insert into public.messages (thread_id, body) values ($1, 'Hello! Call me on 0712 345 678 or +254 733 000 111, or tom@example.com. Monday 17:00 costs KES 1,800, 2026-11-09.')`, [thread]));
    const [msg] = await act('authenticated', L, `select body, redacted from public.messages where thread_id = $1`, [thread]);
    msg && msg.redacted && !/0712|733|tom@/.test(msg.body) && /KES 1,800/.test(msg.body) && /2026-11-09/.test(msg.body) && /17:00/.test(msg.body)
      ? pass('matching: contacts are hidden, prices, dates and times are kept') : fail('matching: redaction', JSON.stringify(msg));
    const peek = await act('authenticated', X, `select id from public.messages where thread_id = $1`, [thread]);
    peek.length === 0 ? pass('matching: an outsider cannot read the thread') : fail('matching: thread leak', `${peek.length}`);
    await expectError('matching: an outsider cannot post to the thread', 'authenticated', X,
      q(`insert into public.messages (thread_id, body) values ('${thread}', 'hi')`));
    const [tt] = await act('authenticated', T, `select * from public.my_threads()`);
    tt && tt.other_name === 'Amina' && tt.title === 'English for engineers' && tt.unread === 0
      ? pass("matching: the teacher's thread list shows the learner's first name only") : fail('matching: teacher thread list', JSON.stringify(tt));
    const [lt] = await act('authenticated', L, `select * from public.my_threads()`);
    lt && lt.other_name === 'Tom Teacher' && lt.unread === 1
      ? pass("matching: the learner's thread list shows one unread message") : fail('matching: learner thread list', JSON.stringify(lt));

    const [req2] = await act('authenticated', L, `insert into public.requests (category, track, subject, goal, mode)
      values ('career_professional_growth', 'adults_professional', 'Interviews', 'Practise interviews', 'online') returning id`);
    await act('authenticated', C, `select public.send_shortlist($1, 5, null, $2::jsonb)`, [req2.id, JSON.stringify([{ offering_id: offer.id, rank: 1, reason: 'Fits.' }])]);
    await expectError('matching: declining needs a reason', 'authenticated', L, q(`select public.decline_shortlist('${req2.id}', '')`), /why/);
    await step('the learner asks for more options', () => act('authenticated', L, `select public.decline_shortlist($1, 'I need weekend times.')`, [req2.id]));
    const [back] = await act('postgres', null, `select status from public.requests where id = $1`, [req2.id]);
    back.status === 'triaged' ? pass('matching: the request goes back to the concierge') : fail('matching: decline state', back.status);
    await expectError('matching: a declined teacher cannot be re-sent on the same request', 'authenticated', C,
      q(`select public.send_shortlist('${req2.id}', 5, null, '[{"offering_id": "${offer.id}", "rank": 1, "reason": "again"}]')`), /already answered/);
  } catch {
    // reported above
  }
}


// ---------------------------------------------------------------------------- app flow: sprint 4 booking, payment hold, ledger
async function checkAppBookingFlow() {
  const L = '91111111-1111-1111-1111-111111111111';
  const T = '92222222-2222-2222-2222-222222222222';
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`booking: ${name}`);
      return r;
    } catch (e) {
      fail(`booking: ${name}`, e.message);
      throw e;
    }
  };
  const balance = async (account, user) =>
    (await act('postgres', null, `select coalesce(sum(case when side = 'credit' then amount_kes else -amount_kes end), 0)::int v
       from public.ledger_entries where account = $1 and ($2::uuid is null or counterparty_user_id = $2)`, [account, user]))[0].v;
  try {
    await act('postgres', null, `insert into auth.users (id, email, phone, raw_user_meta_data) values
      ($1, 'bl@koobi.test', '254711000001', '{"display_name": "Bora Learner"}'), ($2, 'bt@koobi.test', '254722000002', '{"display_name": "Tess Teacher"}')`, [L, T]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'learner'), ($2, 'teacher')`, [L, T]);
    const [teacher] = await act('postgres', null, `insert into public.teachers (user_id, display_name) values ($1, 'Tess Teacher') returning id`, [T]);
    const [offer] = await act('postgres', null, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, trial_discount_pct, language_codes)
      values ($1, 'Business English', 'x', 'career_professional_growth', 'adults_professional', 'one_to_one', 'English',
        '{online}', 'google_meet', 60, 1800, 50, '{en}') returning id`, [teacher.id]);
    for (const [tbl, id] of [['teachers', teacher.id], ['offerings', offer.id]]) {
      await act('postgres', null, `update public.${tbl} set listing_status = 'pending_review' where id = $1`, [id]);
      await act('postgres', null, `update public.${tbl} set listing_status = 'approved' where id = $1`, [id]);
    }
    const [thread] = await act('postgres', null, `insert into public.message_threads (kind) values ('pair') returning id`);
    await act('postgres', null, `insert into public.thread_participants (thread_id, user_id, role) values ($1, $2, 'payer'), ($1, $3, 'teacher')`, [thread.id, L, T]);

    const [learner] = await step('a learner profile for the payer', () =>
      act('authenticated', L, `insert into public.learners (user_id, alias) values ($1, 'Bora') returning id`, [L]));
    const book = (kind, at) => act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, $3, 'online', now() + interval '${at}', 'cancellation-2026-11-v1', now()) returning id, price_kes, discount_kes, teacher_id`, [offer.id, learner.id, kind]);
    const [trial] = await step('a trial booking is priced by the server', () => book('trial', '3 days'));
    trial.price_kes === 1800 && trial.discount_kes === 900 && trial.teacher_id === teacher.id
      ? pass('booking: trial is KES 1,800 with a KES 900 discount, teacher set from the offer') : fail('booking: trial price', JSON.stringify(trial));

    const pay = async (bookingId) => {
      await act('authenticated', L, `update public.bookings set status = 'awaiting_payment' where id = $1`, [bookingId]);
      const [p] = await act('authenticated', L, `insert into public.payments (booking_id, method) values ($1, 'mpesa_stk') returning id, amount_kes, platform_ref`, [bookingId]);
      return p;
    };
    const p1 = await step('checkout creates a payment for the server amount', () => pay(trial.id));
    p1.amount_kes === 900 ? pass('booking: the payment is KES 900 (trial price), not a client value') : fail('booking: payment amount', String(p1.amount_kes));
    await expectError('booking: a learner cannot record their own payment', 'authenticated', L,
      q(`select public.record_payment_success('${p1.id}', 'x', 0, null)`), /permission denied/);
    await expectError('booking: a learner cannot mark a booking paid', 'authenticated', L,
      q(`update public.bookings set status = 'paid' where id = '${trial.id}'`), /not allowed|booking actions/);
    await step('the provider accepts the STK push', () => act('service_role', null, `select public.mark_payment_pending($1, 'ps_ref_1')`, [p1.id]));
    const [{ record_payment_success: first }] = await step('a verified webhook records the payment', () =>
      act('service_role', null, `select public.record_payment_success($1, 'ps_ref_1', 14, 886)`, [p1.id]));
    const [{ record_payment_success: again }] = await act('service_role', null, `select public.record_payment_success($1, 'ps_ref_1', 14, 886)`, [p1.id]);
    first === true && again === false ? pass('booking: a repeated webhook changes nothing') : fail('booking: idempotency', `${first} ${again}`);
    const [after] = await act('postgres', null, `select p.status, p.hold_status, b.status bs, b.paid_at is not null paid,
        (select count(*)::int from public.ledger_transactions where idempotency_key = 'hold:' || p.id::text) j
        from public.payments p join public.bookings b on b.id = p.booking_id where p.id = $1`, [p1.id]);
    after.status === 'succeeded' && after.hold_status === 'held' && after.bs === 'paid' && after.paid && after.j === 1
      ? pass('booking: payment succeeded and held, booking paid, one hold journal') : fail('booking: after payment', JSON.stringify(after));
    const legs = Object.fromEntries((await act('postgres', null, `select account::text a, sum(case when side = 'credit' then amount_kes else -amount_kes end)::int v
       from public.ledger_entries where payment_id = $1 group by account`, [p1.id])).map((r) => [r.a, r.v]));
    const held = legs.client_funds_held, cash = legs.cash_provider, fees = legs.expense_payment_fees;
    held === 900 && cash === -886 && fees === -14 ? pass('booking: ledger holds KES 900 for the payer; cash 886 plus fee 14')
      : fail('booking: hold ledger', JSON.stringify({ held, cash, fees }));
    const [rev] = await act('postgres', null, `select contact_revealed_at is not null r from public.message_threads where id = $1`, [thread.id]);
    const [contact] = await act('authenticated', L, `select public.thread_contact($1) c`, [thread.id]);
    rev.r && contact.c === '+254722000002' ? pass("booking: the first paid booking reveals the pair's numbers") : fail('booking: reveal', JSON.stringify({ rev, contact }));

    await expectError('booking: an online lesson needs a Meet or Zoom link', 'authenticated', T,
      q(`select public.teacher_respond_booking('${trial.id}', true, 'https://example.com/x', null)`), /Google Meet or Zoom/);
    await expectError('booking: only the booking teacher can respond', 'authenticated', L,
      q(`select public.teacher_respond_booking('${trial.id}', true, 'https://meet.google.com/abc-defg-hij', null)`), /not your booking/);
    await step('the teacher accepts with a Meet link', () =>
      act('authenticated', T, `select public.teacher_respond_booking($1, true, 'https://meet.google.com/abc-defg-hij', null)`, [trial.id]));
    const [sched] = await act('postgres', null, `select b.status, b.accepted_at is not null acc, (select count(*)::int from public.sessions where booking_id = b.id) s
      from public.bookings b where b.id = $1`, [trial.id]);
    sched.status === 'scheduled' && sched.acc && sched.s === 1 ? pass('booking: scheduled with one session') : fail('booking: scheduled', JSON.stringify(sched));

    const [single] = await book('single', '4 days');
    const p2 = await pay(single.id);
    await act('service_role', null, `select public.record_payment_success($1, 'ps_ref_2', 27, null)`, [p2.id]);
    await expectError('booking: declining needs a reason', 'authenticated', T, q(`select public.teacher_respond_booking('${single.id}', false, null, '')`), /why/);
    await step('the teacher declines with a reason', () =>
      act('authenticated', T, `select public.teacher_respond_booking($1, false, null, 'Away that week')`, [single.id]));
    const [dec] = await act('postgres', null, `select b.status, b.cancelled_by_role, p.hold_status from public.bookings b join public.payments p on p.booking_id = b.id where b.id = $1`, [single.id]);
    const credits = await balance('guardian_credits', L);
    dec.status === 'cancelled' && dec.cancelled_by_role === 'teacher' && dec.hold_status === 'credited' && credits === 1800
      ? pass('booking: declined, the KES 1,800 hold becomes the payer’s credit') : fail('booking: decline', JSON.stringify({ dec, credits }));

    const [late] = await book('single', '5 days');
    const p3 = await pay(late.id);
    await act('service_role', null, `select public.record_payment_success($1, 'ps_ref_3', 27, null)`, [p3.id]);
    await act('postgres', null, `update public.bookings set paid_at = now() - interval '13 hours' where id = $1`, [late.id]);
    await step('unanswered bookings lapse after the response window', () => act('postgres', null, `select private.job_lapse_unanswered_bookings()`));
    const [lap] = await act('postgres', null, `select b.status, p.hold_status from public.bookings b join public.payments p on p.booking_id = b.id where b.id = $1`, [late.id]);
    lap.status === 'lapsed' && lap.hold_status === 'credited' ? pass('booking: lapsed and credited') : fail('booking: lapse', JSON.stringify(lap));

    const [retry] = await book('single', '6 days');
    const p4 = await pay(retry.id);
    await act('service_role', null, `select public.mark_payment_pending($1, 'ps_ref_4')`, [p4.id]);
    await act('service_role', null, `select public.record_payment_failure($1, 'Cancelled on the phone')`, [p4.id]);
    const [fl] = await act('postgres', null, `select p.status, b.status bs from public.payments p join public.bookings b on b.id = p.booking_id where p.id = $1`, [p4.id]);
    const p5 = await act('authenticated', L, `insert into public.payments (booking_id, method) values ($1, 'mpesa_stk') returning id`, [retry.id]).catch((e) => e);
    fl.status === 'failed' && fl.bs === 'awaiting_payment' && Array.isArray(p5)
      ? pass('booking: a failed payment charges nothing and the payer can try again') : fail('booking: failure and retry', JSON.stringify({ fl, p5: String(p5) }));

    const mine = await act('authenticated', L, `select id, status, meeting_link, teacher_name from public.my_bookings()`);
    const teach = await act('authenticated', T, `select id, status, learner_alias, payer_first_name from public.my_teaching_bookings()`);
    const sch = mine.find((b) => b.id === trial.id);
    mine.length === 4 && sch?.meeting_link === 'https://meet.google.com/abc-defg-hij' && sch?.teacher_name === 'Tess Teacher'
      ? pass('booking: the payer lists all four bookings, with the link once scheduled') : fail('booking: my_bookings', JSON.stringify(mine));
    teach.length === 3 && !teach.some((b) => b.id === retry.id) && teach[0].learner_alias === 'Bora' && teach[0].payer_first_name === 'Bora'
      ? pass('booking: the teacher lists paid bookings only, with alias and first name') : fail('booking: my_teaching_bookings', JSON.stringify(teach));
    const [tot] = await act('postgres', null, `select coalesce(sum(case when side = 'debit' then amount_kes else -amount_kes end), 0)::int d from public.ledger_entries`);
    tot.d === 0 ? pass('booking: the whole ledger balances') : fail('booking: ledger balance', String(tot.d));
  } catch {
    // reported above
  }
}


// ---------------------------------------------------------------------------- app flow: sprint 5 lessons and release
// Mirrors src/app/teach/sessions, src/app/(app)/bookings and src/app/staff/(console)/disputes|refunds.
// PGlite keeps now() fixed inside the transaction, so lesson times are moved instead of the clock.
async function checkAppSessionFlow() {
  const L = 'a1111111-1111-1111-1111-111111111111';
  const T = 'a2222222-2222-2222-2222-222222222222';
  const C = 'a3333333-3333-3333-3333-333333333333';
  const F = 'a4444444-4444-4444-4444-444444444444';
  const MEET = 'https://meet.google.com/abc-defg-hij';
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`lessons: ${name}`);
      return r;
    } catch (e) {
      fail(`lessons: ${name}`, e.message);
      throw e;
    }
  };
  const ok = (name, cond, detail) => (cond ? pass(`lessons: ${name}`) : fail(`lessons: ${name}`, JSON.stringify(detail)));
  const legs = async (bookingId, kind) => Object.fromEntries((await act('postgres', null, `select e.account::text a,
      sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end)::int v
      from public.ledger_entries e join public.ledger_transactions t on t.id = e.txn_id
      where e.booking_id = $1 and ($2::text is null or t.kind::text = $2) group by e.account`, [bookingId, kind ?? null])).map((r) => [r.a, r.v]));
  const credits = async () => (await act('authenticated', L, `select public.my_credit_balance() v`))[0].v;
  const state = async (bookingId) => (await act('postgres', null, `select b.status, b.cancelled_by_role, s.status ss, s.confirmed_by,
      (select hold_status from public.payments p where p.booking_id = b.id and p.status <> 'failed' order by created_at desc limit 1) hold
      from public.bookings b left join public.sessions s on s.booking_id = b.id where b.id = $1`, [bookingId]))[0];
  try {
    await act('postgres', null, `insert into auth.users (id, email, phone, raw_user_meta_data) values
      ($1, 'sl@koobi.test', '254711000011', '{"display_name": "Sana Learner"}'), ($2, 'st@koobi.test', '254722000012', '{"display_name": "Tito Teacher"}'),
      ($3, 'sc@koobi.test', null, '{"display_name": "Cora Concierge"}'), ($4, 'sf@koobi.test', null, '{"display_name": "Fay Finance"}')`, [L, T, C, F]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'learner'), ($2, 'teacher'), ($3, 'concierge'), ($4, 'finance')`, [L, T, C, F]);
    const [teacher] = await act('postgres', null, `insert into public.teachers (user_id, display_name) values ($1, 'Tito Teacher') returning id`, [T]);
    const [offer] = await act('postgres', null, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, trial_discount_pct, language_codes)
      values ($1, 'Spoken French', 'x', 'career_professional_growth', 'adults_professional', 'one_to_one', 'French',
        '{online}', 'google_meet', 60, 1800, 50, '{en}') returning id`, [teacher.id]);
    for (const [tbl, id] of [['teachers', teacher.id], ['offerings', offer.id]]) {
      await act('postgres', null, `update public.${tbl} set listing_status = 'pending_review' where id = $1`, [id]);
      await act('postgres', null, `update public.${tbl} set listing_status = 'approved' where id = $1`, [id]);
    }
    const [learner] = await act('authenticated', L, `insert into public.learners (user_id, alias) values ($1, 'Sana') returning id`, [L]);

    let n = 0;
    // Booked, paid and (unless told otherwise) accepted with a Meet link.
    const booked = async (kind = 'single', accept = true) => {
      n++;
      const [b] = await act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
        values ($1, $2, $3, 'online', now() + interval '${3 + n} days', 'cancellation-2026-11-v1', now()) returning id`, [offer.id, learner.id, kind]);
      await act('authenticated', L, `update public.bookings set status = 'awaiting_payment' where id = $1`, [b.id]);
      const [p] = await act('authenticated', L, `insert into public.payments (booking_id, method) values ($1, 'mpesa_stk') returning id, amount_kes`, [b.id]);
      await act('service_role', null, `select public.record_payment_success($1, $2, 0, null)`, [p.id, `ps_s5_${n}`]);
      if (accept) await act('authenticated', T, `select public.teacher_respond_booking($1, true, $2, null)`, [b.id, MEET]);
      const [s] = await act('postgres', null, `select id from public.sessions where booking_id = $1`, [b.id]);
      return { id: b.id, payment: p.id, amount: p.amount_kes, session: s?.id };
    };
    // Moves the lesson so it starts `mins` minutes from now (negative: already started).
    const startsIn = async (b, mins) => {
      await act('postgres', null, `update public.bookings set starts_at = now() + make_interval(mins => $2) where id = $1`, [b.id, mins]);
      await act('postgres', null, `update public.sessions set starts_at = now() + make_interval(mins => $2), ends_at = now() + make_interval(mins => $2 + 60) where booking_id = $1`, [b.id, mins]);
    };
    const teach = async (b) => {
      await act('authenticated', T, `select public.teacher_check_in($1)`, [b.session]);
      await act('authenticated', T, `select public.teacher_check_out($1)`, [b.session]);
      await act('authenticated', T, `select public.file_lesson_note($1, 'Greetings and numbers to 100', 'Good accent', 'Days of the week')`, [b.session]);
    };

    // ---- A: the full lesson day, confirmed by the payer
    const a = await step('a paid, accepted lesson has one scheduled session', () => booked());
    await expectError('lessons: check-in is refused days before the lesson', 'authenticated', T, q(`select public.teacher_check_in('${a.session}')`), /opens 10 minutes/);
    await expectError('lessons: the learner cannot check the teacher in', 'authenticated', L, q(`select public.teacher_check_in('${a.session}')`), /not your lesson/);
    await expectError('lessons: the teacher cannot set a lesson state directly', 'authenticated', T,
      q(`update public.sessions set status = 'in_progress' where id = '${a.session}'`), /permission denied/);
    await startsIn(a, 5);
    await step('the teacher checks in 5 minutes before the start', () => act('authenticated', T, `select public.teacher_check_in($1)`, [a.session]));
    await expectError('lessons: an absence cannot be reported inside the grace period', 'authenticated', T, q(`select public.report_learner_absent('${a.session}')`), /wait 15 minutes/);
    await expectError('lessons: the note comes after check-out', 'authenticated', T,
      q(`select public.file_lesson_note('${a.session}', 'Greetings and numbers', null, null)`), /after check-out/);
    await step('the teacher checks out', () => act('authenticated', T, `select public.teacher_check_out($1)`, [a.session]));
    await expectError('lessons: a one-word note is refused', 'authenticated', T, q(`select public.file_lesson_note('${a.session}', 'French', null, null)`), /at least 10/);
    await step('the teacher files the lesson note', () =>
      act('authenticated', T, `select public.file_lesson_note($1, 'Greetings and numbers to 100', 'Good accent', 'Days of the week')`, [a.session]));
    const notes = await act('authenticated', L, `select covered from public.lesson_notes where session_id = $1`, [a.session]);
    ok('the payer reads the note', notes.length === 1 && notes[0].covered.startsWith('Greetings'), notes);
    ok('waiting for the payer to confirm', (await state(a.id)).status === 'awaiting_confirmation', await state(a.id));
    await expectError('lessons: the teacher cannot confirm their own lesson', 'authenticated', T, q(`select public.confirm_lesson('${a.id}')`), /not your booking/);
    await expectError('lessons: no review before the lesson is confirmed', 'authenticated', L,
      q(`insert into public.reviews (booking_id, rating, body) values ('${a.id}', 5, 'Great')`), /completed bookings/);
    await step('the payer confirms the lesson', () => act('authenticated', L, `select public.confirm_lesson($1)`, [a.id]));
    const sa = await state(a.id);
    ok('confirmed by the payer, hold released', sa.status === 'confirmed' && sa.ss === 'confirmed' && sa.confirmed_by === 'payer' && sa.hold === 'released', sa);
    const la = await legs(a.id, 'session_release');
    ok('KES 1,800 at 20%: fee 360, withholding 72, teacher 1,368',
      la.client_funds_held === -1800 && la.revenue_commission === 360 && la.withholding_payable === 72 && la.teacher_payable === 1368, la);
    await expectError('lessons: a second confirm changes nothing', 'authenticated', L, q(`select public.confirm_lesson('${a.id}')`), /nothing to confirm/);
    await step('the payer reviews the confirmed lesson', () =>
      act('authenticated', L, `insert into public.reviews (booking_id, rating, body) values ($1, 5, 'Clear and patient')`, [a.id]));
    await expectError('lessons: one review per lesson', 'authenticated', L,
      q(`insert into public.reviews (booking_id, rating, body) values ('${a.id}', 4, 'Again')`), /duplicate key|unique/);
    await step('the teacher replies once', () => act('authenticated', T, `update public.reviews set teacher_reply = 'Thank you, Sana' where booking_id = $1`, [a.id]));
    await expectError('lessons: the teacher cannot reply twice', 'authenticated', T,
      q(`update public.reviews set teacher_reply = 'Edited' where booking_id = '${a.id}'`), /once/);
    await expectError('lessons: the teacher cannot hide a review', 'authenticated', T,
      q(`update public.reviews set status = 'removed' where booking_id = '${a.id}'`), /staff-only|permission denied/);

    // ---- B: a trial, auto-confirmed after 48 hours
    const tr = await booked('trial');
    await startsIn(tr, -5);
    await step('a trial lesson is taught and noted', () => teach(tr));
    await act('postgres', null, `update public.lesson_notes set filed_at = now() - interval '49 hours' where session_id = $1`, [tr.session]);
    const [{ job_auto_confirm: auto }] = await step('auto-confirm runs', () => act('postgres', null, `select private.job_auto_confirm()`));
    const st = await state(tr.id);
    ok('the silent trial is confirmed automatically', auto === 1 && st.status === 'confirmed' && st.confirmed_by === 'auto', { auto, st });
    const lt = await legs(tr.id, 'trial_release');
    ok('trial: payer paid 900, teacher earns the full 1,800 less 90 withholding, Koobi funds 900',
      tr.amount === 900 && lt.client_funds_held === -900 && lt.expense_trial_subsidy === -900 && lt.teacher_payable === 1710 && lt.withholding_payable === 90, { amount: tr.amount, lt });

    // ---- C: cancellations
    const c1 = await booked();
    const [{ cancel_booking: r1 }] = await step('the payer cancels days ahead', () => act('authenticated', L, `select public.cancel_booking($1, 'Travelling')`, [c1.id]));
    const s1 = await state(c1.id);
    ok('24 hours or more ahead: full credit', r1 === 'credited' && s1.status === 'cancelled' && s1.cancelled_by_role === 'payer' && s1.hold === 'credited' && s1.ss === 'cancelled', { r1, s1 });
    const c2 = await booked();
    await startsIn(c2, 300);
    const [{ cancel_booking: r2 }] = await step('the payer cancels 5 hours ahead', () => act('authenticated', L, `select public.cancel_booking($1, null)`, [c2.id]));
    const s2 = await state(c2.id);
    const l2 = await legs(c2.id, 'session_release');
    ok('inside 24 hours: released to the teacher', r2 === 'released' && s2.status === 'cancelled' && s2.hold === 'released' && l2.teacher_payable === 1368, { r2, s2, l2 });
    const c3 = await booked('single', false);
    await startsIn(c3, 300);
    const [{ cancel_booking: r3 }] = await act('authenticated', L, `select public.cancel_booking($1, null)`, [c3.id]);
    ok('not yet accepted: full credit even inside 24 hours', r3 === 'credited' && (await state(c3.id)).hold === 'credited', r3);
    const c4 = await booked();
    await expectError('lessons: a teacher cancellation needs a reason', 'authenticated', T, q(`select public.teacher_cancel_booking('${c4.id}', '')`), /why/);
    await expectError('lessons: the payer cannot use the teacher cancel', 'authenticated', L, q(`select public.teacher_cancel_booking('${c4.id}', 'Not me at all')`), /not your booking/);
    await step('the teacher cancels with a reason', () => act('authenticated', T, `select public.teacher_cancel_booking($1, 'Family emergency')`, [c4.id]));
    const s4 = await state(c4.id);
    ok('teacher cancellation: full credit, counted against the teacher', s4.status === 'cancelled' && s4.cancelled_by_role === 'teacher' && s4.hold === 'credited', s4);

    // ---- D: learner absent; an exception request holds the money until the concierge decides
    const d1 = await booked();
    await startsIn(d1, -20);
    await act('authenticated', T, `select public.teacher_check_in($1)`, [d1.session]);
    await step('the teacher reports the learner absent after the grace period', () => act('authenticated', T, `select public.report_learner_absent($1)`, [d1.session]));
    const [{ open_dispute: exc }] = await step('the payer asks for an exception', () =>
      act('authenticated', L, `select public.open_dispute($1, 'exception_request', 'Hospital visit, I have a note')`, [d1.id]));
    await act('postgres', null, `update public.sessions set checked_out_at = now() - interval '49 hours' where id = $1`, [d1.session]);
    const [{ job_auto_confirm: held }] = await act('postgres', null, `select private.job_auto_confirm()`);
    ok('auto-confirm leaves a no-show with an open request alone', held === 0 && (await state(d1.id)).status === 'no_show_learner', held);
    await expectError('lessons: the payer cannot resolve their own request', 'authenticated', L,
      q(`select public.resolve_dispute('${exc}', 'credit', null, 'Granted on the hospital note', 5)`), /staff only/);
    await expectError('lessons: a resolution needs the minutes spent', 'authenticated', C,
      q(`select public.resolve_dispute('${exc}', 'credit', null, 'Granted on the hospital note', 0)`), /minutes/);
    await step('the concierge grants the exception as credit', () =>
      act('authenticated', C, `select public.resolve_dispute($1, 'credit', null, 'Granted on the hospital note', 6)`, [exc]));
    const sd = await state(d1.id);
    const [dd] = await act('postgres', null, `select status, outcome, credit_kes, staff_minutes from public.disputes where id = $1`, [exc]);
    ok('exception granted: credited, dispute resolved with minutes logged',
      sd.status === 'cancelled' && sd.hold === 'credited' && dd.status === 'resolved' && dd.outcome === 'credit' && dd.credit_kes === 1800 && dd.staff_minutes === 6, { sd, dd });
    const d2 = await booked();
    await startsIn(d2, -20);
    await act('authenticated', T, `select public.teacher_check_in($1)`, [d2.session]);
    await act('authenticated', T, `select public.report_learner_absent($1)`, [d2.session]);
    await act('postgres', null, `update public.sessions set checked_out_at = now() - interval '49 hours' where id = $1`, [d2.session]);
    await act('postgres', null, `select private.job_auto_confirm()`);
    ok('a no-show with no request is released after 48 hours', (await state(d2.id)).status === 'confirmed' && (await state(d2.id)).hold === 'released', await state(d2.id));

    // ---- E: a short lesson, settled with a partial refund
    const e1 = await booked();
    await startsIn(e1, -5);
    await teach(e1);
    await expectError('lessons: a problem report needs a description', 'authenticated', L, q(`select public.open_dispute('${e1.id}', 'short_session', 'short')`), /at least 10/);
    const [{ open_dispute: ed }] = await step('the payer reports a short lesson', () =>
      act('authenticated', L, `select public.open_dispute($1, 'short_session', 'We stopped after 25 minutes')`, [e1.id]));
    ok('the lesson is held as disputed', (await state(e1.id)).status === 'disputed' && (await state(e1.id)).ss === 'disputed', await state(e1.id));
    await expectError('lessons: one open problem per lesson', 'authenticated', L, q(`select public.open_dispute('${e1.id}', 'quality', 'Also the audio was poor')`), /already open/);
    await expectError('lessons: a partial refund is less than the payment', 'authenticated', C,
      q(`select public.resolve_dispute('${ed}', 'partial_refund', 1800, 'Half the lesson was lost', 10)`), /between 1 and/);
    await step('the concierge credits KES 600 and releases the rest', () =>
      act('authenticated', C, `select public.resolve_dispute($1, 'partial_refund', 600, 'Lesson ran 25 of 60 minutes', 10)`, [ed]));
    const le = await legs(e1.id);
    const se = await state(e1.id);
    ok('partial: 600 to credit, 1,200 released (fee 240, withholding 48, teacher 912)',
      se.status === 'confirmed' && se.hold === 'released' && le.guardian_credits === 600 && le.revenue_commission === 240 && le.withholding_payable === 48 && le.teacher_payable === 912 && le.client_funds_held === 0, { se, le });

    // ---- F: a teacher no-show refunded to M-Pesa
    const f1 = await booked();
    await startsIn(f1, 5);
    await expectError('lessons: a teacher no-show waits for the grace period', 'authenticated', L,
      q(`select public.open_dispute('${f1.id}', 'teacher_no_show', 'Nobody joined the Meet')`), /wait 15 minutes/);
    await startsIn(f1, -20);
    const [{ open_dispute: fd }] = await step('the payer reports the teacher absent', () =>
      act('authenticated', L, `select public.open_dispute($1, 'teacher_no_show', 'Nobody joined the Meet')`, [f1.id]));
    await step('the concierge refunds in full', () =>
      act('authenticated', C, `select public.resolve_dispute($1, 'full_refund', null, 'Teacher did not join, confirmed by the teacher', 4)`, [fd]));
    const sf = await state(f1.id);
    const [log] = await act('postgres', null, `select count(*)::int c from public.state_history where entity_id = $1 and to_state = 'no_show_teacher'`, [f1.id]);
    const [rf] = await act('postgres', null, `select id, status, amount_kes from public.refunds where booking_id = $1`, [f1.id]);
    ok('no-show recorded against the teacher, refund queued for Finance',
      sf.status === 'cancelled' && sf.cancelled_by_role === 'teacher' && log.c === 1 && rf?.status === 'requested' && rf?.amount_kes === 1800, { sf, log, rf });
    await act('authenticated', C, `update public.refunds set status = 'approved' where id = $1`, [rf.id]);
    const [still] = await act('postgres', null, `select status from public.refunds where id = $1`, [rf.id]);
    ok('the concierge cannot approve a refund', still.status === 'requested', still);
    await step('Finance approves the refund', () => act('authenticated', F, `update public.refunds set status = 'approved', approved_by = $2 where id = $1`, [rf.id, F]));
    await expectError('lessons: Finance cannot record the provider result', 'authenticated', F,
      q(`select public.record_refund_success('${rf.id}', 'rf_1', 0)`), /permission denied/);
    await step('the provider takes the refund', () => act('service_role', null, `select public.mark_refund_pending($1, 'rf_1')`, [rf.id]));
    const [{ record_refund_success: done1 }] = await step('the provider confirms the refund', () =>
      act('service_role', null, `select public.record_refund_success($1, 'rf_1', 0)`, [rf.id]));
    const [{ record_refund_success: done2 }] = await act('service_role', null, `select public.record_refund_success($1, 'rf_1', 0)`, [rf.id]);
    const [pf] = await act('postgres', null, `select status from public.payments where id = $1`, [f1.payment]);
    const lf = await legs(f1.id, 'cash_refund');
    ok('refunded once: payment refunded, credit spent, cash out 1,800', done1 && !done2 && pf.status === 'refunded' && lf.guardian_credits === -1800 && lf.cash_provider === 1800, { done1, done2, pf, lf });

    // ---- G: credit back to M-Pesa on request
    await expectError('lessons: nobody else can cash out a credit', 'authenticated', T, q(`select public.request_credit_refund('${c1.payment}')`), /not your payment/);
    const [{ request_credit_refund: cr }] = await step('the payer asks for a cancelled lesson’s credit back', () =>
      act('authenticated', L, `select public.request_credit_refund($1)`, [c1.payment]));
    await expectError('lessons: the same credit cannot be requested twice', 'authenticated', L, q(`select public.request_credit_refund('${c1.payment}')`), /no credit left/);
    await act('authenticated', F, `update public.refunds set status = 'approved', approved_by = $2 where id = $1`, [cr, F]);
    await step('the refund settles with a KES 30 fee straight from approved', () => act('service_role', null, `select public.record_refund_success($1, 'rf_2', 30)`, [cr]));
    const [pc] = await act('postgres', null, `select status from public.payments where id = $1`, [c1.payment]);
    const lc = await legs(c1.id, 'cash_refund');
    ok('credit refunded: payer gets 1,800, Koobi pays the 30 fee', pc.status === 'refunded' && lc.guardian_credits === -1800 && lc.cash_provider === 1830 && lc.expense_payment_fees === -30, { pc, lc });
    const failing = await act('authenticated', L, `select public.request_credit_refund($1) id`, [c3.payment]);
    await act('authenticated', F, `update public.refunds set status = 'approved', approved_by = $2 where id = $1`, [failing[0].id, F]);
    await act('service_role', null, `select public.record_refund_failure($1, 'Number not registered')`, [failing[0].id]);
    const [fr] = await act('postgres', null, `select status from public.refunds where id = $1`, [failing[0].id]);
    ok('a refused refund is marked failed and can be retried', fr.status === 'failed', fr);

    // ---- H: replacement and balances
    const [{ request_replacement: rep }] = await step('the payer asks for a replacement teacher', () =>
      act('authenticated', L, `select public.request_replacement($1, 'Prefer evenings')`, [f1.id]));
    const [rr] = await act('postgres', null, `select status, is_replacement_for_booking_id b, track from public.requests where id = $1`, [rep]);
    ok('replacement request reaches the concierge queue', rr.status === 'submitted' && rr.b === f1.id && rr.track === 'adults_professional', rr);
    const bal = await credits();
    // credits: c3 1,800 (refund failed, still credit) + c4 1,800 + d1 1,800 + e1 600 = 6,000
    ok('the payer’s credit balance is KES 6,000', bal === 6000, bal);
    const lines = await act('authenticated', L, `select payment_id, credit_kes, open_refund_kes, refunded_kes, last_refund_status from public.my_credit_lines()`);
    const c1l = lines.find((x) => x.payment_id === c1.payment);
    const c3l = lines.find((x) => x.payment_id === c3.payment);
    ok('credit lines: refunded, failed and open amounts per payment',
      lines.length === 6 && lines.reduce((s, x) => s + x.credit_kes, 0) === 6000 && c1l?.credit_kes === 0 && c1l?.refunded_kes === 1800 && c3l?.last_refund_status === 'failed' && c3l?.open_refund_kes === 0, lines);
    const others = await act('authenticated', T, `select * from public.my_credit_lines()`);
    ok('nobody else sees the payer’s credit lines', others.length === 0, others);

    // ---- I: spending credit on the next lesson
    const [nb] = await act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, 'single', 'online', now() + interval '20 days', 'cancellation-2026-11-v1', now()) returning id`, [offer.id, learner.id]);
    await expectError('lessons: someone else cannot spend the payer’s credit', 'authenticated', T, q(`select public.pay_with_credit('${nb.id}')`), /not your booking/);
    const [{ pay_with_credit: cp }] = await step('the payer pays a new lesson with credit', () => act('authenticated', L, `select public.pay_with_credit($1)`, [nb.id]));
    const [pcs] = await act('postgres', null, `select p.status, p.method, p.hold_status, p.amount_kes, b.status bs from public.payments p join public.bookings b on b.id = p.booking_id where p.id = $1`, [cp]);
    const spent = Object.fromEntries((await act('postgres', null, `select payment_id, sum(amount_kes)::int v from public.ledger_entries
       where booking_id = $1 and account = 'guardian_credits' and side = 'debit' group by payment_id`, [nb.id])).map((r) => [r.payment_id, r.v]));
    // PGlite fixes now() inside the transaction, so every credit has the same age here; the split is checked, not the order.
    const before = Object.fromEntries(lines.map((x) => [x.payment_id, x.credit_kes]));
    ok('paid from credit: held for the lesson, spent against the payments the credit came from',
      pcs.status === 'succeeded' && pcs.method === 'credit' && pcs.hold_status === 'held' && pcs.amount_kes === 1800 && pcs.bs === 'paid'
        && Object.values(spent).reduce((a, v) => a + v, 0) === 1800 && Object.entries(spent).every(([pid, v]) => v <= (before[pid] ?? 0)), { pcs, spent });
    ok('the balance drops by 1,800', (await credits()) === 4200, await credits());
    const [nb2] = await act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, 'single', 'online', now() + interval '21 days', 'cancellation-2026-11-v1', now()) returning id`, [offer.id, learner.id]);
    await act('authenticated', L, `select public.pay_with_credit($1)`, [nb2.id]);
    const [nb3] = await act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, 'single', 'online', now() + interval '22 days', 'cancellation-2026-11-v1', now()) returning id`, [offer.id, learner.id]);
    await act('authenticated', L, `select public.pay_with_credit($1)`, [nb3.id]);
    const [nb4] = await act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, 'single', 'online', now() + interval '23 days', 'cancellation-2026-11-v1', now()) returning id`, [offer.id, learner.id]);
    ok('three lessons later KES 600 is left', (await credits()) === 600, await credits());
    await expectError('lessons: credit cannot go below zero', 'authenticated', L, q(`select public.pay_with_credit('${nb4.id}')`), /not enough credit/);
    await act('authenticated', T, `select public.teacher_respond_booking($1, true, $2, null)`, [nb.id, MEET]);
    await act('authenticated', L, `select public.cancel_booking($1, null)`, [nb.id]);
    const [{ request_credit_refund: tr2 }] = await act('authenticated', L, `select public.request_credit_refund($1)`, [cp]);
    const [trf] = await act('postgres', null, `select method, amount_kes from public.refunds where id = $1`, [tr2]);
    ok('credit from a credit-paid lesson goes back by transfer', trf.method === 'transfer' && trf.amount_kes === 1800, trf);
    const [tot] = await act('postgres', null, `select coalesce(sum(case when side = 'debit' then amount_kes else -amount_kes end), 0)::int d from public.ledger_entries`);
    ok('the whole ledger balances', tot.d === 0, tot.d);
  } catch (e) {
    if (!/^lessons:/.test(e?.message ?? '')) fail('lessons: flow stopped', e.message);
  }
}


// ---------------------------------------------------------------------------- app flow: sprint 6 verification and payouts
// Mirrors src/app/teach/verification, src/app/teach/settings and src/app/staff/(console)/payouts|verification|reconciliation.
async function checkAppPayoutFlow() {
  const L = 'b1111111-1111-1111-1111-111111111111';
  const T = 'b2222222-2222-2222-2222-222222222222';
  const R = 'b3333333-3333-3333-3333-333333333333';
  const F1 = 'b4444444-4444-4444-4444-444444444444';
  const F2 = 'b5555555-5555-5555-5555-555555555555';
  const MEET = 'https://meet.google.com/abc-defg-hij';
  const ENC = 'v1:test-ciphertext-0000000000';
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`payouts: ${name}`);
      return r;
    } catch (e) {
      fail(`payouts: ${name}`, e.message);
      throw e;
    }
  };
  const ok = (name, cond, detail) => (cond ? pass(`payouts: ${name}`) : fail(`payouts: ${name}`, JSON.stringify(detail)));
  const err = (name, role, sub, sql, pattern) => expectError(`payouts: ${name}`, role, sub, q(sql), pattern);
  try {
    await act('postgres', null, `insert into auth.users (id, email, phone, raw_user_meta_data) values
      ($1, 'pl@koobi.test', '254711000021', '{"display_name": "Pendo Learner"}'), ($2, 'pt@koobi.test', '254722000022', '{"display_name": "Paka Teacher"}'),
      ($3, 'pr@koobi.test', null, '{"display_name": "Rita Reviewer"}'), ($4, 'pf1@koobi.test', null, '{"display_name": "Fina One"}'),
      ($5, 'pf2@koobi.test', null, '{"display_name": "Fina Two"}')`, [L, T, R, F1, F2]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'learner'), ($2, 'teacher'), ($3, 'reviewer'), ($4, 'finance'), ($5, 'finance'), ($5, 'admin')`, [L, T, R, F1, F2]);
    const [teacher] = await act('authenticated', T, `insert into public.teachers (user_id, slug, display_name) values ($1, 'paka-teacher', 'Paka Teacher') returning id`, [T]);
    const [offer] = await act('postgres', null, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, trial_discount_pct, language_codes)
      values ($1, 'Excel for work', 'x', 'digital_practical_skills', 'adults_professional', 'one_to_one', 'Excel',
        '{online}', 'google_meet', 60, 1800, 50, '{en}') returning id`, [teacher.id]);
    for (const [tbl, id] of [['teachers', teacher.id], ['offerings', offer.id]]) {
      await act('postgres', null, `update public.${tbl} set listing_status = 'pending_review' where id = $1`, [id]);
      await act('postgres', null, `update public.${tbl} set listing_status = 'approved' where id = $1`, [id]);
    }
    const [learner] = await act('authenticated', L, `insert into public.learners (user_id, alias) values ($1, 'Pendo') returning id`, [L]);
    let n = 0;
    const lesson = async (kind = 'single') => {
      n++;
      const [b] = await act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
        values ($1, $2, $3, 'online', now() + interval '${3 + n} days', 'cancellation-2026-11-v1', now()) returning id`, [offer.id, learner.id, kind]);
      await act('authenticated', L, `update public.bookings set status = 'awaiting_payment' where id = $1`, [b.id]);
      const [p] = await act('authenticated', L, `insert into public.payments (booking_id, method) values ($1, 'mpesa_stk') returning id`, [b.id]);
      await act('service_role', null, `select public.record_payment_success($1, $2, 0, null)`, [p.id, `ps_s6_${n}`]);
      await act('authenticated', T, `select public.teacher_respond_booking($1, true, $2, null)`, [b.id, MEET]);
      const [s] = await act('postgres', null, `select id from public.sessions where booking_id = $1`, [b.id]);
      await act('postgres', null, `update public.bookings set starts_at = now() - interval '5 minutes' where id = $1`, [b.id]);
      await act('postgres', null, `update public.sessions set starts_at = now() - interval '5 minutes', ends_at = now() + interval '55 minutes' where id = $1`, [s.id]);
      await act('authenticated', T, `select public.teacher_check_in($1)`, [s.id]);
      await act('authenticated', T, `select public.teacher_check_out($1)`, [s.id]);
      await act('authenticated', T, `select public.file_lesson_note($1, 'Pivot tables and VLOOKUP', null, null)`, [s.id]);
      await act('authenticated', L, `select public.confirm_lesson($1)`, [b.id]);
      return b.id;
    };
    await step('two confirmed lessons: a single and a trial', async () => { await lesson('single'); await lesson('trial'); });
    const week = (await act('postgres', null, `select date_trunc('week', now() at time zone 'Africa/Nairobi')::date::text w`))[0].w;
    const payoutOf = async (batch) => (await act('postgres', null, `select id, status, exclusion_reason, gross_kes, platform_fee_kes, withholding_kes, net_kes, transfer_fee_kes,
        (select count(*)::int from public.payout_lines l where l.payout_id = p.id) lines from public.payouts p where batch_id = $1 and teacher_id = $2`, [batch, teacher.id]))[0];

    // ---- payout readiness
    await err('a teacher cannot build a batch', 'authenticated', T, `select public.compute_payout_batch()`, /finance only/);
    const [{ compute_payout_batch: b0 }] = await step('Finance builds the week’s batch', () => act('authenticated', F1, `select public.compute_payout_batch()`));
    const p0 = await payoutOf(b0);
    ok('no KRA PIN: listed as excluded, nothing attached, balance kept', p0?.status === 'excluded' && p0.exclusion_reason === 'KRA PIN missing' && p0.lines === 0 && p0.net_kes === 3078, p0);
    await err('an empty batch cannot be approved', 'authenticated', F1, `select public.approve_payout_batch('${b0}')`, /nobody to pay/);
    await step('the teacher saves a KRA PIN (encrypted by the app)', () => act('authenticated', T, `update public.teachers set kra_pin_enc = $2 where id = $1`, [teacher.id, ENC]));
    await err('the payout number cannot be written directly', 'authenticated', T, `update public.teachers set payout_phone_enc = '${ENC}' where id = '${teacher.id}'`, /permission denied/);
    const [{ set_payout_number: poc }] = await step('the teacher sets a payout number', () => act('authenticated', T, `select public.set_payout_number($1)`, [ENC]));
    await err('only the server records a test payout', 'authenticated', T, `select public.record_test_payout('${poc}', 10, 0, 'tr_1', 'PAKA TEACHER')`, /permission denied/);
    await step('the test payout lands', () => act('service_role', null, `select public.record_test_payout($1, 10, 0, 'tr_1', 'PAKA TEACHER')`, [poc]));
    const [tp] = await act('postgres', null, `select status, cost_kes, result_summary ->> 'recipient_name' n from public.verification_checks where id = $1`, [poc]);
    ok('the ownership check waits for a reviewer with the M-Pesa name', tp.status === 'in_review' && tp.cost_kes === 10 && tp.n === 'PAKA TEACHER', tp);
    await err('a learner cannot review checks', 'authenticated', L, `select public.review_check('${poc}', true, 'ok', 2, null)`, /reviewers only/);
    await err('a failed check needs a reason', 'authenticated', R, `select public.review_check('${poc}', false, '', 2, null)`, /say why/);
    await step('the reviewer passes the payout number', () => act('authenticated', R, `select public.review_check($1, true, 'Name matches the ID', 3, null)`, [poc]));
    const [t1] = await act('postgres', null, `select payout_ownership_status o, status from public.teachers where id = $1`, [teacher.id]);
    ok('payout number proven; not bookable until the ID passes', t1.o === 'passed' && t1.status === 'applied', t1);

    // ---- identity and the ladder
    const [{ start_check: idc }] = await step('the teacher starts the identity check', () => act('authenticated', T, `select public.start_check('identity_iprs', null)`));
    const [{ start_check: same }] = await act('authenticated', T, `select public.start_check('identity_iprs', null)`);
    ok('starting it again returns the open check', same === idc, { idc, same });
    await err('it cannot be sent without the ID photo', 'authenticated', T, `select public.submit_check('${idc}', '{"id_number_enc": "v1:dGVzdGNpcGhlcnRleHQwMDAwMDA="}')`, /upload the document/);
    await step('the teacher uploads the ID photo', () => act('authenticated', T, `insert into public.verification_documents (check_id, teacher_id, storage_key, kind)
      values ($1, $2, $3, 'id_front')`, [idc, teacher.id, `teacher/${teacher.id}/${idc}/front.jpg`]));
    await err('nobody can list documents directly', 'authenticated', T, `select * from public.verification_documents`, /permission denied/);
    await err('a malformed ID number is refused', 'authenticated', T, `select public.submit_check('${idc}', '{"id_number": "12AB"}')`, /ID number/);
    await step('the teacher sends it for review', () => act('authenticated', T, `select public.submit_check($1, '{"id_number_enc": "v1:dGVzdGNpcGhlcnRleHQwMDAwMDA=", "id_number": "12345678"}')`, [idc]));
    const [kept] = await act('postgres', null, `select result_summary -> 'submitted' s from public.verification_checks where id = $1`, [idc]);
    ok('only the encrypted ID number is kept', !('id_number' in kept.s) && kept.s.id_number_enc.startsWith('v1:'), kept);
    const mine = await act('authenticated', T, `select kind from public.my_check_documents() where check_id = $1`, [idc]);
    ok('the teacher sees one upload, without its key', mine.length === 1 && mine[0].kind === 'id_front' && !('storage_key' in mine[0]), mine);
    await err('a teacher cannot open documents', 'authenticated', T, `select public.open_document((select id from public.verification_documents limit 1))`, /reviewers only|permission denied/);
    const docs = await act('authenticated', R, `select id from public.check_documents($1)`, [idc]);
    const [{ open_document: key }] = await step('the reviewer opens the document', () => act('authenticated', R, `select public.open_document($1)`, [docs[0].id]));
    const [audit] = await act('postgres', null, `select count(*)::int c from public.audit_log where action = 'document.view' and entity_id = $1 and actor_user_id = $2`, [docs[0].id, R]);
    ok('every document view is logged', key.endsWith('front.jpg') && audit.c === 1, { key, audit });
    await step('the reviewer passes the ID', () => act('authenticated', R, `select public.review_check($1, true, 'Photo and number match', 4, null)`, [idc]));
    const [t2] = await act('postgres', null, `select t.status, tt.tier, private.teacher_badges(t.id, null) b from public.teachers t
      join public.teacher_tracks tt on tt.teacher_id = t.id and tt.track = 'adults_professional' where t.id = $1`, [teacher.id]);
    ok('tier 1 on the track, bookable, and an "ID verified" badge with its date',
      t2.status === 'bookable' && t2.tier === 1 && t2.b.length === 1 && t2.b[0].label === 'ID verified' && !!t2.b[0].passed_at, t2);
    const [{ start_check: ev }] = await act('authenticated', T, `select public.start_check('experience_evidence', null)`);
    await act('authenticated', T, `insert into public.verification_documents (check_id, teacher_id, storage_key, kind) values ($1, $2, $3, 'portfolio')`, [ev, teacher.id, `teacher/${teacher.id}/${ev}/p.pdf`]);
    await act('authenticated', T, `select public.submit_check($1, '{"summary": "Six years in finance teams"}')`, [ev]);
    await act('authenticated', R, `select public.review_check($1, true, 'Letters from two employers', 6, null)`, [ev]);
    ok('a tier-2 check lifts the track to tier 2', (await act('postgres', null, `select tier from public.teacher_tracks where teacher_id = $1`, [teacher.id]))[0].tier === 2, null);
    await err('a passed check cannot be started again', 'authenticated', T, `select public.start_check('experience_evidence', null)`, /already passed/);
    const [{ start_check: gc }] = await act('authenticated', T, `select public.start_check('good_conduct', null)`);
    await act('authenticated', T, `insert into public.verification_documents (check_id, teacher_id, storage_key, kind) values ($1, $2, $3, 'good_conduct')`, [gc, teacher.id, `teacher/${teacher.id}/${gc}/gc.pdf`]);
    await act('authenticated', T, `select public.submit_check($1, '{}')`, [gc]);
    await step('the reviewer fails a blurred certificate', () => act('authenticated', R, `select public.review_check($1, false, 'The certificate number is unreadable', 2, null)`, [gc]));
    const [mv] = await act('authenticated', T, `select status, failure_reason from public.my_verification_checks where id = $1`, [gc]);
    const [{ start_check: gc2 }] = await act('authenticated', T, `select public.start_check('good_conduct', null)`);
    const [a2] = await act('postgres', null, `select attempt_no from public.verification_checks where id = $1`, [gc2]);
    ok('the teacher sees why, and can try again as attempt 2', mv.status === 'failed' && mv.failure_reason.includes('unreadable') && a2.attempt_no === 2, { mv, a2 });

    await err('a reviewer cannot suspend a teacher', 'authenticated', R, `update public.teachers set status = 'suspended' where id = '${teacher.id}'`, /not allowed/);
    await step('an admin suspends the teacher', () => act('authenticated', F2, `update public.teachers set status = 'suspended', status_reason = 'Safety report under review' where id = $1`, [teacher.id]));
    const [hidden] = await act('anon', null, `select count(*)::int c from public.explore_offers where teacher_slug = 'paka-teacher'`);
    await err('reinstating needs a reason', 'authenticated', F2, `select public.reinstate_teacher('${teacher.id}', '')`, /reason/);
    await step('the admin reinstates the teacher', () => act('authenticated', F2, `select public.reinstate_teacher($1, 'Report closed, no finding')`, [teacher.id]));
    const [back] = await act('postgres', null, `select status from public.teachers where id = $1`, [teacher.id]);
    ok('suspended offers are hidden; reinstated straight back to bookable from the checks', hidden.c === 0 && back.status === 'bookable', { hidden, back });

    // ---- the batch, two approvers, the transfer
    const [{ compute_payout_batch: b1 }] = await step('Finance rebuilds the batch', () => act('authenticated', F1, `select public.compute_payout_batch()`));
    const p1 = await payoutOf(b1);
    ok('same batch, now payable: 2 lines, gross 3,600, fee 360, withholding 162, net 3,078, transfer fee 40',
      b1 === b0 && p1.status === 'pending_approval' && p1.lines === 2 && p1.gross_kes === 3600 && p1.platform_fee_kes === 360
        && p1.withholding_kes === 162 && p1.net_kes === 3078 && p1.transfer_fee_kes === 40, p1);
    const lines = await act('authenticated', T, `select gross_kes, commission_kes, withholding_kes, net_kes from public.payout_lines order by net_kes`);
    ok('the teacher reads the statement lines: 1,800 − 360 − 72 = 1,368 and trial 1,800 − 0 − 90 = 1,710',
      lines.length === 2 && lines[0].net_kes === 1368 && lines[0].commission_kes === 360 && lines[0].withholding_kes === 72
        && lines[1].net_kes === 1710 && lines[1].gross_kes === 1800 && lines[1].withholding_kes === 90, lines);
    const [e1] = await act('authenticated', T, `select owed_kes, in_payout_kes, paid_kes from public.my_earnings()`);
    ok('earnings: 3,078 owed and in this week’s payout', e1.owed_kes === 3078 && e1.in_payout_kes === 3078 && e1.paid_kes === 0, e1);
    await err('a teacher cannot approve a batch', 'authenticated', T, `select public.approve_payout_batch('${b1}')`, /finance only/);
    const [{ approve_payout_batch: first }] = await step('the first Finance approval', () => act('authenticated', F1, `select public.approve_payout_batch($1)`, [b1]));
    await err('the same person cannot approve twice', 'authenticated', F1, `select public.approve_payout_batch('${b1}')`, /second person/);
    const [{ approve_payout_batch: second }] = await step('a second person approves', () => act('authenticated', F2, `select public.approve_payout_batch($1)`, [b1]));
    const [{ compute_payout_batch: b1again }] = await act('authenticated', F1, `select public.compute_payout_batch()`);
    ok('approved: payouts approved, and the batch is not rebuilt', first === 'first' && second === 'approved' && b1again === b1 && (await payoutOf(b1)).status === 'approved', { first, second });
    await err('only the server records a transfer', 'authenticated', F1, `select public.record_payout_sent('${p1.id}', 'tf_1', 40)`, /permission denied/);
    await step('the transfer is requested', () => act('service_role', null, `select public.mark_payout_sending($1, 'tf_1')`, [p1.id]));
    const [{ record_payout_sent: s1 }] = await step('the provider confirms the transfer', () => act('service_role', null, `select public.record_payout_sent($1, 'tf_1', 40)`, [p1.id]));
    const [{ record_payout_sent: s2 }] = await act('service_role', null, `select public.record_payout_sent($1, 'tf_1', 40)`, [p1.id]);
    const owed = (await act('postgres', null, `select coalesce(sum(case when side = 'credit' then amount_kes else -amount_kes end), 0)::int v
       from public.ledger_entries where account = 'teacher_payable' and counterparty_user_id = $1`, [T]))[0].v;
    const [bt] = await act('postgres', null, `select status from public.payout_batches where id = $1`, [b1]);
    ok('sent once: teacher owed nothing, batch completed', s1 === true && s2 === false && owed === 0 && bt.status === 'completed', { s1, s2, owed, bt });
    const [e2] = await act('authenticated', T, `select owed_kes, in_payout_kes, paid_kes from public.my_earnings()`);
    ok('earnings: 3,078 paid', e2.owed_kes === 0 && e2.in_payout_kes === 0 && e2.paid_kes === 3078, e2);

    // ---- a failing transfer is parked after three attempts, then cancelled back to payable
    await lesson('single');
    const nextWeek = (await act('postgres', null, `select ($1::date + 7)::text w`, [week]))[0].w;
    const [{ compute_payout_batch: b2 }] = await act('postgres', null, `select private.compute_payout_batch($1::date, now())`, [nextWeek]);
    await act('authenticated', F1, `select public.approve_payout_batch($1)`, [b2]);
    await act('authenticated', F2, `select public.approve_payout_batch($1)`, [b2]);
    const p2 = await payoutOf(b2);
    for (let i = 0; i < 3; i++) {
      await act('service_role', null, `select public.mark_payout_sending($1, null)`, [p2.id]);
      await act('service_role', null, `select public.record_payout_failure($1, 'Recipient number inactive')`, [p2.id]);
    }
    ok('three failures park the payout', (await payoutOf(b2)).status === 'parked', await payoutOf(b2));
    await step('Finance cancels the parked payout', () => act('authenticated', F1, `select public.cancel_payout($1, 'Teacher is changing number')`, [p2.id]));
    const p2c = await payoutOf(b2);
    const [e3] = await act('authenticated', T, `select owed_kes from public.my_earnings()`);
    ok('cancelled: lines freed, 1,368 still owed for next week', p2c.status === 'cancelled' && p2c.lines === 0 && e3.owed_kes === 1368, { p2c, e3 });

    // ---- reconciliation blocks payouts until Koobi funds the trial subsidy
    await err('a teacher cannot run reconciliation', 'authenticated', T, `select public.run_reconciliation()`, /finance only/);
    const [{ run_reconciliation: rr1 }] = await step('Finance runs reconciliation', () => act('authenticated', F1, `select public.run_reconciliation()`));
    const [run1] = await act('postgres', null, `select status, findings from public.reconciliation_runs where id = $1`, [rr1]);
    const checks1 = run1.findings.map((f) => f.check);
    ok('the only finding: liabilities exceed cash after paying a subsidised trial', run1.status === 'failed' && checks1.length === 1 && checks1[0] === 'client_money_covered', run1);
    await err('payouts are blocked while it fails', 'authenticated', F1, `select public.compute_payout_batch()`, /reconciliation failed/);
    const short = run1.findings[0].liabilities_kes - run1.findings[0].cash_kes;
    const [adj] = await step('Finance requests a top-up of the provider balance', () => act('authenticated', F1, `insert into public.ledger_adjustment_requests (reason, proposed_entries)
      values ('Fund trial subsidies and fees', $1::jsonb) returning id`, [JSON.stringify([{ account: 'cash_provider', side: 'debit', amount_kes: short }, { account: 'adjustments', side: 'credit', amount_kes: short }])]));
    await err('the requester cannot approve it', 'authenticated', F1, `select public.approve_adjustment('${adj.id}')`, /second person/);
    await err('nobody can mark it posted by hand', 'authenticated', F2, `update public.ledger_adjustment_requests set status = 'posted' where id = '${adj.id}'`, /permission denied/);
    await step('a second person posts it', () => act('authenticated', F2, `select public.approve_adjustment($1)`, [adj.id]));
    const [{ run_reconciliation: rr2 }] = await act('authenticated', F1, `select public.run_reconciliation()`);
    const [run2] = await act('postgres', null, `select status, findings from public.reconciliation_runs where id = $1`, [rr2]);
    ok('reconciliation passes after the top-up', run2.status === 'passed', run2);
    const [tot] = await act('postgres', null, `select coalesce(sum(case when side = 'debit' then amount_kes else -amount_kes end), 0)::int d from public.ledger_entries`);
    ok('the whole ledger balances', tot.d === 0, tot.d);
  } catch (e) {
    if (!/^payouts:/.test(e?.message ?? '')) fail('payouts: flow stopped', e.message);
  }
}


// ---------------------------------------------------------------------------- app flow: sprint 7 notifications, children, packages, admin
async function checkAppSprint7Flow() {
  const G = 'c1111111-1111-1111-1111-111111111111'; // parent
  const T = 'c2222222-2222-2222-2222-222222222222'; // teacher
  const A = 'c3333333-3333-3333-3333-333333333333'; // admin
  const F = 'c4444444-4444-4444-4444-444444444444'; // finance
  const R = 'c5555555-5555-5555-5555-555555555555'; // reviewer
  const MEET = 'https://meet.google.com/abc-defg-hij';
  const ENC = 'v1:test-ciphertext-0000000000';
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`sprint 7: ${name}`);
      return r;
    } catch (e) {
      fail(`sprint 7: ${name}`, e.message);
      throw e;
    }
  };
  const ok = (name, cond, detail) => (cond ? pass(`sprint 7: ${name}`) : fail(`sprint 7: ${name}`, JSON.stringify(detail)));
  const err = (name, role, sub, sql, pattern) => expectError(`sprint 7: ${name}`, role, sub, q(sql), pattern);
  const notes = async (user, template) => (await act('postgres', null, `select channel, status from public.notifications where user_id = $1 and template = $2 order by channel`, [user, template]));
  try {
    await act('postgres', null, `insert into auth.users (id, email, phone, raw_user_meta_data) values
      ($1, 'parent@koobi.test', '254711000031', '{"display_name": "Wanjiru Parent"}'), ($2, null, '254722000032', '{"display_name": "Otieno Teacher"}'),
      ($3, 'admin7@koobi.test', null, '{"display_name": "Ada Admin"}'), ($4, 'fin7@koobi.test', null, '{"display_name": "Faith Finance"}'),
      ($5, 'rev7@koobi.test', null, '{"display_name": "Rose Reviewer"}')`, [G, T, A, F, R]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'teacher'), ($2, 'admin'), ($3, 'finance'), ($4, 'reviewer')`, [T, A, F, R]);
    const [teacher] = await act('authenticated', T, `insert into public.teachers (user_id, slug, display_name) values ($1, 'otieno-teacher', 'Otieno Teacher') returning id`, [T]);
    const [offer] = await act('postgres', null, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, trial_discount_pct, language_codes)
      values ($1, 'KCSE Chemistry', 'x', 'school_academic', 'school', 'one_to_one', 'Chemistry',
        '{online,in_home}', 'google_meet', 60, 1800, 50, '{en}') returning id`, [teacher.id]);
    for (const [tbl, id] of [['teachers', teacher.id], ['offerings', offer.id]]) {
      await act('postgres', null, `update public.${tbl} set listing_status = 'pending_review' where id = $1`, [id]);
      await act('postgres', null, `update public.${tbl} set listing_status = 'approved' where id = $1`, [id]);
    }

    // ---- a child, consent first
    await step('a parent sets up a parent account', () => act('authenticated', G, `select public.become_guardian('Wanjiru')`));
    await err('no child without the consent', 'authenticated', G, `select public.add_child('Amani', 2011, null, null, null, null, 'x')`, /consent/);
    const [{ add_child: child }] = await step('the parent adds a child with consent', () =>
      act('authenticated', G, `select public.add_child('Amani', 2011, null, null, 'en', null, 'parental-consent-2026-11-v1')`));
    const [kid] = await act('postgres', null, `select is_minor, consent_status from public.learners where id = $1`, [child]);
    ok('the child is a minor with active consent', kid.is_minor === true && kid.consent_status === 'active', kid);
    const book = (mode, at) => act('authenticated', G, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, 'single', $3, now() + interval '${at}', 'cancellation-2026-11-v1', now()) returning id`, [offer.id, child, mode]);
    await err('in person needs the parent’s ID check', 'authenticated', G, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ('${offer.id}', '${child}', 'single', 'in_home', now() + interval '3 days', 'cancellation-2026-11-v1', now())`, /ID check/);
    const [ob] = await step('an online lesson for the child is fine', () => book('online', '3 days'));

    // ---- notifications follow the events
    await act('authenticated', G, `update public.bookings set status = 'awaiting_payment' where id = $1`, [ob.id]);
    const [pay] = await act('authenticated', G, `insert into public.payments (booking_id, method) values ($1, 'mpesa_stk') returning id`, [ob.id]);
    await act('service_role', null, `select public.record_payment_success($1, 'ps_s7_1', 27, null)`, [pay.id]);
    const tn = await notes(T, 'booking_paid_teacher');
    const rc = await notes(G, 'receipt');
    ok('paid: the teacher gets an in-app and an SMS message, the parent an in-app and an email receipt',
      tn.map((x) => x.channel).join() === 'in_app,sms' && tn.find((x) => x.channel === 'sms').status === 'queued' && rc.map((x) => x.channel).join() === 'email,in_app', { tn, rc });
    await act('authenticated', T, `select public.teacher_respond_booking($1, true, $2, null)`, [ob.id, MEET]);
    const acc = await notes(G, 'booking_accepted');
    ok('accepted: the parent is told', acc.length === 2, acc);
    const [pb] = await act('postgres', null, `select payload from public.notifications where user_id = $1 and template = 'booking_accepted' and channel = 'sms'`, [G]);
    ok('messages carry allow-listed fields only: first names and alias, never phone numbers', !JSON.stringify(pb.payload).includes('2547') && pb.payload.learner === 'Amani' && pb.payload.teacher === 'Otieno', pb);
    await act('authenticated', T, `insert into public.notification_preferences (user_id, sms_enabled) values ($1, false)`, [T]);
    await act('postgres', null, `update public.sessions set starts_at = now() + interval '60 minutes', ends_at = now() + interval '120 minutes' where booking_id = $1`, [ob.id]);
    await act('postgres', null, `select private.job_scheduled_notifications()`);
    await act('postgres', null, `select private.job_scheduled_notifications()`);
    const rem = await act('postgres', null, `select user_id, channel from public.notifications where template = 'reminder_1h' order by user_id, channel`);
    ok('an hour before: both sides reminded once; the teacher who turned SMS off gets in-app only',
      rem.length === 3 && rem.filter((x) => x.user_id === T).map((x) => x.channel).join() === 'in_app', rem);
    await err('only the dispatcher claims messages', 'authenticated', G, `select * from public.claim_notifications(10)`, /permission denied/);
    const claimed = await step('the dispatcher claims queued messages', () => act('service_role', null, `select id, channel from public.claim_notifications(50)`));
    ok('only outside channels are claimed, each once', claimed.length >= 3 && claimed.every((x) => x.channel !== 'in_app')
      && (await act('service_role', null, `select * from public.claim_notifications(50)`)).length === 0, claimed);
    await step('the parent marks notifications read', () => act('authenticated', G, `select public.mark_notifications_read()`));

    // ---- the parent's ID unlocks in-person lessons
    const [{ start_guardian_check: gc }] = await act('authenticated', G, `select public.start_guardian_check()`);
    await err('the ID check needs both photos', 'authenticated', G, `select public.submit_guardian_check('${gc}', '${ENC}')`, /upload/);
    await act('authenticated', G, `insert into public.guardian_documents (check_id, storage_key, kind) values ($1, 'guardian/x/front.jpg', 'id_front'), ($1, 'guardian/x/selfie.jpg', 'selfie')`, [gc]);
    await step('the parent sends the ID check', () => act('authenticated', G, `select public.submit_guardian_check($1, $2)`, [gc, ENC]));
    await err('the parent cannot pass their own check', 'authenticated', G, `select public.review_guardian_check('${gc}', true, 'ok', 2)`, /reviewers only/);
    await step('a reviewer passes it', () => act('authenticated', R, `select public.review_guardian_check($1, true, 'Photo matches the ID', 3)`, [gc]));
    await step('in person is now allowed for the child', () => book('in_home', '5 days'));
    await step('the parent withdraws consent', () => act('authenticated', G, `select public.withdraw_consent($1)`, [child]));
    await err('no new bookings for the child after consent is withdrawn', 'authenticated', G, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ('${offer.id}', '${child}', 'single', 'online', now() + interval '6 days', 'cancellation-2026-11-v1', now())`, /consent/);
    await act('authenticated', G, `insert into public.consents (guardian_id, learner_id, text_version, channel)
      values ((select id from public.guardians where user_id = $1), $2, 'parental-consent-2026-11-v1', 'web')`, [G, child]);

    // ---- a package, released lesson by lesson
    const [pk] = await step('the parent chooses an 8-lesson package', () => act('authenticated', G, `insert into public.packages (learner_id, offering_id, sessions_total, cadence_per_week)
      values ($1, $2, 8, 2) returning id, price_kes, ends_on - starts_on as days`, [child, offer.id]));
    ok('priced by the server at 8 × 1,800, valid 4 weeks plus 2 weeks grace', pk.price_kes === 14400 && pk.days === 42, pk);
    const [pp] = await act('authenticated', G, `insert into public.payments (package_id, method) values ($1, 'mpesa_stk') returning id, amount_kes`, [pk.id]);
    await act('service_role', null, `select public.record_payment_success($1, 'ps_s7_pk', 0, null)`, [pp.id]);
    ok('the package is active and KES 14,400 is held', pp.amount_kes === 14400 && (await act('postgres', null, `select status from public.packages where id = $1`, [pk.id]))[0].status === 'active', pp);
    await err('someone else cannot book from the package', 'authenticated', T, `select public.book_from_package('${pk.id}', now() + interval '10 days', 'online')`, /not your package/);
    const [{ book_from_package: l1 }] = await step('the parent books a lesson from the package', () =>
      act('authenticated', G, `select public.book_from_package($1, now() + interval '10 days', 'online')`, [pk.id]));
    const [b1] = await act('postgres', null, `select status, kind, price_kes, (select sessions_used from public.packages where id = $2) used from public.bookings where id = $1`, [l1, pk.id]);
    ok('paid from the package: KES 1,800 a lesson, one used', b1.status === 'paid' && b1.kind === 'package_session' && b1.price_kes === 1800 && b1.used === 1, b1);
    await act('authenticated', T, `select public.teacher_respond_booking($1, true, $2, null)`, [l1, MEET]);
    const [s1] = await act('postgres', null, `select id from public.sessions where booking_id = $1`, [l1]);
    await act('postgres', null, `update public.bookings set starts_at = now() - interval '5 minutes' where id = $1`, [l1]);
    await act('postgres', null, `update public.sessions set starts_at = now() - interval '5 minutes', ends_at = now() + interval '55 minutes' where id = $1`, [s1.id]);
    await act('authenticated', T, `select public.teacher_check_in($1)`, [s1.id]);
    await act('authenticated', T, `select public.teacher_check_out($1)`, [s1.id]);
    await act('authenticated', T, `select public.file_lesson_note($1, 'Mole concept and titration', null, null)`, [s1.id]);
    await step('the parent confirms the package lesson', () => act('authenticated', G, `select public.confirm_lesson($1)`, [l1]));
    const [rel] = await act('postgres', null, `select private.held_balance($1) held,
        (select hold_status from public.payments where id = $1) hold,
        (select sum(amount_kes)::int from public.ledger_entries where booking_id = $2 and account = 'teacher_payable') net`, [pp.id, l1]);
    ok('one lesson released (teacher 1,368); 12,600 still held for the rest', rel.held === 12600 && rel.hold === 'held' && rel.net === 1368, rel);
    const [{ book_from_package: l2 }] = await act('authenticated', G, `select public.book_from_package($1, now() + interval '11 days', 'online')`, [pk.id]);
    await act('authenticated', T, `select public.teacher_respond_booking($1, false, null, 'Away that week')`, [l2]);
    const [dec] = await act('postgres', null, `select b.status, p.sessions_used, private.held_balance($3) held from public.bookings b, public.packages p where b.id = $1 and p.id = $2`, [l2, pk.id, pp.id]);
    ok('declined: the lesson goes back into the package, no money moves', dec.status === 'cancelled' && dec.sessions_used === 1 && dec.held === 12600, dec);
    const [{ book_from_package: l3 }] = await act('authenticated', G, `select public.book_from_package($1, now() + interval '12 days', 'online')`, [pk.id]);
    await act('authenticated', T, `select public.teacher_respond_booking($1, true, $2, null)`, [l3, MEET]);
    const [{ cancel_booking: c3 }] = await act('authenticated', G, `select public.cancel_booking($1, null)`, [l3]);
    ok('cancelled in time: back in the package', c3 === 'credited' && (await act('postgres', null, `select sessions_used u from public.packages where id = $1`, [pk.id]))[0].u === 1, c3);
    await err('the monthly plan needs a first month in person', 'authenticated', G, `insert into public.packages (learner_id, offering_id, sessions_total, plan_type, cadence_per_week)
      values ('${child}', '${offer.id}', 8, 'managed', 2)`, /first month/);
    await act('postgres', null, `update public.packages set starts_on = current_date - 43, ends_on = current_date - 1 where id = $1`, [pk.id]);
    const [{ job_expire_packages: ex }] = await step('expired packages are closed', () => act('postgres', null, `select private.job_expire_packages()`));
    const [exp] = await act('postgres', null, `select p.status, (select hold_status from public.payments where id = $2) hold,
        (select coalesce(sum(case when side = 'credit' then amount_kes else -amount_kes end), 0)::int from public.ledger_entries where account = 'guardian_credits' and package_id = $1) credit
        from public.packages p where p.id = $1`, [pk.id, pp.id]);
    ok('unused lessons became KES 12,600 of credit', ex === 1 && exp.status === 'expired' && exp.hold === 'credited' && exp.credit === 12600, exp);

    // ---- data rights, roles, parameters, metrics
    await step('the parent asks for an export', () => act('authenticated', G, `insert into public.data_requests (kind) values ('export')`));
    await act('authenticated', G, `select public.log_data_export()`);
    const [dl] = await act('postgres', null, `select status, completed_at is not null done from public.data_requests where user_id = $1 and note = 'Downloaded from Settings'`, [G]);
    ok('a download is recorded as a completed export', dl?.status === 'completed' && dl.done, dl);
    const [{ my_data_export: data }] = await act('authenticated', G, `select public.my_data_export()`);
    ok('the export holds the profile, children and bookings, not other people’s numbers',
      data.profile.display_name === 'Wanjiru Parent' && data.learners.length === 1 && data.bookings.length >= 3 && !JSON.stringify(data).includes('254722000032'), Object.keys(data));
    await err('only an admin grants staff roles', 'authenticated', F, `select public.set_staff_role('${R}', 'finance', true)`, /admin only/);
    await err('nobody can self-assign a staff role', 'authenticated', G, `select public.claim_role('admin')`, /cannot be self-assigned/);
    await step('the admin makes the reviewer a concierge too', () => act('authenticated', A, `select public.set_staff_role($1, 'concierge', true)`, [R]));
    await err('an admin cannot remove their own admin role', 'authenticated', A, `select public.set_staff_role('${A}', 'admin', false)`, /own admin/);
    await err('parameters never change in the past', 'authenticated', F, `select public.add_parameter('cancellation_window_hours', null, null, null, '12', now() - interval '1 day', 'Testing a shorter window')`, /past/);
    await err('unknown parameters are refused', 'authenticated', F, `select public.add_parameter('free_lessons', null, null, null, '1', now(), 'Not a real parameter')`, /unknown/);
    await step('Finance schedules a new cancellation window', () => act('authenticated', F, `select public.add_parameter('cancellation_window_hours', null, null, null, '12', now() + interval '1 day', 'Pilot feedback: shorter window')`));
    ok('today’s rule is unchanged until it takes effect', Number((await act('postgres', null, `select private.num_param('cancellation_window_hours', 0) v`))[0].v) === 24, null);
    await err('the metrics are for staff', 'authenticated', G, `select public.pilot_metrics(null)`, /staff only/);
    const [{ pilot_metrics: pm }] = await step('staff read the pilot metrics', () => act('authenticated', F, `select public.pilot_metrics(null)`));
    await act('postgres', null, `insert into public.requests (requester_id, category, track, subject, goal, mode, matched_at, submitted_at)
      values ($1, 'school_academic', 'school', 'Chemistry', 'KCSE', 'online', now(), now() - interval '2 hours')`, [G]).catch(() => null);
    const [{ pilot_metrics_v2: pm2 }] = await act('authenticated', F, `select public.pilot_metrics_v2(null)`);
    const m2 = pm2.metrics.find((x) => x.id === 'M2');
    ok('M2 counts the same requests above and below the line', Number(m2.num) <= Number(m2.den), m2);
    ok('all seven decision metrics, each with its threshold', pm.metrics.length === 7 && pm.metrics.every((x) => typeof x.threshold === 'number'), pm.metrics.map((x) => x.id));
    const [tot] = await act('postgres', null, `select coalesce(sum(case when side = 'debit' then amount_kes else -amount_kes end), 0)::int d from public.ledger_entries`);
    ok('the whole ledger balances', tot.d === 0, tot.d);
  } catch (e) {
    if (!/^sprint 7:/.test(e?.message ?? '')) fail('sprint 7: flow stopped', e.message);
  }
}


// ---------------------------------------------------------------------------- sprint 8: hardening
async function checkHardening() {
  const L = 'd1111111-1111-1111-1111-111111111111';
  const L2 = 'd2222222-2222-2222-2222-222222222222';
  const T = 'd3333333-3333-3333-3333-333333333333';
  const F = 'd4444444-4444-4444-4444-444444444444';
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`hardening: ${name}`);
      return r;
    } catch (e) {
      fail(`hardening: ${name}`, e.message);
      throw e;
    }
  };
  const ok = (name, cond, detail) => (cond ? pass(`hardening: ${name}`) : fail(`hardening: ${name}`, JSON.stringify(detail)));
  const err = (name, role, sub, sql, pattern) => expectError(`hardening: ${name}`, role, sub, q(sql), pattern);
  // A staff call with explicit JWT claims (aal1 or aal2).
  const withAal = async (sub, aal, sql) => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated', aal })]);
    await db.exec('set role authenticated');
    try {
      return (await db.query(sql)).rows;
    } finally {
      await db.exec('reset role').catch(() => {});
    }
  };
  try {
    await act('postgres', null, `insert into auth.users (id, email, phone, raw_user_meta_data) values
      ($1, 'h1@koobi.test', '254711000041', '{"display_name": "Hana One"}'), ($2, 'h2@koobi.test', '254711000042', '{"display_name": "Hassan Two"}'),
      ($3, 'ht@koobi.test', '254722000043', '{"display_name": "Halima Teacher"}'), ($4, 'hf@koobi.test', null, '{"display_name": "Hilda Finance"}')`, [L, L2, T, F]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'learner'), ($2, 'learner'), ($3, 'teacher'), ($4, 'finance')`, [L, L2, T, F]);
    const [teacher] = await act('authenticated', T, `insert into public.teachers (user_id, slug, display_name) values ($1, 'halima-teacher', 'Halima Teacher') returning id`, [T]);

    // ---- price bands and snapshots
    await err('an offer outside the price band is refused', 'authenticated', T, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, language_codes)
      values ('${teacher.id}', 'Maths', 'x', 'school_academic', 'school', 'one_to_one', 'Maths', '{online}', 'google_meet', 60, 6000, '{en}')`, /between KES 500 and KES 5000/);
    const [bands] = await act('authenticated', T, `select public.price_bands() b`);
    ok('teachers can read the bands for the editor', bands.b.school.max === 5000 && bands.b.adults_professional.min === 700, bands);
    const [offer] = await act('postgres', null, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, trial_discount_pct, language_codes)
      values ($1, 'KCSE Physics', 'x', 'school_academic', 'school', 'one_to_one', 'Physics', '{online}', 'google_meet', 60, 1800, 50, '{en}') returning id`, [teacher.id]);
    for (const [tbl, id] of [['teachers', teacher.id], ['offerings', offer.id]]) {
      await act('postgres', null, `update public.${tbl} set listing_status = 'pending_review' where id = $1`, [id]);
      await act('postgres', null, `update public.${tbl} set listing_status = 'approved' where id = $1`, [id]);
    }
    const [snap] = await act('postgres', null, `select count(*)::int c, max(version) v, (array_agg(data ->> 'price_hour_kes'))[1] p from public.listing_snapshots where offering_id = $1`, [offer.id]);
    ok('approval keeps a snapshot of the offer as approved', snap.c === 1 && snap.v === 1 && snap.p === '1800', snap);
    const [l1] = await act('authenticated', L, `insert into public.learners (user_id, alias) values ($1, 'Hana') returning id`, [L]);
    const [l2] = await act('authenticated', L2, `insert into public.learners (user_id, alias) values ($1, 'Hassan') returning id`, [L2]);
    const book = (sub, learner, at) => act('authenticated', sub, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, 'single', 'online', ${at}, 'cancellation-2026-11-v1', now()) returning id, listing_snapshot_id`, [offer.id, learner]);
    const [b1] = await step('a learner books Thursday at the slot time', () => book(L, l1.id, `date_trunc('hour', now()) + interval '3 days'`));
    ok('the booking points at the approved snapshot', !!b1.listing_snapshot_id, b1);
    const seen = await act('authenticated', L, `select id from public.listing_snapshots where id = $1`, [b1.listing_snapshot_id]);
    const other = await act('authenticated', L2, `select id from public.listing_snapshots where id = $1`, [b1.listing_snapshot_id]);
    ok('the payer can read what they booked; another learner cannot', seen.length === 1 && other.length === 0, { seen, other });

    // ---- one trial per learner per offering
    const trial = (at) => act('authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ($1, $2, 'trial', 'online', ${at}, 'cancellation-2026-11-v1', now()) returning id`, [offer.id, l1.id]);
    const [t1] = await step('a first trial', () => trial(`date_trunc('hour', now()) + interval '8 days'`));
    await err('a second trial on the same offer is refused', 'authenticated', L, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ('${offer.id}', '${l1.id}', 'trial', 'online', date_trunc('hour', now()) + interval '9 days', 'cancellation-2026-11-v1', now())`, /already a trial/);
    const [{ trial_available: before }] = await act('authenticated', L, `select public.trial_available($1)`, [offer.id]);
    await act('authenticated', L, `update public.bookings set status = 'cancelled' where id = $1`, [t1.id]);
    const [{ trial_available: after }] = await act('authenticated', L, `select public.trial_available($1)`, [offer.id]);
    ok('an unpaid trial that was abandoned does not use it up', before === false && after === true, { before, after });

    // ---- double-booking
    await err('a second learner cannot take the same hour', 'authenticated', L2, `insert into public.bookings (offering_id, learner_id, kind, mode, starts_at, policy_version, policy_acknowledged_at)
      values ('${offer.id}', '${l2.id}', 'single', 'online', date_trunc('hour', now()) + interval '3 days' + interval '30 minutes', 'cancellation-2026-11-v1', now())`, /just taken/);
    await step('the next free hour is fine', () => book(L2, l2.id, `date_trunc('hour', now()) + interval '3 days' + interval '1 hour'`));

    // ---- booking states only through actions
    await act('authenticated', L, `update public.bookings set status = 'awaiting_payment' where id = $1`, [b1.id]);
    const [p1] = await act('authenticated', L, `insert into public.payments (booking_id, method) values ($1, 'mpesa_stk') returning id`, [b1.id]);
    await act('service_role', null, `select public.record_payment_success($1, 'ps_h_1', 0, null)`, [p1.id]);
    await err('a teacher cannot accept without the accept action (no link check)', 'authenticated', T, `update public.bookings set status = 'accepted' where id = '${b1.id}'`, /booking actions/);

    // ---- no direct writes to money and decisions
    await err('Finance cannot approve a payout by hand', 'authenticated', F, `update public.payouts set status = 'approved'`, /permission denied/);
    await err('Finance cannot approve a batch by hand', 'authenticated', F, `update public.payout_batches set status = 'approved'`, /permission denied/);
    await err('Finance cannot create a refund by hand', 'authenticated', F, `insert into public.refunds (payment_id, amount_kes, reason) values ('${p1.id}', 100, 'test')`, /permission denied/);
    await err('nobody edits a parameter in place', 'authenticated', F, `update public.parameters set value = '0.05' where key = 'commission_rate_trial'`, /permission denied/);
    await err('a payer cannot open a dispute without the action', 'authenticated', L, `insert into public.disputes (booking_id, type, description) values ('${b1.id}', 'quality', 'Testing direct insert')`, /permission denied/);

    // ---- abandoned checkouts
    const [b3] = await book(L, l1.id, `date_trunc('hour', now()) + interval '6 days'`);
    await act('postgres', null, `update public.bookings set created_at = now() - interval '25 hours' where id = $1`, [b3.id]);
    const [{ job_release_abandoned: freed }] = await step('the cleanup job runs', () => act('postgres', null, `select private.job_release_abandoned()`));
    const [st] = await act('postgres', null, `select status, cancellation_rule from public.bookings where id = $1`, [b3.id]);
    ok('an unpaid checkout older than a day frees the slot; paid ones stay', freed === 1 && st.status === 'cancelled'
      && (await act('postgres', null, `select status from public.bookings where id = $1`, [b1.id]))[0].status === 'paid', { freed, st });

    // ---- staff MFA in the database
    await act('postgres', null, `insert into public.parameters (key, value, effective_from, note) values ('staff_mfa_required', 'true', now(), 'production')`);
    const without = await withAal(F, 'aal1', `select public.has_role('finance') ok, public.is_staff() staff`);
    ok('with MFA required, a staff session without the second factor has no staff rights', without[0].ok === false && without[0].staff === false, without);
    let blocked = false;
    try {
      await db.exec('savepoint mfa');
      await withAal(F, 'aal1', `select public.pilot_metrics(null)`);
    } catch {
      blocked = true;
    } finally {
      await db.exec('rollback to savepoint mfa; release savepoint mfa');
    }
    ok('staff functions refuse it', blocked, null);
    const withMfa = await withAal(F, 'aal2', `select public.has_role('finance') ok, (public.pilot_metrics(null) -> 'metrics') is not null m`);
    ok('the same person with the second factor gets staff rights', withMfa[0].ok === true && withMfa[0].m === true, withMfa);
    const learnerAal1 = await withAal(L, 'aal1', `select public.has_role('learner') ok`);
    ok('learners and teachers are not affected', learnerAal1[0].ok === true, learnerAal1);
  } catch (e) {
    if (!/^hardening:/.test(e?.message ?? '')) fail('hardening: flow stopped', e.message);
  }
}
