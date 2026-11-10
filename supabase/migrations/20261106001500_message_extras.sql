-- Koobi: the rest of Messages (T22): who is online, read ticks, and files.
--
-- 1. Presence: the app notes when a signed-in person was last on Koobi. Only the other side of a
--    conversation is shown it.
-- 2. Read ticks use messages.read_at, which already exists; nothing to add.
-- 3. Files: one file per message (JPG, PNG or PDF), kept in a private bucket. A file could carry a
--    phone number past the filter that hides contact details, so files are allowed only once the pair's
--    first paid booking has shared their numbers (FR-MSG-2).

alter table public.profiles add column last_seen_at timestamptz;

create or replace function public.touch_presence()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles
     set last_seen_at = now()
   where id = (select auth.uid())
     and (last_seen_at is null or last_seen_at < now() - interval '45 seconds')
$$;
revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated, service_role;

create or replace function public.thread_details(p_thread uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'started_at', th.created_at,
           -- When the other side of a pair was last on Koobi, for "online" beside their name.
           'other_last_seen_at', (select p.last_seen_at from public.thread_participants other
                                    join public.profiles p on p.id = other.user_id
                                   where other.thread_id = th.id and other.user_id <> me.user_id and other.role <> 'staff'
                                   order by p.last_seen_at desc nulls last limit 1),
           'offering', case when o.id is null then null else
             jsonb_build_object('id', o.id, 'title', o.title, 'slug', o.slug, 'format', o.format,
                                'published', o.listing_status = 'approved') end,
           'bookings', coalesce((
             select jsonb_agg(jsonb_build_object('id', b.id, 'title', bo.title, 'kind', b.kind, 'status', b.status,
                                                 'starts_at', b.starts_at) order by b.starts_at desc)
               from public.bookings b
               join public.offerings bo on bo.id = b.offering_id
               join public.teachers bt on bt.id = b.teacher_id
              where b.booked_by_user_id = payer.user_id
                and bt.user_id = teacher.user_id
                and b.status not in ('requested', 'awaiting_payment')), '[]'::jsonb))
    from public.thread_participants me
    join public.message_threads th on th.id = me.thread_id
    left join public.matches m on m.id = th.match_id
    left join public.offerings o on o.id = m.offering_id
    left join public.thread_participants payer on payer.thread_id = th.id and payer.role = 'payer'
    left join public.thread_participants teacher on teacher.thread_id = th.id and teacher.role = 'teacher'
   where me.thread_id = p_thread and me.user_id = (select auth.uid())
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- Files in messages
-- ---------------------------------------------------------------------------
alter table public.messages add column attachment_name text check (char_length(attachment_name) between 1 and 120);
grant insert (attachment_name) on public.messages to authenticated;

create or replace function private.messages_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  th public.message_threads%rowtype;
begin
  if new.attachment_key is null then
    new.attachment_name := null;
    return new;
  end if;
  select * into th from public.message_threads where id = new.thread_id;
  if th.kind = 'pair' and th.contact_revealed_at is null then
    raise exception 'files can be shared after the first paid booking between you' using errcode = 'check_violation';
  end if;
  if new.attachment_key !~ ('^thread/' || new.thread_id::text || '/[0-9a-f-]{36}\.(jpg|png|pdf)$') then
    raise exception 'that file does not belong to this conversation' using errcode = 'check_violation';
  end if;
  if new.attachment_name is null then
    raise exception 'the file needs a name' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger messages_06_attachment before insert on public.messages
  for each row execute function private.messages_attachment();
revoke all on function private.messages_attachment() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public) values ('messages', 'messages', false)
    on conflict (id) do nothing;
  end if;
end
$$;
