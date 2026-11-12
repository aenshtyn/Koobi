// Expert onboarding and the public profile (migration 20261107000100): the five-step application, the
// meeting and the decision, documents verified one by one, the introduction video, reviewed profile
// changes and publication. Called from check-migrations.mjs inside a transaction that is rolled back.

export async function checkExpertOnboarding({ act, expectError, pass, fail, q }) {
  const A = 'a1111111-1111-1111-1111-111111111111'; // applicant
  const B = 'a2222222-2222-2222-2222-222222222222'; // a second applicant, rejected
  const R = 'a3333333-3333-3333-3333-333333333333'; // reviewer
  const AD = 'a4444444-4444-4444-4444-444444444444'; // admin
  const X = 'a5555555-5555-5555-5555-555555555555'; // someone else
  const TERMS = 'expert-2026-11-v1';
  const step = async (name, fn) => {
    try {
      const r = await fn();
      pass(`expert: ${name}`);
      return r;
    } catch (e) {
      fail(`expert: ${name}`, e.message);
      throw e;
    }
  };
  const ok = (name, cond, detail) => (cond ? pass(`expert: ${name}`) : fail(`expert: ${name}`, JSON.stringify(detail)));
  const err = (name, sub, sql, pattern) => expectError(`expert: ${name}`, 'authenticated', sub, q(sql), pattern);
  const notices = async (user, key, channel = 'in_app') =>
    (await act('postgres', null, `select count(*)::int n from public.notifications where user_id = $1 and template = $2 and channel = $3`, [user, key, channel]))[0].n;
  const row = async (id) => (await act('postgres', null, `select * from public.teachers where id = $1`, [id]))[0];
  const bio = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');

  try {
    await act('postgres', null, `insert into auth.users (id, email, raw_user_meta_data) values
      ($1, 'applicant@koobi.test', '{"display_name": "Amina Applicant"}'), ($2, 'second@koobi.test', '{"display_name": "Ben Second"}'),
      ($3, 'rev@koobi.test', '{"display_name": "Rita Reviewer"}'), ($4, 'adm@koobi.test', '{"display_name": "Ali Admin"}'),
      ($5, 'else@koobi.test', '{"display_name": "Xena Else"}')`, [A, B, R, AD, X]);
    await act('postgres', null, `insert into public.user_roles (user_id, role) values ($1, 'reviewer'), ($2, 'admin'), ($3, 'learner')`, [R, AD, X]);

    // ---- the application, saved step by step
    await act('authenticated', A, `select public.claim_role('teacher')`);
    const [t] = await step('step 1 saves a draft on the applicant’s own row', () =>
      act('authenticated', A, `insert into public.teachers (display_name, contact_phone, country_code, city, application_step)
        values ('Amina Applicant', '+254712000111', 'KE', 'Nairobi', 2) returning id, slug, application_status`));
    ok('a new application starts as a draft', t.application_status === 'draft', t);
    await err('the applicant cannot set their own status', A, `update public.teachers set application_status = 'approved' where id = '${t.id}'`, /permission denied/);
    await err('sending needs the terms', A, `select public.submit_application(null)`, /agree to the terms/);
    await err('sending needs a photo', A, `select public.submit_application('${TERMS}')`, /personal information is not complete/);
    await act('authenticated', A, `update public.teachers set photo_url = 'https://example.test/p.jpg' where id = $1`, [t.id]);
    await act('authenticated', A, `update public.teachers set headline = 'Business consultant', bio = 'Too short.', experience_band = '6_10',
      achievements = 'Ran a consultancy.', employment_status = 'self_employed', employer = 'Self', website_url = 'https://example.test/me' where id = $1`, [t.id]);
    await err('a biography under 100 words is not enough', A, `select public.submit_application('${TERMS}')`, /professional background is not complete/);
    await act('authenticated', A, `update public.teachers set bio = $2 where id = $1`, [t.id, bio]);
    await err('sending needs the expertise step', A, `select public.submit_application('${TERMS}')`, /expertise is not complete/);
    await err('only known audiences are kept', A, `update public.teachers set audiences = '{everyone}' where id = '${t.id}'`, /audiences/);
    await act('authenticated', A, `update public.teachers set primary_category = 'business_entrepreneurship', specialisations = '{Strategy,Bookkeeping}',
      audiences = '{entrepreneurs,teams}', languages = '{en,sw}', formats_offered = '{one_to_one,workshop}', learner_outcomes = 'Run a business that keeps its books.' where id = $1`, [t.id]);
    await err('sending needs the ID or passport', A, `select public.submit_application('${TERMS}')`, /national ID or passport/);

    // ---- documents
    await err('a file under someone else’s folder is refused', A, `select public.add_credential('identity', 'National ID', null, 'expert/${X}/id.pdf', 'id.pdf')`, /does not belong to you/);
    const [{ add_credential: idDoc }] = await step('the applicant adds an ID document', () =>
      act('authenticated', A, `select public.add_credential('identity', 'National ID', null, $1, 'id.pdf')`, [`expert/${t.id}/id-1.pdf`]));
    const [{ add_credential: degree }] = await act('authenticated', A, `select public.add_credential('education', 'BCom, University of Nairobi', 'University of Nairobi', $1, 'd.pdf')`, [`expert/${t.id}/deg.pdf`]);
    const [{ add_credential: cert }] = await act('authenticated', A, `select public.add_credential('certification', 'CPA Kenya', 'KASNEB', $1, 'c.pdf')`, [`expert/${t.id}/cpa.pdf`]);
    await err('storage keys are not readable from the table', A, `select storage_key from public.teacher_credentials`, /permission denied/);
    const seen = await act('authenticated', X, `select id from public.teacher_credentials`);
    ok('nobody else sees an applicant’s documents', seen.length === 0, seen);
    await expectError('expert: nobody else can open a document', 'authenticated', X, q(`select public.credential_key('${idDoc}')`), /reviewers only/);

    await act('authenticated', A, `update public.teachers set employment_status = 'tsc_full_time' where id = $1`, [t.id]);
    await err('a full-time TSC teacher cannot send an application', A, `select public.submit_application('${TERMS}')`, /TSC/);
    await act('authenticated', A, `update public.teachers set employment_status = 'self_employed' where id = $1`, [t.id]);
    await step('the applicant submits', () => act('authenticated', A, `select public.submit_application($1)`, [TERMS]));
    let cur = await row(t.id);
    ok('status is Submitted, with the terms recorded', cur.application_status === 'submitted' && cur.terms_version === TERMS && cur.terms_accepted_at && cur.application_submitted_at, cur);
    ok('the applicant is told, in the app and by email', (await notices(A, 'application_submitted')) === 1 && (await notices(A, 'application_submitted', 'email')) === 1, null);
    await err('a submitted application is locked', A, `update public.teachers set headline = 'Something else' where id = '${t.id}'`, /sent for review first/);
    await err('no documents can be added while Koobi has it', A, `select public.add_credential('licence', 'Licence', null, 'expert/${t.id}/l.pdf', 'l.pdf')`, /with Koobi/);
    await err('it cannot be sent twice', A, `select public.submit_application('${TERMS}')`, /already been sent/);

    // ---- verification, meeting, decision
    await err('the applicant cannot decide their own application', A, `select public.application_decide('${t.id}', 'approve', null)`, /reviewers only/);
    await err('a meeting comes after the documents', R, `select public.application_invite_meeting('${t.id}', now() + interval '2 days', 'https://meet.google.com/abc-defg-hij')`, /check the documents first/);
    await step('a reviewer starts verification', () => act('authenticated', R, `select public.application_start_verification($1)`, [t.id]));
    ok('status is Under verification', (await row(t.id)).application_status === 'under_verification', null);
    await err('no meeting before the ID is verified', R, `select public.application_invite_meeting('${t.id}', now() + interval '2 days', 'https://meet.google.com/abc-defg-hij')`, /verify the identity document/);
    await err('rejecting a document needs a reason', R, `select public.review_credential('${cert}', false, '')`, /say why/);
    const [{ credential_key: key }] = await step('a reviewer opens the ID (logged)', () => act('authenticated', R, `select public.credential_key($1)`, [idDoc]));
    const [{ n: views }] = await act('postgres', null, `select count(*)::int n from public.audit_log where action = 'document.view' and entity_id = $1`, [idDoc]);
    ok('opening a document returns its file and writes the audit log', key === `expert/${t.id}/id-1.pdf` && views === 1, { key, views });
    await step('documents are verified one by one', async () => {
      await act('authenticated', R, `select public.review_credential($1, true, null)`, [idDoc]);
      await act('authenticated', R, `select public.review_credential($1, true, null)`, [degree]);
      await act('authenticated', R, `select public.review_credential($1, false, 'The certificate number does not match the register.')`, [cert]);
    });
    await err('the meeting time must be in the future', R, `select public.application_invite_meeting('${t.id}', now() - interval '1 hour', 'https://meet.google.com/abc-defg-hij')`, /in the future/);
    await err('the meeting needs a link', R, `select public.application_invite_meeting('${t.id}', now() + interval '2 days', 'meet me')`, /meeting link/);
    await step('a reviewer invites the applicant to a meeting', () =>
      act('authenticated', R, `select public.application_invite_meeting($1, now() + interval '2 days', 'https://meet.google.com/abc-defg-hij')`, [t.id]));
    cur = await row(t.id);
    const [invite] = await act('postgres', null, `select payload from public.notifications where user_id = $1 and template = 'application_meeting' and channel = 'email'`, [A]);
    ok('status is Meeting required and the invitation email carries the time and link', cur.application_status === 'meeting_required'
      && invite?.payload?.meeting === 'https://meet.google.com/abc-defg-hij' && !!invite.payload.when, { s: cur.application_status, invite });
    await err('approval waits for the meeting outcome', R, `select public.application_decide('${t.id}', 'approve', null)`, /record the meeting/);
    await err('the outcome needs notes', R, `select public.application_record_meeting('${t.id}', 'suitable', 'ok')`, /what you observed/);
    await step('the meeting outcome is recorded', () =>
      act('authenticated', R, `select public.application_record_meeting($1, 'suitable', 'Clear communicator with ten years of practice.')`, [t.id]));
    const notes = await act('authenticated', A, `select * from public.application_reviews`);
    const history = await act('authenticated', A, `select * from public.application_events`);
    ok('the applicant never sees staff notes or the history', notes.length === 0 && history.length === 0, { notes, history });

    await err('returning an application needs a reason', R, `select public.application_decide('${t.id}', 'more_info', 'more')`, /write the reason/);
    await step('a reviewer returns it for more information', () =>
      act('authenticated', R, `select public.application_decide($1, 'more_info', 'Please upload a clearer copy of your CPA certificate.')`, [t.id]));
    cur = await row(t.id);
    ok('status is returned, with the note the expert reads', cur.application_status === 'more_info' && /clearer copy/.test(cur.application_note), cur);
    await step('the applicant edits and sends it again', async () => {
      await act('authenticated', A, `update public.teachers set headline = 'Business and finance consultant' where id = $1`, [t.id]);
      await act('authenticated', A, `select public.remove_credential($1)`, [cert]);
      await act('authenticated', A, `select public.add_credential('certification', 'CPA Kenya', 'KASNEB', $1, 'c2.pdf')`, [`expert/${t.id}/cpa-2.pdf`]);
      await act('authenticated', A, `select public.submit_application($1)`, [TERMS]);
    });
    ok('each step is its own notice (sent twice, told twice)', (await notices(A, 'application_submitted')) === 2 && (await notices(A, 'application_more_info')) === 1, null);
    await err('a verified identity document stays on file', A, `select public.remove_credential('${idDoc}')`, /with Koobi|stays on file/);

    await act('authenticated', R, `select public.application_start_verification($1)`, [t.id]);
    await act('authenticated', R, `select public.application_invite_meeting($1, now() + interval '3 days', 'https://meet.google.com/abc-defg-hij')`, [t.id]);
    await act('authenticated', R, `select public.application_record_meeting($1, 'suitable', 'Second conversation; documents now complete.')`, [t.id]);
    await step('a reviewer approves the application', () => act('authenticated', R, `select public.application_decide($1, 'approve', null)`, [t.id]));
    cur = await row(t.id);
    const [idCheck] = await act('postgres', null, `select status::text, passed_at from public.verification_checks where teacher_id = $1 and check_type = 'identity_iprs'`, [t.id]);
    ok('status is Approved, and the verified ID counts as the identity check', cur.application_status === 'approved' && idCheck?.status === 'passed' && !!idCheck.passed_at, { cur: cur.application_status, idCheck });
    const [gate] = await act('postgres', null, `select t.status::text, t.payout_ownership_status p, (select max(tt.tier) from public.teacher_tracks tt where tt.teacher_id = t.id) tier
      from public.teachers t where t.id = $1`, [t.id]);
    ok('an approved expert can be booked before the payout number is proven', gate.status === 'bookable' && gate.p === 'pending' && gate.tier === 1, gate);
    ok('approval publishes nothing', cur.listing_status === 'draft'
      && (await act('anon', null, `select 1 from public.public_teachers where slug = $1`, [t.slug])).length === 0, cur.listing_status);
    ok('the confirmation goes out by email', (await notices(A, 'application_approved', 'email')) === 1, null);

    // ---- after approval: public information changes only through review
    await err('an approved expert cannot change public information directly', A, `update public.teachers set headline = 'Chief everything' where id = '${t.id}'`, /sent for review first/);
    await err('nor publish by changing the listing', A, `update public.teachers set listing_status = 'pending_review' where id = '${t.id}'`, /published from the Public Profile page/);
    await step('private details change straight away', () => act('authenticated', A, `update public.teachers set city = 'Kisumu', contact_phone = '+254712000222' where id = $1`, [t.id]));

    // ---- the introduction video
    await err('publishing needs the video', A, `select public.publish_profile()`, /introduction video/);
    await err('a video under one minute is refused', A, `select public.add_video('expert/${t.id}/v0.mp4', 'video/mp4', 5000000, 40)`, /between 1 and 3 minutes/);
    await err('a video over 200 MB is refused', A, `select public.add_video('expert/${t.id}/v0.mp4', 'video/mp4', 209715201, 90)`, /200 MB/);
    await err('only MP4 or MOV', A, `select public.add_video('expert/${t.id}/v0.webm', 'video/webm', 5000000, 90)`, /MP4 or MOV/);
    await err('someone who is not an approved expert cannot add a video', X, `select public.add_video('expert/${t.id}/v0.mp4', 'video/mp4', 5000000, 90)`, /after your application is approved/);
    await act('authenticated', A, `select * from public.add_video($1, 'video/mp4', 5000000, 90)`, [`expert/${t.id}/v1.mp4`]);
    const [second] = await step('choosing another file replaces the one not yet sent', () =>
      act('authenticated', A, `select * from public.add_video($1, 'video/quicktime', 8000000, 120)`, [`expert/${t.id}/v2.mov`]));
    ok('the earlier file is handed back for deletion', second.stale_keys.length === 1 && second.stale_keys[0] === `expert/${t.id}/v1.mp4`, second);
    await step('the expert submits the video for review', () => act('authenticated', A, `select public.submit_video($1)`, [second.id]));
    await err('no second video while one is in review', A, `select * from public.add_video('expert/${t.id}/v3.mp4', 'video/mp4', 5000000, 90)`, /already with Koobi/);
    await act('authenticated', R, `select public.video_key($1)`, [second.id]);
    const [v2] = await act('authenticated', A, `select status from public.teacher_videos where id = $1`, [second.id]);
    ok('a reviewer opening the video puts it under review', v2.status === 'under_review', v2);
    await err('asking for changes needs a note', R, `select public.review_video('${second.id}', 'changes', '')`, /what needs to change/);
    await act('authenticated', R, `select public.review_video($1, 'changes', 'The sound drops out after the first minute.')`, [second.id]);
    const [third] = await act('authenticated', A, `select * from public.add_video($1, 'video/mp4', 9000000, 150)`, [`expert/${t.id}/v3.mp4`]);
    await act('authenticated', A, `select public.submit_video($1)`, [third.id]);
    await step('a reviewer approves the new video', () => act('authenticated', R, `select public.review_video($1, 'approve', null)`, [third.id]));
    ok('the expert hears about each video decision', (await notices(A, 'video_changes')) === 1 && (await notices(A, 'video_approved')) === 1, null);

    // ---- publication
    await err('publishing needs an approved learning experience', A, `select public.publish_profile()`, /learning experience must be approved/);
    const [offer] = await act('authenticated', A, `insert into public.offerings (teacher_id, title, summary, category, track, format, subject_text,
        modes, meeting_tool, duration_minutes, price_hour_kes, language_codes)
      values ($1, 'Bookkeeping for small shops', 'Keep books that tell you the truth.', 'business_entrepreneurship', 'adults_professional', 'one_to_one',
        'Bookkeeping', '{online}', 'google_meet', 60, 1500, '{en}') returning id`, [t.id]);
    await act('authenticated', A, `insert into public.availability_windows (offering_id, kind, weekday, starts, ends) values ($1, 'weekly', 1, '09:00', '12:00')`, [offer.id]);
    await act('authenticated', A, `update public.offerings set listing_status = 'pending_review' where id = $1`, [offer.id]);
    await act('authenticated', R, `update public.offerings set listing_status = 'approved' where id = $1`, [offer.id]);
    const [req] = await act('authenticated', A, `select public.my_profile_requirements() r`);
    ok('the checklist is read from real records', req.r.approved && req.r.photo && req.r.video && req.r.experience && req.r.biography && !req.r.published, req.r);
    await step('with every requirement met the expert publishes', () => act('authenticated', A, `select public.publish_profile()`));
    const [pub] = await act('anon', null, `select * from public.public_teachers where slug = $1`, [t.slug]);
    ok('the public profile shows only approved information', pub?.verified === true && pub.has_video === true && pub.headline === 'Business and finance consultant'
      && pub.credentials.length === 1 && pub.credentials[0].title === 'BCom, University of Nairobi' && pub.credentials[0].kind === 'education'
      && pub.weekly_hours.length === 1 && pub.weekly_hours[0].starts === '09:00' && pub.country_code === 'KE'
      && !('contact_phone' in pub) && !('city' in pub), pub);
    const [{ public_video_key: playing }] = await act('service_role', null, `select public.public_video_key($1)`, [t.slug]);
    ok('the server finds the approved video of a published profile', playing === `expert/${t.id}/v3.mp4`, playing);
    await expectError('expert: a visitor cannot ask for video files', 'anon', null, q(`select public.public_video_key('${t.slug}')`), /permission denied/);

    // ---- a reviewed change: the draft is separate from what is live
    await err('unknown fields are refused', A, `select public.propose_profile_change('{"status": "bookable"}')`, /cannot be changed here/);
    await err('a changed biography keeps the word limits', A, `select public.propose_profile_change('{"bio": "Short."}')`, /100 to 250 words/);
    const [{ propose_profile_change: change }] = await step('the expert proposes a new title and name', () =>
      act('authenticated', A, `select public.propose_profile_change('{"headline": "Finance trainer", "display_name": "Amina A. Applicant"}')`));
    const [live] = await act('anon', null, `select headline, display_name from public.public_teachers where slug = $1`, [t.slug]);
    const [draft] = await act('authenticated', A, `select changes, identity_recheck, status from public.teacher_profile_changes where id = $1`, [change]);
    ok('the live profile keeps the old values while the draft waits', live.headline === 'Business and finance consultant' && live.display_name === 'Amina Applicant'
      && draft.changes.headline === 'Finance trainer' && draft.status === 'pending', { live, draft });
    ok('a legal name change is flagged for identity re-verification', draft.identity_recheck === true, draft);
    await err('the expert cannot approve their own change', A, `select public.review_profile_change('${change}', true, null)`, /reviewers only/);
    await step('a reviewer approves the change', () => act('authenticated', R, `select public.review_profile_change($1, true, null)`, [change]));
    const [after] = await act('anon', null, `select headline, display_name from public.public_teachers where slug = $1`, [t.slug]);
    ok('the approved change is live', after.headline === 'Finance trainer' && after.display_name === 'Amina A. Applicant', after);
    const [{ propose_profile_change: change2 }] = await act('authenticated', A, `select public.propose_profile_change('{"specialisations": ["Strategy", "Tax"]}')`);
    await err('rejecting a change needs a reason', R, `select public.review_profile_change('${change2}', false, '')`, /say why/);
    await act('authenticated', R, `select public.review_profile_change($1, false, 'Tax advice needs a licence we have not seen.')`, [change2]);
    const [kept] = await act('anon', null, `select specialisations from public.public_teachers where slug = $1`, [t.slug]);
    ok('a rejected change leaves the live profile as it was', JSON.stringify(kept.specialisations) === JSON.stringify(['Strategy', 'Bookkeeping']), kept);

    // ---- a replacement video goes live only once approved
    const [fourth] = await act('authenticated', A, `select * from public.add_video($1, 'video/mp4', 9000000, 100)`, [`expert/${t.id}/v4.mp4`]);
    await act('authenticated', A, `select public.submit_video($1)`, [fourth.id]);
    const [{ public_video_key: still }] = await act('service_role', null, `select public.public_video_key($1)`, [t.slug]);
    await act('authenticated', R, `select public.review_video($1, 'approve', null)`, [fourth.id]);
    const [{ public_video_key: now }] = await act('service_role', null, `select public.public_video_key($1)`, [t.slug]);
    ok('the old video plays until the new one is approved', still === `expert/${t.id}/v3.mp4` && now === `expert/${t.id}/v4.mp4`, { still, now });

    await step('the expert can take the profile down', () => act('authenticated', A, `select public.unpublish_profile()`));
    ok('an unpublished profile is not public', (await act('anon', null, `select 1 from public.public_teachers where slug = $1`, [t.slug])).length === 0, null);

    // ---- rejection
    await act('authenticated', B, `select public.claim_role('teacher')`);
    const [b] = await act('authenticated', B, `insert into public.teachers (display_name, contact_phone, country_code, city, photo_url, headline, bio, experience_band,
        achievements, employment_status, primary_category, specialisations, audiences, languages, formats_offered, learner_outcomes)
      values ('Ben Second', '+254712000333', 'KE', 'Nakuru', 'https://example.test/b.jpg', 'Trainer', $1, '1_2', 'Some work.', 'not_employed',
        'digital_practical_skills', '{Excel}', '{anyone}', '{en}', '{one_to_one}', 'Use spreadsheets with confidence.') returning id`, [bio]);
    await act('authenticated', B, `select public.add_credential('identity', 'Passport', null, $1, 'p.jpg')`, [`expert/${b.id}/p.jpg`]);
    await act('authenticated', B, `select public.submit_application($1)`, [TERMS]);
    await err('rejecting needs a reason', R, `select public.application_decide('${b.id}', 'reject', '')`, /write the reason/);
    await step('a reviewer rejects an application with a reason', () =>
      act('authenticated', R, `select public.application_decide($1, 'reject', 'We could not confirm the experience described.')`, [b.id]));
    await err('a rejected application cannot be sent again', B, `select public.submit_application('${TERMS}')`, /already been sent/);
    await err('only an admin reopens a rejected application', R, `select public.application_decide('${b.id}', 'more_info', 'Please send proof of your experience.')`, /only an admin/);
    await step('an admin reopens it for more information', () =>
      act('authenticated', AD, `select public.application_decide($1, 'more_info', 'Please send proof of your experience.')`, [b.id]));
    ok('the reopened application is back with the applicant', (await row(b.id)).application_status === 'more_info', null);
    ok('an applicant who is not approved cannot be booked', (await row(b.id)).status === 'applied', null);

    // ---- money still waits for the payout number: the batch holds the expert back, the amount stays owed
    await act('postgres', null, `update public.teachers set kra_pin_enc = 'v1:a3JhcGluY2lwaGVydGV4dDAwMDA=' where id = $1`, [t.id]);
    const [txn] = await act('postgres', null, `insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
      values ('session_release', 'expert-gate-test', 'test release', 'system:test') returning id`);
    await act('postgres', null, `insert into public.ledger_entries (txn_id, account, side, amount_kes, counterparty_user_id) values
      ($1, 'client_funds_held', 'debit', 1200, null), ($1, 'teacher_payable', 'credit', 1200, $2)`, [txn.id, A]);
    await act('postgres', null, `select private.compute_payout_batch(current_date, now() + interval '1 minute')`);
    const [held] = await act('postgres', null, `select status::text, exclusion_reason, net_kes from public.payouts where teacher_id = $1`, [t.id]);
    ok('no payout leaves before the payout number is proven', held?.status === 'excluded' && /Payout number not verified/.test(held.exclusion_reason) && held.net_kes === 1200, held);
  } catch (e) {
    if (!/^expert:/.test(e?.message ?? '')) fail('expert: flow stopped', e.message);
  }
}
