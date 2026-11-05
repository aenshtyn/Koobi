-- Koobi seed: taxonomy and dated parameters only.
-- Nothing fabricated (PRD §6.4 rule 10): no people, offers, prices of offers, ratings or reviews.
-- Idempotent: re-running updates labels and leaves parameters already in force untouched.

-- ---------------------------------------------------------------------------
-- Tracks (internal), categories (public) and which tracks each category allows (PRD §1.1)
-- ---------------------------------------------------------------------------
insert into public.tracks (code, label, label_sw, description, sort_order) values
  ('school',              'School',                   'Shule', 'Children''s learning bought by a parent or guardian: CBC, 8-4-4, KCSE and IGCSE.', 1),
  ('adults_professional', 'Adults and professionals', 'Kazi',  'Adults learning for themselves: professional exams, languages and work skills.',  2),
  ('practical',           'Practical knowledge',      'Ujuzi', 'Learning from people who have done the work: farming, trades and small business.', 3)
on conflict (code) do update set label = excluded.label, label_sw = excluded.label_sw,
  description = excluded.description, sort_order = excluded.sort_order;

insert into public.categories (code, label, description, sort_order) values
  ('career_professional_growth', 'Career and professional growth', 'Communication, interviews, workplace English and leadership.', 1),
  ('business_entrepreneurship',  'Business and entrepreneurship',  'Marketing, sales, bookkeeping and running a small business.',     2),
  ('school_academic',            'School and academic subjects',   'CBC, KCSE and IGCSE subjects, exam preparation and university courses.', 3),
  ('digital_practical_skills',   'Digital and practical skills',   'Excel, design, coding, and hands-on trades and farming.',         4)
on conflict (code) do update set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order;

insert into public.category_tracks (category_code, track_code) values
  ('career_professional_growth', 'adults_professional'),
  ('business_entrepreneurship',  'adults_professional'),
  ('business_entrepreneurship',  'practical'),
  ('school_academic',            'school'),
  ('digital_practical_skills',   'practical'),
  ('digital_practical_skills',   'adults_professional')
on conflict do nothing;

update public.categories c set default_track = d.track
  from (values ('career_professional_growth', 'adults_professional'),
               ('business_entrepreneurship',  'adults_professional'),
               ('school_academic',            'school'),
               ('digital_practical_skills',   'practical')) as d(category, track)
 where c.code = d.category;

-- ---------------------------------------------------------------------------
-- Formats with price basis, and modes
-- ---------------------------------------------------------------------------
insert into public.formats (code, label, description, price_basis, sort_order) values
  ('one_to_one',  'One-to-one',  'One teacher, one learner; priced per session.',                 'session',   1),
  ('small_group', 'Group class', 'A small group meeting regularly; priced per seat per session.', 'seat',      2),
  ('cohort',      'Programme',   'A cohort or short course over several sessions; priced per seat for the whole programme.', 'programme', 3),
  ('workshop',    'Workshop',    'A single session for a group; priced per seat.',                'seat',      4),
  ('site_visit',  'Site visit',  'Learning at the practitioner''s farm, workshop or business; priced per visit.', 'visit', 5)
on conflict (code) do update set label = excluded.label, description = excluded.description,
  price_basis = excluded.price_basis, sort_order = excluded.sort_order;

insert into public.modes (code, label, label_sw, is_in_person, sort_order) values
  ('online',           'Online',                    'Mtandaoni', false, 1),
  ('in_home',          'At the learner''s home',    null,        true,  2),
  ('teacher_premises', 'At the teacher''s premises', null,       true,  3),
  ('hybrid',           'Online and in person',      null,        true,  4),
  ('site',             'On site',                   null,        true,  5)
on conflict (code) do update set label = excluded.label, label_sw = excluded.label_sw,
  is_in_person = excluded.is_in_person, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Curricula, levels (8-4-4 Forms carry a 2027 sunset), exams, subjects
-- ---------------------------------------------------------------------------
insert into public.curricula (code, label, sunset_on, sort_order) values
  ('cbc',             'CBC/CBE',         null,         1),
  ('eight_four_four', '8-4-4',           '2027-12-31', 2),
  ('igcse',           'IGCSE/Cambridge', null,         3)
on conflict (code) do update set label = excluded.label, sunset_on = excluded.sunset_on, sort_order = excluded.sort_order;

