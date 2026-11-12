import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, CalendarDays, Clock, History, MapPin, MessagesSquare, NotebookPen, Phone, Quote, ReceiptText, UserRound, Video, Wallet } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { LessonNote } from "@/components/app/lesson-note";
import { getTeachingBookingDetails, getTeachingBookings } from "@/lib/data/bookings";
import { getLessonExtras } from "@/lib/data/lessons";
import { getBookingMoney } from "@/lib/data/earnings";
import { getThreads } from "@/lib/data/matching";
import { formatDate, formatDuration, formatKES, formatTime, formatWeekday, initials } from "@/domain/format";
import { DISPUTE_STATUS_LABELS, KIND_LABELS, PROBLEM_TYPES } from "@/domain/booking";
import { DEFAULT_RATES, splitSession } from "@/domain/commission";
import { OFFER_MODES } from "@/domain/listing-input";
import { FORMATS } from "@/domain/taxonomy";
import { RespondForm } from "../respond-form";
import { InternalNoteForm, RescheduleAnswer, RescheduleForm, TeacherCancelForm } from "../../sessions/forms";
import { TIME_OPTIONS, dayKey } from "@/domain/schedule";

export const metadata: Metadata = { title: "Booking details" };

const DONE: Record<string, string> = {
  accepted: "Accepted. The learner can now see the link.",
  cancelled: "Cancelled. The learner has the money back as credit.",
  declined: "Declined. The learner has the money back as credit.",
  move_asked: "Sent. The learner has 6 hours to accept the new time.",
  moved: "The lesson has moved to the new time.",
  move_declined: "The lesson stays at its time.",
  move_withdrawn: "Request withdrawn. The lesson stays at its time.",
};

const METHODS: Record<string, string> = { mpesa_stk: "M-Pesa", card: "Card", payment_link: "Payment link" };

const STATUS_NOTE: Record<string, string> = {
  paid: "Paid and waiting for your answer.",
  accepted: "Accepted. Waiting to be scheduled.",
  scheduled: "Confirmed and paid. The money is held until the lesson happens.",
  in_progress: "The lesson is under way.",
  awaiting_note: "The lesson has ended. Write the lesson note to move it on.",
  awaiting_confirmation: "Waiting for the learner to confirm. It confirms itself 48 hours after your note.",
  confirmed: "Completed. Your earnings are in the next weekly payout.",
  disputed: "The learner reported a problem. Payment is on hold until the concierge decides.",
  no_show_learner: "Recorded as a learner no-show.",
  no_show_teacher: "Recorded as a teacher no-show. The learner was credited.",
  cancelled: "Cancelled.",
  lapsed: "Not answered in time. The learner was credited.",
};

/** T17: one booking in full: who, what, when, the money and what to do next. */
export default function TeachBookingPage(props: PageProps<"/teach/bookings/[id]">) {
  return (
    <Guarded next="/teach/bookings">
      <Booking params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof BookOpen; title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-5" aria-label={title}>
      <h2 className="t3 flex items-center gap-2">
        <Icon size={18} aria-hidden="true" className="text-orange-deep" />
        {title}
      </h2>
      {children}
    </section>
  );
}

