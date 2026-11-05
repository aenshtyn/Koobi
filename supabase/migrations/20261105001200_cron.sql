-- Koobi 1200: job schedules (pg_cron). Applies only where pg_cron is available (hosted Supabase);
-- elsewhere it is a no-op, and scripts/check-migrations.mjs skips it. pg_cron runs in UTC:
-- Africa/Nairobi is UTC+3 with no daylight saving.

do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; job schedules not installed';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;

  -- cron.schedule(name, ...) replaces an existing job with the same name, so re-running is safe.
  perform cron.schedule('koobi-outbox-relay',          '* * * * *',    'select private.job_outbox_relay()');
  perform cron.schedule('koobi-lapse-unanswered',      '*/5 * * * *',  'select private.job_lapse_unanswered_bookings()');
  perform cron.schedule('koobi-auto-confirm',          '*/15 * * * *', 'select private.job_auto_confirm()');
  perform cron.schedule('koobi-weekly-payout-batch',   '0 3 * * 5',    'select private.job_weekly_payout_batch()');   -- Friday 06:00 EAT
  perform cron.schedule('koobi-daily-reconciliation',  '0 23 * * *',   'select private.job_daily_reconciliation()');  -- 02:00 EAT
  perform cron.schedule('koobi-release-waitlist',      '5 21 * * *',   'select private.job_release_waitlist()');      -- 00:05 EAT
end
$cron$;