insert into public.levels (code, label, curriculum_code, sunset_on, sort_order) values
  ('pre_primary',   'Pre-primary (PP1 to PP2)',        'cbc',             null,         1),
  ('lower_primary', 'Lower primary (Grades 1 to 3)',   'cbc',             null,         2),
  ('upper_primary', 'Upper primary (Grades 4 to 6)',   'cbc',             null,         3),
  ('junior_school', 'Junior school (Grades 7 to 9)',   'cbc',             null,         4),
  ('senior_school', 'Senior school (Grades 10 to 12)', 'cbc',             null,         5),
  ('form_1',        'Form 1',                          'eight_four_four', '2027-12-31', 6),
  ('form_2',        'Form 2',                          'eight_four_four', '2027-12-31', 7),
  ('form_3',        'Form 3',                          'eight_four_four', '2027-12-31', 8),
  ('form_4',        'Form 4',                          'eight_four_four', '2027-12-31', 9),
  ('igcse_years',   'IGCSE (Years 10 and 11)',         'igcse',           null,         10),
  ('university',    'University',                      null,              null,         11),
  ('professional',  'Professional',                    null,              null,         12),
  ('adult',         'Adult',                           null,              null,         13)
on conflict (code) do update set label = excluded.label, curriculum_code = excluded.curriculum_code,
  sunset_on = excluded.sunset_on, sort_order = excluded.sort_order;

insert into public.exams (code, label, curriculum_code, sunset_on, sort_order) values
  ('kpsea', 'KPSEA', 'cbc',             null,         1),
  ('kjsea', 'KJSEA', 'cbc',             null,         2),
  ('kcse',  'KCSE',  'eight_four_four', '2027-12-31', 3),
  ('igcse', 'IGCSE', 'igcse',           null,         4)
on conflict (code) do update set label = excluded.label, curriculum_code = excluded.curriculum_code,
  sunset_on = excluded.sunset_on, sort_order = excluded.sort_order;

insert into public.subjects (code, label, sort_order) values
  ('mathematics',        'Mathematics',        1),
  ('english',            'English',            2),
  ('kiswahili',          'Kiswahili',          3),
  ('integrated_science', 'Integrated Science', 4),
  ('biology',            'Biology',            5),
  ('chemistry',          'Chemistry',          6),
  ('physics',            'Physics',            7),
  ('geography',          'Geography',          8),
  ('history',            'History',            9),
  ('business_studies',   'Business Studies',   10),
  ('agriculture',        'Agriculture',        11),
  ('computer_science',   'Computer Science',   12),
  ('french',             'French',             13)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Practical domains (FR-OFF-1; sub-domains are an assumption, extended by Admin)
-- ---------------------------------------------------------------------------
insert into public.practical_domains (code, label, parent_code, sort_order) values
  ('agriculture_livestock', 'Agriculture and livestock', null, 1),
  ('agribusiness',          'Agribusiness',              null, 2),
  ('trades',                'Trades',                    null, 3)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.practical_domains (code, label, parent_code, sort_order) values
  ('crop_farming', 'Crop farming', 'agriculture_livestock', 11),
  ('dairy',        'Dairy',        'agriculture_livestock', 12),
  ('poultry',      'Poultry',      'agriculture_livestock', 13),
  ('horticulture', 'Horticulture', 'agriculture_livestock', 14),
  ('tailoring',    'Tailoring',    'trades',                31)
on conflict (code) do update set label = excluded.label, parent_code = excluded.parent_code, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Counties (official numbering) and the Nairobi-area estates named in FR-OFF-1.
-- Estate centroids are left empty for Admin to maintain (§9.6).
-- ---------------------------------------------------------------------------
insert into public.counties (code, label, number, sort_order) values
  ('mombasa', 'Mombasa', 1, 1), ('kwale', 'Kwale', 2, 2), ('kilifi', 'Kilifi', 3, 3),
  ('tana_river', 'Tana River', 4, 4), ('lamu', 'Lamu', 5, 5), ('taita_taveta', 'Taita-Taveta', 6, 6),
  ('garissa', 'Garissa', 7, 7), ('wajir', 'Wajir', 8, 8), ('mandera', 'Mandera', 9, 9),
  ('marsabit', 'Marsabit', 10, 10), ('isiolo', 'Isiolo', 11, 11), ('meru', 'Meru', 12, 12),
  ('tharaka_nithi', 'Tharaka-Nithi', 13, 13), ('embu', 'Embu', 14, 14), ('kitui', 'Kitui', 15, 15),
  ('machakos', 'Machakos', 16, 16), ('makueni', 'Makueni', 17, 17), ('nyandarua', 'Nyandarua', 18, 18),
  ('nyeri', 'Nyeri', 19, 19), ('kirinyaga', 'Kirinyaga', 20, 20), ('muranga', 'Murang''a', 21, 21),
  ('kiambu', 'Kiambu', 22, 22), ('turkana', 'Turkana', 23, 23), ('west_pokot', 'West Pokot', 24, 24),
  ('samburu', 'Samburu', 25, 25), ('trans_nzoia', 'Trans Nzoia', 26, 26), ('uasin_gishu', 'Uasin Gishu', 27, 27),
  ('elgeyo_marakwet', 'Elgeyo-Marakwet', 28, 28), ('nandi', 'Nandi', 29, 29), ('baringo', 'Baringo', 30, 30),
  ('laikipia', 'Laikipia', 31, 31), ('nakuru', 'Nakuru', 32, 32), ('narok', 'Narok', 33, 33),
  ('kajiado', 'Kajiado', 34, 34), ('kericho', 'Kericho', 35, 35), ('bomet', 'Bomet', 36, 36),
  ('kakamega', 'Kakamega', 37, 37), ('vihiga', 'Vihiga', 38, 38), ('bungoma', 'Bungoma', 39, 39),
  ('busia', 'Busia', 40, 40), ('siaya', 'Siaya', 41, 41), ('kisumu', 'Kisumu', 42, 42),
  ('homa_bay', 'Homa Bay', 43, 43), ('migori', 'Migori', 44, 44), ('kisii', 'Kisii', 45, 45),
  ('nyamira', 'Nyamira', 46, 46), ('nairobi', 'Nairobi', 47, 47)
