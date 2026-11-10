-- Koobi: what a conversation is about, for the details pane beside a thread (expert Messages, T22).
--
-- A participant cannot read the other participants of a thread, so the app cannot work out which
-- bookings belong to the pair. This returns, for one of the caller's threads: when it started, the
-- learning experience it was opened for, and the pair's bookings (paid ones only, like the booking lists).

create or replace function public.thread_details(p_thread uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'started_at', th.created_at,
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
revoke all on function public.thread_details(uuid) from public, anon;
grant execute on function public.thread_details(uuid) to authenticated, service_role;
