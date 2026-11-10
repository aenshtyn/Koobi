-- Koobi group runs schedule (pg_cron; skipped by the PGlite validator because of the file name).
--   koobi-run-cutoff   every 10 minutes   at a group's cut-off: confirm it if the minimum is met, else cancel and credit
do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; group runs schedule not installed';
    return;
  end if;
  perform cron.schedule('koobi-run-cutoff', '*/10 * * * *', 'select private.job_run_cutoff()');
end
$cron$;