on conflict (code) do update set label = excluded.label, number = excluded.number, sort_order = excluded.sort_order;

insert into public.estates (code, label, county_code, sort_order) values
  ('kilimani',            'Kilimani',            'nairobi',  1),
  ('kileleshwa',          'Kileleshwa',          'nairobi',  2),
  ('karen',               'Karen',               'nairobi',  3),
  ('lavington',           'Lavington',           'nairobi',  4),
  ('ruaka',               'Ruaka',               'kiambu',   5),
  ('kitengela',           'Kitengela',           'kajiado',  6),
  ('syokimau',            'Syokimau',            'machakos', 7),
  ('rongai',              'Rongai',              'kajiado',  8),
  ('thika_road_corridor', 'Thika Road corridor', 'nairobi',  9)  -- spans Nairobi and Kiambu; filed under Nairobi
on conflict (code) do update set label = excluded.label, county_code = excluded.county_code, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Languages of instruction, special needs, verification check types and their badges (FR-VER-9)
-- ---------------------------------------------------------------------------
insert into public.languages (code, label, label_sw, sort_order) values
  ('en', 'English',   'Kiingereza', 1),
  ('sw', 'Kiswahili', 'Kiswahili',  2)
on conflict (code) do update set label = excluded.label, label_sw = excluded.label_sw, sort_order = excluded.sort_order;

insert into public.special_needs (code, label, sort_order) values
  ('dyslexia',           'Dyslexia',               1),
  ('adhd',               'ADHD',                   2),
  ('autism',             'Autism',                 3),
  ('hearing_impairment', 'Hearing impairment',     4),
  ('visual_impairment',  'Visual impairment',      5),
  ('learning_support',   'Extra learning support', 6)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.check_types (code, label, badge_label, default_tier, sort_order) values
  ('identity_iprs',           'Identity check against IPRS',  'ID verified',          1, 1),
  ('payout_ownership',        'Payout number ownership',      null,                   1, 2),
  ('certificate_kcse',        'KCSE certificate',             'Certificates checked', 2, 3),
  ('certificate_degree',      'Degree or diploma certificate','Certificates checked', 2, 3),
  ('certificate_tsc',         'TSC certificate',              'Certificates checked', 2, 3),
  ('tsc_lookup',              'TSC register lookup',          'TSC checked',          2, 4),
  ('credential_professional', 'Professional credential',      'Credentials checked',  2, 5),
  ('work_history',            'Work history confirmation',    'Credentials checked',  2, 5),
  ('experience_evidence',     'Evidence of practice',         'Experience checked',   2, 6),
  ('portfolio',               'Portfolio of work',            'Experience checked',   2, 6),
  ('teaching_reference',      'References from past learners','Experience checked',   2, 6),
  ('good_conduct',            'Certificate of Good Conduct',  'Police clearance',     3, 7),
  ('subject_test',            'Subject test',                 'Subject tested',       4, 8),
  ('demo_lesson',             'Demo lesson',                  'Demo scored',          4, 9),
  ('reference',               'Reference check',              null,                   4, 10),
  ('track_record',            'Track record on Koobi',        'Top teacher',          5, 11)
on conflict (code) do update set label = excluded.label, badge_label = excluded.badge_label,
  default_tier = excluded.default_tier, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Dated parameters (§6.4 rule 4). Values in force from 1 November 2026 (EAT).
