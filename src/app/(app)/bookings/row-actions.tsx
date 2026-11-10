"use client";
import { CalendarClock, CircleX, Info } from "lucide-react";
import { Modal, ModalClose } from "@/components/app/modal";
import { useEchoAction } from "@/lib/use-echo-action";
import { CANCEL_REASONS } from "@/domain/learning";
import { askToMove, cancelBooking, type FormState } from "./actions";

/** What the dialogs show about the booking they act on. Built on the server from the booking. */
export type RowSummary = { title: string; expert: string; date: string; time: string; length: string; price: string; initials: string };

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

function Summary({ s }: { s: RowSummary }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] bg-orange-wash px-4 py-3">
      <span className="av sm" aria-hidden="true">
        {s.initials}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{s.title}</span>
        <span className="text-[15px] text-ink-2">{s.expert}</span>
        <span className="text-[14px] leading-5">
          <span className="mono">
            {s.date} · {s.time}
          </span>{" "}
          · {s.length}
        </span>
        <span className="mono text-[14px] leading-5">{s.price}</span>
      </span>
    </div>
  );
}

/** Reschedule: pick a new date and time; the expert has six hours to accept. One-to-one lessons only. */
export function MoveDialog({ bookingId, back, summary, minDate, times, triggerClass = "btn2" }: { bookingId: string; back: string; summary: RowSummary; minDate: string; times: string[]; triggerClass?: string }) {
  const [state, action, pending] = useEchoAction<FormState>(askToMove, {});
  return (
    <Modal
      title="Reschedule your session"
      triggerClass={triggerClass}
      trigger={
        <>
          <CalendarClock size={18} aria-hidden="true" />
          Reschedule
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="booking_id" value={bookingId} />
        <input type="hidden" name="back" value={back} />
        <p className="text-ink-2">Choose a new date and time that works for you.</p>
        <Summary s={summary} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor={`mv-date-${bookingId}`}>
              New date
            </label>
            <input id={`mv-date-${bookingId}`} name="date" type="date" className="input" min={minDate} required defaultValue={state.values?.date} />
          </div>
          <div className="field">
            <label className="label" htmlFor={`mv-time-${bookingId}`}>
              New start time
            </label>
            <span className="sel block">
              <select id={`mv-time-${bookingId}`} name="time" className="select" required defaultValue={state.values?.time ?? ""}>
                <option value="" disabled>
                  Choose a time
                </option>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>
        <p className="flex items-start gap-2 text-[14px] leading-5 text-ink-2">
          <Info size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          All times are East Africa Time. {summary.expert.split(" ")[0]} has 6 hours to accept. Until then the session stays where it is and your payment does not change.
        </p>
        <ErrorLine error={state.error} />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ModalClose className="btn2 ink">Keep the time</ModalClose>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Sending…" : "Ask to reschedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Cancel: the booking, an optional reason, and what Koobi's cancellation policy does right now. */
export function CancelDialog({ bookingId, back, summary, preview, late, triggerClass = "btn2 ink" }: { bookingId: string; back: string; summary: RowSummary; preview: string; late: boolean; triggerClass?: string }) {
  const [state, action, pending] = useEchoAction<FormState>(cancelBooking, {});
  return (
    <Modal
      title="Cancel booking"
      triggerClass={triggerClass}
      trigger={
        <>
          <CircleX size={18} aria-hidden="true" />
          Cancel
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="booking_id" value={bookingId} />
        <input type="hidden" name="back" value={back} />
        <p className="text-ink-2">Are you sure you want to cancel this booking?</p>
        <Summary s={summary} />
        <div className="field">
          <label className="label" htmlFor={`cx-reason-${bookingId}`}>
            Reason for cancelling (optional)
          </label>
          <span className="sel block">
            <select id={`cx-reason-${bookingId}`} name="reason" className="select" defaultValue={state.values?.reason ?? ""}>
              <option value="">Select a reason</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </span>
        </div>
        <p className={`panel ${late ? "error" : "info"}`}>
          <Info size={18} aria-hidden="true" className="mt-0.5 flex-none" />
          <span>{preview}</span>
        </p>
        <ErrorLine error={state.error} />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ModalClose className="btn2 ink">Keep booking</ModalClose>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
