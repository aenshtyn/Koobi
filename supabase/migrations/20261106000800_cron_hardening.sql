-- Koobi sprint 8 schedule (pg_cron; skipped by the PGlite validator because of the file name).
--   koobi-release-abandoned   hourly at :20   unpaid checkouts and packages older than 24 hours free their slot
do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; sprint 8 schedule not installed';
    return;
  end if;
  perform cron.schedule('koobi-release-abandoned', '20 * * * *', 'select private.job_release_abandoned()');
end
$cron$;
