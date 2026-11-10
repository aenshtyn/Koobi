import Link from "next/link";
import { ArrowRight, CalendarClock, CircleCheck, MessageSquare, Star, Video, Wallet } from "lucide-react";
import type { LearnerBooking } from "@/lib/data/learning";
import type { Reschedule } from "@/lib/data/bookings";
import { BOOKING_TONE, cancelPreview } from "@/domain/booking";
import { JOIN_LABELS, LEARNER_MODES, joinState, learnerStatusLabel } from "@/domain/learning";
import { formatDate, formatDuration, formatKES, formatTime, formatWeekday, initials } from "@/domain/format";
import { TIME_OPTIONS, dayKey } from "@/domain/schedule";
import { FORMATS, type FormatCode } from "@/domain/taxonomy";
import { CancelDialog, MoveDialog, type RowSummary } from "./row-actions";
import { messageExpert } from "./actions";

/** What a list page says after an action taken on it. */
const DONE: Record<string, { tone: string; text: string }> = {
  "cancelled-credit": { tone: "info", text: "Cancelled. The full amount is now credit on your account." },
  "cancelled-late": { tone: "info", text: "Cancelled. Because it was inside 24 hours, the expert keeps the payment." },
  cancelled: { tone: "info", text: "Cancelled. Nothing was charged." },
  move_asked: { tone: "info", text: "Sent. The expert has 6 hours to accept the new time. Until then the session stays where it is." },
  no_message: { tone: "error", text: "We could not open that conversation. You can message an expert once the booking is paid." },
};

export function DoneBanner({ code }: { code: string | string[] | undefined }) {
  const done = typeof code === "string" ? DONE[code] : undefined;
  return done ? (
    <p className={`panel ${done.tone}`} role="status">
      {done.text}
    </p>
  ) : null;
}

export function FormatTag({ format }: { format: FormatCode }) {
  return <span className="pill h-[26px]! bg-sand px-2.5! text-[13px]!">{FORMATS[format].label}</span>;
}

export function StatusPill({ b }: { b: LearnerBooking }) {
  return (
    <span className={`pill ${BOOKING_TONE[b.status] ?? "bg-sand"}`}>
      {b.group === "upcoming" ? <CircleCheck size={15} aria-hidden="true" /> : null}
      {learnerStatusLabel(b.status, b.format)}
      {b.group === "upcoming" && b.format === "one_to_one" && b.paid_at ? " · Paid" : ""}
    </span>
  );
}

export const paid = (b: LearnerBooking) => formatKES(b.price_kes - b.discount_kes);

export function summaryOf(b: LearnerBooking, at: string, ends: string): RowSummary {
  return {
    title: b.title,
    expert: b.teacher_name,
    initials: initials(b.teacher_name),
    date: formatDate(at),
    time: `${formatTime(at)} – ${formatTime(ends)}`,
    length: formatDuration(b.duration_minutes),
    price: paid(b),
  };
}

/** Open the pair's conversation, or start one for a paid booking. */
export function MessageLink({ b, back, className = "btn3", label }: { b: LearnerBooking; back: string; className?: string; label?: string }) {
  const text = (
    <>
      <MessageSquare size={17} aria-hidden="true" />
      {label ?? `Message ${b.teacher_name.split(" ")[0]}`}
    </>
  );
  if (b.thread_id) {
    return (
      <Link className={className} href={`/messages/${b.thread_id}`}>
        {text}
      </Link>
    );
  }
  if (b.status === "requested" || b.status === "awaiting_payment" || (!b.paid_at && b.group === "cancelled")) return null;
  return (
    <form action={messageExpert} className="contents">
      <input type="hidden" name="booking_id" value={b.id} />
      <input type="hidden" name="back" value={back} />
      <button className={className} type="submit">
        {text}
      </button>
    </form>
  );
}

/**
 * Everything a learner can do with one booking, from a list: join, pay, confirm, reschedule, cancel,
 * message, and open the booking. `at` and `ends` are the session shown (a group has several).
 * The filled button is kept for what needs doing now.
 */
