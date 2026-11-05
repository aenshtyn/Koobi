-- Koobi 0200: managed taxonomy (FR-OFF-1) and configuration (dated parameters, feature flags,
-- policy versions, FX reference rates; §6.4 rule 4). Values are seeded by supabase/seed.sql.
-- Every taxonomy table has code, label, label_sw (optional), sort_order, is_active, and
-- parent/scope columns where hierarchical.

create table public.tracks (
  code        text primary key check (code ~ '^[a-z0-9_]+$'),
  label       text not null,
  label_sw    text,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.tracks is 'Internal tracks: school, adults_professional, practical (IDEA §4). Drive verification ladders, guardian rules and rates.';

create table public.categories (
  code          text primary key check (code ~ '^[a-z0-9_]+$'),
  label         text not null,
  label_sw      text,
  description   text,
  default_track text references public.tracks (code),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.categories is 'The four public categories used in navigation and on every card (PRD §1.1).';

create table public.category_tracks (
  category_code text not null references public.categories (code) on update cascade on delete cascade,
  track_code    text not null references public.tracks (code) on update cascade,
  primary key (category_code, track_code)
);
comment on table public.category_tracks is 'Which internal tracks each public category allows (PRD §1.1 table).';

alter table public.categories
  add constraint categories_default_track_allowed
  foreign key (code, default_track) references public.category_tracks (category_code, track_code);

create table public.formats (
  code        text primary key check (code ~ '^[a-z0-9_]+$'),
  label       text not null,
  label_sw    text,
  description text,
  price_basis text not null check (price_basis in ('session', 'seat', 'programme', 'visit')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.modes (
  code         text primary key check (code ~ '^[a-z0-9_]+$'),
  label        text not null,
  label_sw     text,
  is_in_person boolean not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.curricula (
  code       text primary key check (code ~ '^[a-z0-9_]+$'),
  label      text not null,
  label_sw   text,
  sunset_on  date,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.levels (
  code           text primary key check (code ~ '^[a-z0-9_]+$'),
  label          text not null,
  label_sw       text,
  curriculum_code text references public.curricula (code),
  parent_code    text references public.levels (code),
  sunset_on      date,  -- sunset flag: retired without deletion (FR-OFF-1, 8-4-4 Forms until 2027)
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.subjects (
  code       text primary key check (code ~ '^[a-z0-9_]+$'),
  label      text not null,
  label_sw   text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exams (
  code            text primary key check (code ~ '^[a-z0-9_]+$'),
  label           text not null,
  label_sw        text,
  curriculum_code text references public.curricula (code),
  sunset_on       date,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.practical_domains (
  code        text primary key check (code ~ '^[a-z0-9_]+$'),
  label       text not null,
  label_sw    text,
  parent_code text references public.practical_domains (code),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.counties (
  code       text primary key check (code ~ '^[a-z0-9_]+$'),
  label      text not null,
  number     smallint unique check (number between 1 and 47),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sub_counties (
  code        text primary key check (code ~ '^[a-z0-9_]+$'),
  label       text not null,
  county_code text not null references public.counties (code),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.estates (
  code            text primary key check (code ~ '^[a-z0-9_]+$'),
  label           text not null,
  county_code     text not null references public.counties (code),
  sub_county_code text references public.sub_counties (code),
  centroid_lat    numeric(9, 6) check (centroid_lat between -5 and 5),
  centroid_lng    numeric(9, 6) check (centroid_lng between 33 and 42),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.languages (
  code       text primary key check (code ~ '^[a-z0-9_]+$'),
  label      text not null,
  label_sw   text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.special_needs (
  code       text primary key check (code ~ '^[a-z0-9_]+$'),
  label      text not null,
  label_sw   text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Verification check types and the badge each one earns when passed (FR-VER-9).
create table public.check_types (
  code         text primary key check (code ~ '^[a-z0-9_]+$'),
  label        text not null,
  badge_label  text,  -- null: the check earns no public badge (e.g. payout ownership)
  default_tier smallint not null check (default_tier between 1 and 5),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['tracks', 'categories', 'formats', 'modes', 'curricula', 'levels', 'subjects', 'exams',
                           'practical_domains', 'counties', 'sub_counties', 'estates', 'languages', 'special_needs',
                           'check_types']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Dated parameters (§6.4 rule 4). Rows are never edited once in force: add a new row with a later
-- effective_from. The most specific (track, format, mode) match wins, then the latest effective_from.
-- Scalar values are stored as JSON scalars (e.g. 3, 0.05, false); structured values as objects.
-- ---------------------------------------------------------------------------
create table public.parameters (
  id             uuid primary key default gen_random_uuid(),
  key            text not null check (key ~ '^[a-z0-9_]+$'),
  track          text references public.tracks (code),
  format         text references public.formats (code),
  mode           text references public.modes (code),
  value          jsonb not null,
  effective_from timestamptz not null,
  note           text,
  set_by         uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  constraint parameters_scope_unique unique nulls not distinct (key, track, format, mode, effective_from)
);
create index parameters_lookup_idx on public.parameters (key, effective_from desc);

create or replace function private.protect_parameters()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.effective_from <= now() then
    raise exception 'parameter % is in force since %; add a new row with a later effective_from instead',
      old.key, old.effective_from using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
create trigger parameters_protect before update or delete on public.parameters
  for each row execute function private.protect_parameters();

create or replace function private.param(
  p_key text, p_track text default null, p_format text default null, p_mode text default null,
  p_at timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select p.value
    from public.parameters p
   where p.key = p_key
     and p.effective_from <= p_at
     and (p.track is null or p.track = p_track)
     and (p.format is null or p.format = p_format)
     and (p.mode is null or p.mode = p_mode)
   order by (p.track is not null)::int + (p.format is not null)::int + (p.mode is not null)::int desc,
            p.effective_from desc
   limit 1
$$;

create table public.feature_flags (
  id             uuid primary key default gen_random_uuid(),
  key            text not null check (key ~ '^[a-z0-9_]+$'),
  track          text references public.tracks (code),
  enabled        boolean not null default false,
  description    text,
  effective_from timestamptz not null default now(),
  set_by         uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint feature_flags_scope_unique unique nulls not distinct (key, track)
);
create trigger feature_flags_updated_at before update on public.feature_flags
  for each row execute function private.set_updated_at();

-- Cancellation/refund terms and consent texts shown before checkout (FR-BOOK-8). Written by the
-- founders; never seeded with placeholder text.
create table public.policy_versions (
  version        text primary key,
  kind           text not null check (kind in ('cancellation_refund', 'terms', 'privacy', 'parental_consent', 'employment_declaration')),
  body           text not null,
  effective_from timestamptz not null,
  created_at     timestamptz not null default now()
);

create table public.fx_rates (
  rate_date      date not null,
  currency       text not null default 'USD' check (currency in ('USD')),
  reference_rate numeric(14, 6) not null check (reference_rate > 0),  -- KES per 1 unit
  source         text not null,
  created_at     timestamptz not null default now(),
  primary key (rate_date, currency)
);
