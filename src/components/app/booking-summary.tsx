import type { MyBooking } from "@/lib/data/bookings";
import { KIND_LABELS } from "@/domain/booking";
import { formatDuration, formatKES, formatTime, formatWeekday, initials } from "@/domain/format";
import { OFFER_MODES } from "@/domain/listing-input";

export function BookingSummary({ b }: { b: MyBooking }) {
  const total = b.price_kes - b.discount_kes;
  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="av" aria-hidden="true">
            {initials(b.teacher_name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="t3">
              {KIND_LABELS[b.kind] ?? b.kind} with {b.teacher_name}
            </span>
            <span className="help">{b.title}</span>
          </div>
        </div>
        <hr className="rule" />
        <dl className="grid grid-cols-2 gap-2 text-[15px]">
          <dt className="text-ink-2">When</dt>
          <dd className="mono text-right">
            {formatWeekday(b.starts_at)} {formatTime(b.starts_at)}
          </dd>
          <dt className="text-ink-2">Length</dt>
          <dd className="text-right">{formatDuration(b.duration_minutes)}</dd>
          <dt className="text-ink-2">Where</dt>
          <dd className="text-right">{OFFER_MODES.find(([c]) => c === b.mode)?.[1] ?? b.mode}</dd>
          <dt className="text-ink-2">Learner</dt>
          <dd className="text-right">{b.learner_alias}</dd>
        </dl>
      </div>
      <div className="card r2 flex flex-col p-5">
        <div className="kv">
          <span>{b.kind === "trial" ? "Lesson at the full price" : "Lesson"}</span>
          <span>{formatKES(b.price_kes)}</span>
        </div>
        {b.discount_kes ? (
          <div className="kv">
            <span>Trial discount</span>
            <span>− {formatKES(b.discount_kes)}</span>
          </div>
        ) : null}
        <div className="kv">
          <span>Booking fee</span>
          <span className="font-sans! font-semibold text-forest">Included</span>
        </div>
        <div className="kv total">
          <span>Total</span>
          <span className="price-lg">{formatKES(total)}</span>
        </div>
      </div>
    </div>
  );
}
