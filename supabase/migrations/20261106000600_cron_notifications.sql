-- Koobi sprint 7 schedules (pg_cron; skipped by the PGlite validator because of the file name).
--   koobi-scheduled-notifications  every 10 minutes  reminders, note reminders, renewal prompts
--   koobi-expire-packages          daily 00:15 EAT   unused package lessons become credit
--   koobi-dispatch-notifications   every minute      asks the app to send queued SMS, WhatsApp and email
--
-- The dispatcher call needs two Vault secrets (Dashboard > Project Settings > Vault):
--   koobi_dispatch_url    https://<your-domain>/api/notifications/dispatch
--   koobi_cron_secret     the same value as CRON_SECRET in the app's environment
-- Until both exist the job does nothing.
do $ext$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise notice 'pg_net is not available; the dispatcher call will not be scheduled';
  end if;
end
$ext$;

create or replace function private.job_dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.notifications where status = 'queued' and channel in ('sms', 'whatsapp', 'email')) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'koobi_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'koobi_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
                        body := '{}'::jsonb, timeout_milliseconds := 20000);
end
$$;
revoke all on function private.job_dispatch_notifications() from public, anon, authenticated;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; sprint 7 schedules not installed';
    return;
  end if;
  perform cron.schedule('koobi-scheduled-notifications', '*/10 * * * *', 'select private.job_scheduled_notifications()');
  perform cron.schedule('koobi-expire-packages',         '15 21 * * *',  'select private.job_expire_packages()');  -- 00:15 EAT
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('koobi-dispatch-notifications', '* * * * *', 'select private.job_dispatch_notifications()');
  end if;
end
$cron$;
