# Koobi

A managed learning marketplace for Kenya: teachers, professionals and practitioners teach what they have done; learners and guardians book and pay by M-Pesa; money is held until the lesson happens.

Specs live one folder up: `../PRD.md` (v0.3), `../design/PAGES.md`, `../brand/BRAND.md`, `../PLAN.md`, and the one-page build plan `../Koobi-Build-Plan.pdf`.

## Stack

Next.js 16 (App Router, Cache Components, TypeScript) on Vercel · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Cron, Edge Functions) · Cloudflare in front · Paystack, Africa's Talking, WhatsApp Cloud API, Resend, Smile ID or Didit behind adapters (from sprint 3).

## Run it

```bash
npm install
npm run dev
```

Without Supabase keys the app runs on **dev fixtures**: sample people and offers from the design canvases, marked by a dark bar at the top of every page. Signed-in screens open without sign-in in this mode. Production never shows fixtures; without a database it shows empty states.

To connect Supabase, copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then apply `supabase/migrations` and `supabase/seed.sql` (see `supabase/README.md`). Phone sign-in needs an SMS provider in Supabase Auth (or the send-SMS hook routed to Africa's Talking).

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | Lint, type-check, unit tests |
| `npm run db:check` | Applies every migration to an in-process Postgres (PGlite) and runs RLS and ledger assertions |
| `npm run build` | Production build; fails if a page reads request data outside `<Suspense>` |

## Layout

```
src/app/(site)/        public pages, Chora (Kalam loaded here only)
src/app/(auth)/        phone sign-in, code, welcome
src/app/(app)/         learner and guardian, Wazi rules
src/app/teach/         teacher and expert
src/app/staff/         staff console (login outside the console group)
src/app/(planned)/     placeholder for planned root routes; unknown paths 404
src/app/dev/pages      page map: every screen, its sprint and status
src/domain/            pure TypeScript: taxonomy, money and dates, commission, ledger, listing state machine
src/lib/               Supabase clients, auth guard, catalogue reads (+ dev fixtures)
src/config/            brand name variable, page registry (109 screens), navigation
supabase/              SQL migrations, seed, README
```

## Rules the code keeps

- **Name is a variable.** `src/config/brand.ts`; nothing else hard-codes "Koobi".
- **Chora on public pages, Wazi rules on signed-in screens** (`.app` scope: no hand lettering, 17px body).
- **One filled orange action per screen.** M-Pesa green only on the pay button. Every number in DM Mono.
- **Nothing fabricated.** Ratings, reviews, prices, badges come only from stored records; ratings show only from three reviews; CI fails on hard-coded ratings in pages.
- **Badges** show passed checks only, always with the date. Phone numbers never appear on cards or profiles.
- **Never** "tutor"; never "holiday tuition" (CI content lint).
- **Money** is whole KES; the ledger is double-entry and balanced in code and in the database. The IDEA §7 worked example is a unit test.
- **Cache Components:** request data (`cookies`, `params`, `searchParams`, `usePathname`) is read inside `<Suspense>`; catalogue reads use `"use cache"` with tags.

## Branches

All work happens on `dev`. `main` is production. Create the GitHub repository, then:

```bash
git remote add origin git@github.com:<org>/koobi.git
git push -u origin dev
```
