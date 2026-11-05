# Koobi launch checklist

The controlled launch from PLAN.md sprint 8: pilot families and experts move onto the app, only proven
offers are promoted, and the seven decision metrics are read weekly. `/staff/readiness` (admin) checks the
configuration and database items live; this file covers the rest and the order to do them in.

## 1. Before anyone pays

Legal and company (IDEA §12 pre-conditions):

- [ ] Written legal opinion on Basic Education Act s.37 and the TSC code of conduct.
- [ ] Company registered, KRA PIN issued; VAT position decided (`vat_registered` parameter).
- [ ] ODPC registration started; privacy notice and parental consent text reviewed by counsel.
- [ ] Teacher agreement, parent terms, cancellation and refund rules, safeguarding policy signed off.
      Publish each as a new `policy_versions` row; never edit a published version.

Payments:

- [ ] Paystack live account with M-Pesa collection and transfers to M-Pesa enabled.
- [ ] Webhook URL in the Paystack dashboard: `https://<domain>/api/webhooks/paystack`.
- [ ] One real end-to-end test: a KES 10 payment, a refund, and a test payout to a staff number.

## 2. Production project

Supabase (production project, separate from `koobi-dev`):

- [ ] `npx supabase db push --remote` with every migration; seed only the reference data (`supabase/seed.sql`).
- [ ] Auth → Phone sign-in on, with the live SMS provider; staff MFA (TOTP) on.
- [ ] Vault secrets `koobi_dispatch_url` (`https://<domain>/api/notifications/dispatch`) and `koobi_cron_secret`.
- [ ] Check the schedules exist: `select jobname, schedule from cron.job;` (outbox relay, lapse, auto-confirm,
      weekly payout batch, daily reconciliation, waitlist release, scheduled notifications, package expiry,
      notification dispatch, abandoned checkouts).
- [ ] Parameters → add `staff_mfa_required = true`, effective at launch.
- [ ] Storage bucket `verification` exists and is private.

Vercel (production environment variables; server-only unless prefixed `NEXT_PUBLIC_`):

- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- [ ] `PAYSTACK_SECRET_KEY` (live), `PAYSTACK_EMAIL_DOMAIN`
- [ ] `KOOBI_FIELD_KEY` (`openssl rand -base64 32`; store a copy offline: losing it loses KRA PINs and payout numbers)
- [ ] `CRON_SECRET`, `KOOBI_APP_URL`
- [ ] `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`, `AFRICASTALKING_SENDER_ID`
- [ ] `RESEND_API_KEY`, `EMAIL_FROM`; WhatsApp keys only once templates are approved by Meta
- [ ] `KOOBI_TEST_LOGINS` **not set**

Domain:

- [ ] DNS on Cloudflare, proxied, HTTPS only; Vercel domain verified; `koobi.co.ke` and `www` redirect.

## 3. Staff and supply

- [ ] At least one concierge, one reviewer, and two people who can approve payouts (Finance or Admin).
- [ ] 15 to 20 teachers verified to tier 4 on the pilot track (tier 3 for anyone meeting children in person),
      each with a proven payout number and KRA PIN.
- [ ] Founding members on the other tracks waitlisted with a `marketing_start_date`.

## 4. Launch week

- [ ] `/staff/readiness` shows no open items.
- [ ] Invite the first 10 families; watch `/staff/requests` (24-hour shortlist, 48-hour match).
- [ ] Daily: reconciliation passed (`/staff/reconciliation`), no dead outbox events, disputes inside their timers.
- [ ] Friday: build, double-approve and send the first payout batch; check statements reached teachers.
- [ ] Weekly: read `/staff/reports/pilot` against the thresholds.

## 5. If something goes wrong

- Stop new payments: remove `PAYSTACK_SECRET_KEY` from Vercel and redeploy (checkout then says payments are off).
- Stop payouts: do not approve the batch; a failed reconciliation also blocks it automatically.
- Hide a teacher: `/staff/teachers` → Suspend (offers disappear at once).
- Every money movement is in the ledger and every sensitive action in `/staff/audit`.

## Tests

- `npm run check` (lint, types, unit tests, database checks) runs in CI on every push.
- `npm run e2e` against the test deployment: `E2E_BASE_URL=… KOOBI_TEST_PASSWORD=… npm run e2e`
  after `npx playwright install chromium`. Never against production.
