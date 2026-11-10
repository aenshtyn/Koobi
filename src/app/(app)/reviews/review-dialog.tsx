"use client";
import { useState } from "react";
import { Send, Star } from "lucide-react";
import { Modal, ModalClose } from "@/components/app/modal";
import { useEchoAction } from "@/lib/use-echo-action";
import { submitReview, type FormState } from "../bookings/actions";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const MAX = 2000;

/** Write a review for one completed booking: stars, then what you would tell another learner. */
export function ReviewDialog({ bookingId, expert, headline, title, initials }: { bookingId: string; expert: string; headline: string | null; title: string; initials: string }) {
  const [state, action, pending] = useEchoAction<FormState>(submitReview, {});
  const [rating, setRating] = useState(Number(state.values?.rating ?? 0));
  const [length, setLength] = useState(0);
  return (
    <Modal
      title="Write a review"
      triggerClass="btn2"
      trigger={
        <>
          <Star size={18} aria-hidden="true" />
          Write a review
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="booking_id" value={bookingId} />
        <input type="hidden" name="back" value="reviews" />
        <input type="hidden" name="rating" value={rating || ""} />
        <div className="flex items-center gap-3 border-b border-dashed border-line-2 pb-4">
          <span className="av" aria-hidden="true">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">{expert}</span>
            {headline ? <span className="text-[14px] leading-5 text-ink-2">{headline}</span> : null}
          </span>
        </div>
        <p className="font-semibold">{title}</p>
        <fieldset className="field">
          <legend className="label mb-1">Your rating</legend>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating, 1 to 5 stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} ${n === 1 ? "star" : "stars"}: ${WORDS[n]}`}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-orange-wash"
                onClick={() => setRating(n)}
              >
                <Star size={28} aria-hidden="true" className={n <= rating ? "fill-marker text-marker" : "text-line-2"} />
              </button>
            ))}
            <span className="ml-2 text-[15px] text-ink-2">{WORDS[rating]}</span>
          </div>
        </fieldset>
        <div className="field">
          <label className="label" htmlFor={`rv-${bookingId}`}>
            Your feedback (optional)
          </label>
          <textarea id={`rv-${bookingId}`} name="body" className="input min-h-28" maxLength={MAX} placeholder="What would you tell another learner?" defaultValue={state.values?.body} onChange={(e) => setLength(e.target.value.length)} />
          <p className="help flex justify-between gap-3">
            <span>Shown on the learning experience with your first name. The expert can reply once.</span>
            <span className="mono flex-none">
              {length}/{MAX}
            </span>
          </p>
        </div>
        {state.error ? (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ModalClose className="btn2 ink">Cancel</ModalClose>
          <button className="btn" type="submit" disabled={pending || !rating}>
            <Send size={18} aria-hidden="true" />
            {pending ? "Posting…" : "Submit review"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