-- ---------------------------------------------------------------------------
insert into public.parameters (key, track, format, mode, value, effective_from, note) values
  -- FR-COMM-1: online one-to-one, by the pair's cumulative confirmed paid hours before the session
  ('commission_rate', null, 'one_to_one', 'online',
   '{"basis": "pair_paid_hours", "tiers": [{"from_paid_hours": 0, "rate": 0.20}, {"from_paid_hours": 50, "rate": 0.15}, {"from_paid_hours": 200, "rate": 0.12}]}',
   '2026-11-01 00:00:00+03', 'FR-COMM-1. The session that crosses a threshold is charged at the old rate [assumption].'),
  -- FR-COMM-2: in person, 20% for the pair's first 30 days, then 10% on the managed plan
  ('commission_rate', null, 'one_to_one', 'in_home',
   '{"basis": "in_person_pair", "first_month_rate": 0.20, "first_month_days": 30, "managed_plan_rate": 0.10, "ad_hoc_after_first_month_rate": 0.20}',
   '2026-11-01 00:00:00+03', 'FR-COMM-2. The 10% applies inside the managed plan only [assumption].'),
  ('commission_rate', null, 'one_to_one', 'teacher_premises',
   '{"basis": "in_person_pair", "first_month_rate": 0.20, "first_month_days": 30, "managed_plan_rate": 0.10, "ad_hoc_after_first_month_rate": 0.20}',
   '2026-11-01 00:00:00+03', 'FR-COMM-2. The 10% applies inside the managed plan only [assumption].'),
  -- FR-COMM-6: every seat at the opening rate, no sliding scale
  ('commission_rate', null, 'small_group', null, '{"basis": "flat", "rate": 0.20}', '2026-11-01 00:00:00+03', 'FR-COMM-6 [assumption pending a seat rate].'),
  ('commission_rate', null, 'cohort',      null, '{"basis": "flat", "rate": 0.20}', '2026-11-01 00:00:00+03', 'FR-COMM-6 [assumption pending a seat rate].'),
  ('commission_rate', null, 'workshop',    null, '{"basis": "flat", "rate": 0.20}', '2026-11-01 00:00:00+03', 'FR-COMM-6 [assumption pending a seat rate].'),
  ('commission_rate', null, 'site_visit',  null, '{"basis": "flat", "rate": 0.20}', '2026-11-01 00:00:00+03', 'FR-COMM-6 [assumption pending a seat rate].'),
  -- FR-COMM-4: trials carry no commission; the shortfall is expense_trial_subsidy
  ('commission_rate_trial', null, 'one_to_one', null, '0', '2026-11-01 00:00:00+03', 'FR-COMM-4.'),
  -- Tax (FR-LEDGER-2)
  ('withholding_rate', null, null, null, '0.05', '2026-11-01 00:00:00+03',
   'Withholding on payments to resident sellers. Enforcement detail unverified; Finance confirms the effective date after tax advice.'),
  ('vat_rate',         null, null, null, '0.16', '2026-11-01 00:00:00+03', 'VAT on the platform fee, posted only while vat_registered is true.'),
  ('vat_registered',   null, null, null, 'false', '2026-11-01 00:00:00+03', 'Turn on (new row) when turnover passes KES 5 million in 12 months.'),
  -- Booking policy (FR-BOOK-3, FR-BOOK-8, FR-SESS-4)
  ('cancellation_window_hours',     null, null, null, '24', '2026-11-01 00:00:00+03', 'FR-BOOK-8.'),
  ('grace_period_minutes',          null, null, null, '15', '2026-11-01 00:00:00+03', 'FR-BOOK-8, both sides.'),
  ('teacher_response_window_hours', null, null, null, '12', '2026-11-01 00:00:00+03', 'FR-BOOK-3 [assumption].'),
  ('auto_confirm_window_hours',     null, null, null, '48', '2026-11-01 00:00:00+03', 'FR-SESS-4 [assumption].'),
  -- Discovery (FR-MATCH-6)
  ('rating_min_reviews', null, null, null, '3', '2026-11-01 00:00:00+03', 'A rating is shown only from this many published reviews.'),
  -- Payouts (FR-PAYOUT-1, FR-PAYOUT-3)
  ('payout_min_threshold_kes', null, null, null, '500', '2026-11-01 00:00:00+03', 'FR-PAYOUT-1 [assumption].'),
  ('payout_transfer_fee_tiers', null, null, null,
   '[{"up_to_kes": 1500, "fee_kes": 20}, {"up_to_kes": 20000, "fee_kes": 40}, {"up_to_kes": null, "fee_kes": 60}]',
   '2026-11-01 00:00:00+03', 'Paystack transfers to M-Pesa, absorbed by the platform (FR-PAYOUT-3).')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Feature flags (off until the provider path is confirmed, FR-PAY-9)
-- ---------------------------------------------------------------------------
insert into public.feature_flags (key, track, enabled, description) values
  ('usd_display',       'school',              false, 'Show USD display prices to learners abroad on online offerings.'),
  ('usd_display',       'adults_professional', false, 'Show USD display prices to learners abroad on online offerings.'),
  ('usd_card_payments', 'school',              false, 'Accept USD card payments settling in KES.'),
  ('usd_card_payments', 'adults_professional', false, 'Accept USD card payments settling in KES.')
on conflict do nothing;
