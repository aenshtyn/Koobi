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
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
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
  }, /not allowed for this caller/);
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
  await expectOk('verification_checks: a teacher cannot pass their own check (no row updated)', 'authenticated', U.teacher,
    q(`update public.verification_checks set status = 'passed' where check_type = 'good_conduct' returning id`),
    (r) => (r.rows.length === 0 ? null : 'check updated by its teacher'));

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
    await db.exec('reset role');
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
      q(`update public.bookings set status = 'paid' where id = '${trial.id}'`), /not allowed/);
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
