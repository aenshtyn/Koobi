# Koobi database

Postgres schema for Supabase, from PRD §2.2, §4, §6.4, §7 and §8.

## Modules

| Migration | Contents |
|---|---|
| `0100_foundation` | `profiles` (created by a trigger on `auth.users`), `user_roles`, `has_role()`, `has_any_role()`, `is_staff()`, `my_roles()`, `claim_role()`; the state-machine guard (`state_transitions`, `state_history`); `outbox`; `audit_log` |
| `0200_taxonomy_config` | tracks, categories, category_tracks, formats, modes, curricula, levels, subjects, exams, practical_domains, counties, sub_counties, estates, languages, special_needs, check_types; `parameters` (dated), `feature_flags`, `policy_versions`, `fx_rates` |
| `0300_people` | guardians, learners, consents, teachers, teacher_tracks (tier and waitlist per track), locations, verification_checks, verification_documents, staff_time_log |
| `0400_offerings` | offerings, availability_windows, runs, run_waiting_list |
| `0500_matching` | requests, matches, shortlists, shortlist_entries, teacher_applications |
| `0600_bookings` | packages, bookings, sessions, attendance, lesson_notes; prices are set by the server |
| `0700_money` | payments, provider_events, ledger (double-entry, append-only, balanced at commit), payouts, payout_lines, refunds, reconciliation_runs |
| `0800_trust_comms` | reviews (confirmed bookings only), disputes, message threads and messages, notifications |
| `0900_rls` | privileges and row-level security for the §2.2 matrix |
| `1000_public_read` | `explore_offers`, `offer_details`, `public_teachers`, `public_reviews`, plus signed-in views |
| `1100_jobs` | job bodies: outbox relay, response-window lapses, auto-confirm, payout batch, reconciliation, waitlist release |
| `1200_cron` | pg_cron schedules; does nothing where pg_cron is missing |

Rules that hold across modules:

- **State machines.** Every state column is an enum, guarded by `private.enforce_transition`. The trigger refuses moves that are not in `state_transitions` and moves the caller's roles may not make. It writes `state_history` and an outbox event (`<machine>.<state>`) in the same transaction. Moves that change held money are `system` only.
- **Privileges.** Column grants keep derived fields (prices, tiers, ledger state, caches) out of clients' reach. `anon` reads only taxonomy, `policy_versions` and the public views.
- **Ledger.** Corrections are reversing journals approved by two staff members.

## Apply

```sh
supabase db reset                       # local: migrations, then seed.sql
supabase db push && psql "$DB_URL" -f supabase/seed.sql   # hosted
```

## Check

```sh
node scripts/check-migrations.mjs
```

This runs the migrations and the seed in PGlite, with stubs for the Supabase roles and `auth`, then checks RLS, contracts, state machines, the ledger and visibility. It exits 1 on any failure. The cron migration is skipped because PGlite has no pg_cron.

## Open questions

1. **Edits to approved listings.** Editing an approved listing moves it `approved → draft`, which hides it. The PRD wants the approved version to stay live until the edit is re-approved, which needs a snapshot table.
2. **Tier gates.** The tier gates for submitting and booking (FR-VER-1) are not enforced in the database yet. They are parameters to add.
3. **Price limits.** The price floors and ceilings per segment (FR-OFF-3) are not enforced either.
4. **Request field values.** Request `subject`, `level`, `county` and `estate` are free text. The concierge maps them to `*_code` at triage. `mode` must be a `modes.code`.
5. **Commission rates.** The 10% rate applies only inside the managed plan (an assumption). Seats are at a flat 20% pending a seat rate.
6. **Withholding.** Withholding is 5% from 1 Nov 2026, but enforcement is unverified. Finance should confirm the date.
7. **Security-definer views.** The Supabase linter flags them by design: the public views are owner-rights views.
8. **Phone-read logging.** Logging every staff read of a phone number (§2.2) needs an API path; RLS cannot log reads.
9. **Not in this pass.** `analytics_event`, `device`, `otp_attempt` and `incident`.