async function Booking({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const b = (await getTeachingBookings()).find((x) => x.id === id);
  if (!b) notFound();
  const [{ session, note, disputes }, money, threads, extra] = await Promise.all([getLessonExtras(b.id), getBookingMoney(b.id), getThreads(), getTeachingBookingDetails(b.id)]);

  const trial = b.kind === "trial";
  const seat = b.kind === "seat";
  const paidByLearner = b.price_kes - b.discount_kes;
  const closed = ["cancelled", "lapsed", "no_show_teacher"].includes(b.status);
  // Where the learner's money went when a booking closed without a lesson.
  const returned = extra?.payment?.hold_status === "refunded" ? "Refunded to the learner" : "Returned to the learner as credit";
  const now = new Date();
  const movable = ["accepted", "scheduled"].includes(b.status) && new Date(b.starts_at).getTime() - now.getTime() > 24 * 3600_000;
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  // Before release this is an estimate at the opening rates; after release it is what the ledger posted.
  const estimate = trial
    ? { commission: 0, withholding: Math.round(b.price_kes * DEFAULT_RATES.withholding), teacherNet: b.price_kes - Math.round(b.price_kes * DEFAULT_RATES.withholding) }
    : splitSession({ priceKes: b.price_kes, rate: DEFAULT_RATES.onlineOpening, vatRegistered: false });
  const net = money?.net_kes ?? estimate.teacherNet;
  const withholding = money?.withholding_kes ?? estimate.withholding;
  const commission = money ? Math.max(0, b.price_kes - money.net_kes - money.withholding_kes) : estimate.commission;

  const ends = new Date(new Date(b.starts_at).getTime() + b.duration_minutes * 60_000).toISOString();
  const openDispute = disputes.find((d) => !["resolved", "closed"].includes(d.status));
  const candidates = threads.filter((t) => b.payer_first_name && t.other_name === b.payer_first_name);
  const threadHref = candidates.length === 1 ? `/teach/messages/${candidates[0].id}` : "/teach/messages";
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  const activity = [
    { at: b.created_at, text: "Booking created" },
    { at: b.paid_at, text: "Payment received and held" },

    { at: session?.checked_in_at, text: "You checked in" },
    { at: session?.checked_out_at, text: b.status === "no_show_learner" ? "Learner reported absent" : "You checked out" },
    { at: note?.filed_at, text: "Lesson note filed" },
    { at: session?.confirmed_at, text: session?.confirmed_by === "auto" ? "Confirmed automatically" : session?.confirmed_by === "staff" ? "Confirmed by the concierge" : "Confirmed by the learner" },
  ].filter((a): a is { at: string; text: string } => !!a.at);

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <nav className="flex items-center gap-2 text-[15px] text-ink-2" aria-label="Breadcrumb">
        <Link href="/teach/bookings">Bookings</Link>
        <span aria-hidden="true">/</span>
        <span>Booking details</span>
      </nav>
      {done ? (
        <p className={`panel ${sp.done === "accepted" ? "escrow" : "info"}`} role="status">
          {done}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="t1">Booking Details</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="help">
              Reference <span className="mono text-ink">{b.id.slice(0, 8).toUpperCase()}</span>
            </span>
            <BookingPill status={b.status} />
            {trial ? <span className="pill bg-fmt-1 text-orange-deep">First session · Trial</span> : null}
            <span className="pill">{seat ? "Seat in a group" : FORMATS.one_to_one.label}</span>
            {closed && extra?.payment?.hold_status === "refunded" ? <span className="pill bg-sand text-ink-2">Refunded</span> : null}
          </div>
        </div>
        <Link className="btn2" href={threadHref}>
          <MessagesSquare size={18} aria-hidden="true" />
          Message learner
        </Link>
      </div>

      {extra?.reschedule ? (
        <RescheduleAnswer bookingId={b.id} proposalId={extra.reschedule.id} side="teacher" mine={extra.reschedule.by_role === "teacher"} newStart={extra.reschedule.new_starts_at} expiresAt={extra.reschedule.expires_at} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section icon={BookOpen} title="Learning experience">
            <div className="flex flex-col">
              <Link className="font-semibold text-ink no-underline hover:underline" href={`/teach/offers/${b.offering_id}`}>
                {b.title}
              </Link>
              <span className="help">
                {FORMATS.one_to_one.label} · {KIND_LABELS[b.kind] ?? b.kind}
              </span>
            </div>
          </Section>

          <Section icon={UserRound} title="Learner">
            <div className="flex items-center gap-3">
              <span className="av" aria-hidden="true">
                {initials(b.learner_alias)}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="font-semibold">{b.learner_alias}</span>
                <span className="help">{b.payer_first_name && b.payer_first_name !== b.learner_alias ? `Booked by ${b.payer_first_name}` : "Booked for themselves"}</span>
              </div>
            </div>
            {extra?.payer_phone && !closed ? (
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Phone size={16} aria-hidden="true" className="flex-none text-ink-2" />
                <a className="mono text-ink" href={`tel:${extra.payer_phone}`}>
                  {extra.payer_phone}
                </a>
                <span className="help">{extra.for_child ? "The parent’s number. A child’s contact is never shown." : "Shared because this booking is paid."}</span>
              </p>
            ) : (
              <p className="help">Talk through Messages. A phone number is shared once a booking between you is paid; a child’s contact is never shown.</p>
            )}
            <Link className="btn3 self-start" href={`/teach/bookings?tab=all&q=${encodeURIComponent(b.learner_alias)}`}>
              All bookings with {b.learner_alias} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Section>

          <Section icon={CalendarDays} title="Schedule">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col">
                <span className="mono">{formatDate(b.starts_at)}</span>
                <span className="help">{formatWeekday(b.starts_at).split(" ")[0]}</span>
              </div>
              <div className="flex flex-col">
                <span className="mono">
                  {formatTime(b.starts_at)} – {formatTime(ends)}
                </span>
                <span className="help">{formatDuration(b.duration_minutes)} · East Africa Time</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={18} aria-hidden="true" className="mt-1 flex-none text-ink-2" />
                <span>{OFFER_MODES.find(([c]) => c === b.mode)?.[1] ?? b.mode}</span>
              </div>
            </div>
          </Section>

          {b.mode === "online" && !closed ? (
            <Section icon={Video} title="Meeting">
              {b.meeting_link ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="mono break-all text-[14px]">{b.meeting_link}</span>
                  <a className="btn2" href={b.meeting_link} target="_blank" rel="noreferrer">
                    Open meeting link
                  </a>
                </div>
              ) : (
                <p className="help">{b.status === "paid" ? "Add your Google Meet or Zoom link when you accept, below." : "No meeting link on this booking."}</p>
              )}
            </Section>
          ) : null}

          {b.status === "paid" ? <RespondForm bookingId={b.id} mode={b.mode} /> : null}

          {extra?.learner_note ? (
            <Section icon={Quote} title="Learner’s note">
              <p className="whitespace-pre-line">{extra.learner_note}</p>
            </Section>
          ) : null}

          {extra ? (
            <Section icon={NotebookPen} title="Your private notes">
              <InternalNoteForm bookingId={b.id} note={extra.internal_note ?? ""} />
            </Section>
          ) : null}

          {openDispute ? (
            <p className="panel error">
              <span>
                <b>{PROBLEM_TYPES[openDispute.type] ?? "Problem reported"}</b> · {DISPUTE_STATUS_LABELS[openDispute.status] ?? openDispute.status}. The concierge may ask you for a short statement.
              </span>
            </p>
          ) : null}

          {note ? <LessonNote note={note} heading="Your lesson note" /> : null}

          <Section icon={History} title="Activity">
            <ol className="flex flex-col gap-2.5">
              {activity.map((a) => (
                <li key={a.text} className="flex items-baseline gap-3">
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-orange" aria-hidden="true" />
                  <span className="flex-1">{a.text}</span>
                  <span className="help mono">
                    {formatDate(a.at)} {formatTime(a.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          <div className="flex flex-wrap items-center gap-3">
            {seat ? (
              <Link className="btn2" href="/teach/runs">
                Open group dates
              </Link>
            ) : null}
            {session && !closed && !seat ? (
              <Link className={["scheduled", "in_progress", "awaiting_note"].includes(b.status) ? "btn" : "btn2"} href={`/teach/sessions/${session.id}`}>
                <Clock size={18} aria-hidden="true" />
                {b.status === "awaiting_note" ? "Write the lesson note" : b.status === "scheduled" ? "Open the lesson (check in)" : "Open the lesson"}
              </Link>
            ) : null}
            {extra && movable && !seat && !extra.reschedule ? <RescheduleForm bookingId={b.id} side="teacher" minDate={tomorrow} times={TIME_OPTIONS} /> : null}
            {["accepted", "scheduled"].includes(b.status) && !seat ? <TeacherCancelForm bookingId={b.id} /> : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Section icon={ReceiptText} title="Payment summary">
            <p className={`pill self-start ${closed ? "bg-sand text-ink-2" : "bg-forest-tint text-forest-ink"}`}>{closed ? returned : "Payment received"}</p>
            <div className="flex flex-col">
              <span className="mono text-[28px] leading-9 tracking-tight">{formatKES(paidByLearner)}</span>
              <span className="help">Paid by the learner{trial ? " (trial price)" : ""}</span>
            </div>
            <div className="flex flex-col">
              <div className="kv">
                <span>Session price</span>
                <span>{formatKES(b.price_kes)}</span>
              </div>
              {closed ? null : (
                <>
                  {trial ? (
                    <div className="kv">
                      <span>Trial discount, paid by Koobi</span>
                      <span>{formatKES(b.discount_kes)}</span>
                    </div>
                  ) : null}
                  <div className="kv">
                    <span>Koobi commission{trial ? " (none on a trial)" : ""}</span>
                    <span>− {formatKES(commission)}</span>
                  </div>
                  <div className="kv">
                    <span>Withholding tax (5%)</span>
                    <span>− {formatKES(withholding)}</span>
                  </div>
                </>
              )}
              <div className="kv">
                <span className="font-semibold text-ink!">Your earnings</span>
                <span className="font-semibold">{closed ? formatKES(0) : formatKES(net)}</span>
              </div>
            </div>
            {extra?.payment || extra?.by_credit ? (
              <div className="flex flex-col border-t border-dashed border-line-2 pt-1">
                <div className="kv">
                  <span>Payment method</span>
                  <span className="font-sans!">{extra.payment ? (METHODS[extra.payment.method] ?? extra.payment.method) : "Koobi credit"}</span>
                </div>
                {extra.payment ? (
                  <div className="kv">
                    <span>Reference</span>
                    <span>{extra.payment.reference}</span>
                  </div>
                ) : null}
                {extra.payment?.paid_at ?? b.paid_at ? (
                  <div className="kv">
                    <span>Paid on</span>
                    <span>{formatDate((extra.payment?.paid_at ?? b.paid_at)!)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <p className="help">
              {closed
                ? "Nothing is paid out for a cancelled booking."
                : money
                  ? "Posted to your balance when the lesson was confirmed."
                  : "An estimate at the standard rates. The final figures are posted when the lesson is confirmed."}
            </p>
          </Section>

          <Section icon={Wallet} title="Your earnings">
            <span className="mono text-[28px] leading-9 tracking-tight">{closed ? formatKES(0) : formatKES(net)}</span>
            <span className="help">{money ? "From this booking, in your weekly payout" : closed ? "From this booking" : "From this booking, once confirmed"}</span>
            <Link className="btn3 self-start" href="/teach/earnings">
              Earnings & Payouts
            </Link>
          </Section>

          <Section icon={CalendarDays} title="Booking status">
            <BookingPill status={b.status} />
            <p className="help">{STATUS_NOTE[b.status] ?? ""}</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
