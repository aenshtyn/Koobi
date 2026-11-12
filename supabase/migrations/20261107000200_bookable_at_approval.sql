-- Koobi: an approved expert can be booked before the payout number is proven (decided 2026-11-12).
--
-- Before: bookable needed the identity check AND a payout number proven by a test payout.
-- Now: bookable needs the identity check only, which an approved application records. The payout
-- number and the KRA PIN are still needed before money leaves Koobi: the weekly payout batch holds
-- back any expert without them ("Payout number not verified", "KRA PIN missing") and what they
-- earned stays owed to them until the next batch after they add it. Nothing else about tiers changes.
create or replace function private.recompute_tiers(p_teacher uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r      record;
  v_tier smallint;
  v_gate boolean;
  t      public.teachers%rowtype;
begin
  insert into public.teacher_tracks (teacher_id, track)
  select distinct p_teacher, o.track from public.offerings o where o.teacher_id = p_teacher
  on conflict (teacher_id, track) do nothing;
  -- An expert approved before creating anything still needs a track for the identity tier to sit on:
  -- the one behind their primary category.
  if not exists (select 1 from public.teacher_tracks tt where tt.teacher_id = p_teacher) then
    insert into public.teacher_tracks (teacher_id, track)
    select p_teacher, ct.track_code
      from public.teachers tc
      join public.category_tracks ct on ct.category_code = tc.primary_category
     where tc.id = p_teacher
     order by (ct.track_code = 'adults_professional') desc, ct.track_code
     limit 1
    on conflict (teacher_id, track) do nothing;
  end if;

  for r in select tt.track from public.teacher_tracks tt where tt.teacher_id = p_teacher loop
    v_tier := 0;
    for k in 1..5 loop
      exit when not exists (
        select 1 from public.verification_checks vc
          join public.check_types ct on ct.code = vc.check_type
         where vc.teacher_id = p_teacher and vc.status = 'passed' and vc.badge_suspended_at is null
           and (vc.expires_at is null or vc.expires_at > now())
           and ct.default_tier = k and (vc.track is null or vc.track = r.track)
           and (k <> 1 or vc.check_type = 'identity_iprs'));
      v_tier := k;
    end loop;
    update public.teacher_tracks set tier = v_tier where teacher_id = p_teacher and track = r.track and tier <> v_tier;
  end loop;

  select * into t from public.teachers where id = p_teacher;
  v_gate := exists (select 1 from public.teacher_tracks tt where tt.teacher_id = p_teacher and tt.tier >= 1);
  if v_gate and t.status = 'applied' then
    update public.teachers set status = 'bookable' where id = p_teacher;
  elsif not v_gate and t.status = 'bookable' then
    update public.teachers set status = 'applied' where id = p_teacher;
  end if;
end
$$;
revoke all on function private.recompute_tiers(uuid) from public, anon, authenticated;

update public.state_transitions set description = 'identity verified on at least one track'
 where machine = 'teacher_status' and from_state = 'applied' and to_state = 'bookable';
update public.state_transitions set description = 'identity check lost or expired'
 where machine = 'teacher_status' and from_state = 'bookable' and to_state = 'applied';

-- Experts whose identity is already verified become bookable now.
do $$
declare
  r record;
begin
  for r in select id from public.teachers where status = 'applied' loop
    perform private.recompute_tiers(r.id);
  end loop;
end
$$;