export function BookingActions({ b, at, ends, now, back, moves, view = true }: { b: LearnerBooking; at: string; ends: string; now: number; back: string; moves: Map<string, Reschedule>; view?: boolean }) {
  const nowD = new Date(now);
  const first = b.teacher_name.split(" ")[0];
  const live = ["accepted", "scheduled", "in_progress"].includes(b.status) && !(b.seat && b.seat.run_status === "cancelled");
  const link = b.seat ? b.seat.meeting_link : b.meeting_link;
  const join = live ? joinState(at, ends, nowD) : null;
  const move = moves.get(b.id);
  const movable = !move && b.kind !== "seat" && ["accepted", "scheduled"].includes(b.status) && new Date(b.starts_at).getTime() - now > 24 * 3600_000;
  const cancel = cancelPreview(b.status, b.starts_at, nowD, first);
  const summary = summaryOf(b, at, ends);
  const online = b.mode === "online" || b.mode === "hybrid";
  return (
    <div className="flex flex-col gap-2">
      {b.status === "requested" || b.status === "awaiting_payment" ? (
        <Link className="btn w-full" href={`/checkout/${b.id}/pay`}>
          <Wallet size={18} aria-hidden="true" />
          Finish paying
        </Link>
      ) : null}
      {b.status === "awaiting_confirmation" ? (
        <Link className="btn w-full" href={`/bookings/${b.id}/confirm`}>
          Confirm the lesson <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
      {b.status === "confirmed" && !b.reviewed ? (
        <Link className="btn2 w-full" href="/reviews">
          <Star size={18} aria-hidden="true" />
          Write a review
        </Link>
      ) : null}
      {join && join.state !== "over" && online ? (
        link && join.state === "open" ? (
          <a className="btn w-full" href={link} target="_blank" rel="noreferrer">
            <Video size={18} aria-hidden="true" />
            {JOIN_LABELS[b.format]}
          </a>
        ) : (
          <span className="flex flex-col gap-1">
            <span className="btn2 w-full cursor-not-allowed opacity-60" aria-disabled="true">
              <Video size={18} aria-hidden="true" />
              {JOIN_LABELS[b.format]}
            </span>
            <span className="text-center text-[13.5px] leading-[18px] text-ink-2">
              {link ? (
                <>
                  Opens at <span className="mono">{formatTime(join.state === "early" ? join.opensAt : at)}</span>
                  {dayKey(at) !== dayKey(nowD) ? " on the day" : ""}
                </>
              ) : (
                `${first} adds the meeting link before it starts.`
              )}
            </span>
          </span>
        )
      ) : null}
      {live && !online ? <span className="text-[14px] leading-5 text-ink-2">In person: {LEARNER_MODES[b.mode] ?? b.mode}.</span> : null}
      {move ? (
        <Link href={`/bookings/${b.id}`} className="flex items-start gap-2 rounded-[12px] bg-orange-wash px-3 py-2 text-[14px] leading-5 text-ink no-underline shadow-[inset_0_0_0_1.5px_var(--orange)]">
          <CalendarClock size={17} aria-hidden="true" className="mt-0.5 flex-none text-orange" />
          <span>
            {move.by_role === "payer" ? "You asked to move this to " : `${first} asks to move this to `}
            <span className="mono">
              {formatWeekday(move.new_starts_at)}, {formatTime(move.new_starts_at)}
            </span>
            . {move.by_role === "payer" ? "Waiting for an answer." : "Answer it."}
          </span>
        </Link>
      ) : null}
      {movable || cancel.kind !== "closed" ? (
        <div className="flex flex-wrap gap-2 [&>button]:flex-1">
          {movable ? <MoveDialog bookingId={b.id} back={back} summary={summary} minDate={dayKey(new Date(now + 86_400_000))} times={TIME_OPTIONS} /> : null}
          {cancel.kind !== "closed" ? <CancelDialog bookingId={b.id} back={back} summary={summary} preview={cancel.text} late={cancel.kind === "released"} /> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <MessageLink b={b} back={back} />
        {view ? (
          <Link className="btn3" href={`/bookings/${b.id}`}>
            View booking <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
