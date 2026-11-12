import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, MessagesSquare } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { RequestPill } from "@/components/app/request-pill";
import { Rating } from "@/components/site/offer-card";
import { Badges } from "@/components/ui/trust";
import { getMyRequest } from "@/lib/data/matching";
import { categoryByCode, FORMATS } from "@/domain/taxonomy";
import { formatDate, formatKES, formatTime, initials } from "@/domain/format";
import { slaFor } from "@/domain/matching";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { AcceptButton, DeclineForm } from "../shortlist-forms";

export const metadata: Metadata = { title: "Your request" };

export default function RequestStatusPage(props: PageProps<"/requests/[id]">) {
  return (
    <Guarded next="/home">
      <RequestStatus params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function RequestStatus({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  let view = await getMyRequest(id);
  if (!view && hasSupabase) {
    // Sent as a guest with this person's email: link it now and look again.
    const { data: linked } = await (await serverClient()).rpc("claim_guest_requests");
    if (linked) view = await getMyRequest(id);
  }
  if (!view) notFound();
  const { request: r, matches, threadId } = view;
  const sla = slaFor(r.status, r.submitted_at, new Date());
  const sent = matches.filter((m) => m.status === "sent");
  const accepted = matches.find((m) => m.status === "accepted");

  return (
    <div className="flex max-w-[860px] flex-col gap-7">
      {sp.sent ? (
        <div className="panel escrow items-center" role="status">
          <span className="seal" aria-hidden="true" />
          <p>
            <b>Request sent.</b> A person reads it and sends you three teachers or experts within 24 hours.
          </p>
        </div>
      ) : null}
      {sp.declined ? (
        <div className="panel info" role="status">
          <p>
            <b>Thanks, noted.</b> The concierge will look again and send new options.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <RequestPill status={r.status} />
          <span className="help">
            Sent <span className="mono">{formatDate(r.submitted_at)} {formatTime(r.submitted_at)}</span>
          </span>
        </div>
        <h1 className="t1">{r.subject}</h1>
        <p className="text-ink-2">{r.goal}</p>
        <p className="help">
          {categoryByCode(r.category)?.label} · {r.mode.replace("_", " ")}
          {r.budget_max_kes ? <> · up to <span className="mono">{formatKES(r.budget_max_kes)}</span> a session</> : null}
          {r.schedule_notes ? ` · ${r.schedule_notes}` : ""}
        </p>
      </div>

      {(r.status === "submitted" || r.status === "triaged") && (
        <div className="empty">
          <Clock size={24} aria-hidden="true" />
          <p className="t3">A person is on it.</p>
          <p className="help">
            You will get up to three teachers or experts, each with the checks they passed, by{" "}
            <span className="mono">{sla ? `${formatDate(sla.dueAt)} ${formatTime(sla.dueAt)}` : "tomorrow"}</span>. We will also message you on WhatsApp.
          </p>
        </div>
      )}

      {r.status === "shortlisted" && sent.length ? (
        <section className="flex flex-col gap-4" aria-labelledby="sl-h">
          <h2 id="sl-h" className="t2">
            Your shortlist
          </h2>
          <p className="text-ink-2">Choose one to start a conversation and book a trial. Nothing is paid until you book.</p>
          <ul className="grid gap-4 md:grid-cols-2">
            {sent.map((m) =>
              m.offer ? (
                <li key={m.id} className="card flex flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <span className="av" aria-hidden="true">
                      {initials(m.offer.teacher_name)}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="t3">{m.offer.teacher_name}</span>
                      <span className="help">{m.offer.teacher_headline}</span>
                    </div>
                  </div>
                  {m.concierge_reason ? <p className="text-[16px]">&ldquo;{m.concierge_reason}&rdquo;</p> : null}
                  <Badges badges={m.offer.badges} small />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/offers/${m.offer.slug}`}>{m.offer.title}</Link>
                    <span>
                      <span className="price">{formatKES(m.offer.price_kes)}</span> <span className="unit">{FORMATS[m.offer.format].unit}</span>
                    </span>
                  </div>
                  <span className="text-sm text-ink-2">
                    <Rating rating={m.offer.rating_avg} count={m.offer.review_count} />
                  </span>
                  <div className="mt-auto">
                    <AcceptButton matchId={m.id} name={m.offer.teacher_name} />
                  </div>
                </li>
              ) : null,
            )}
          </ul>
          <DeclineForm requestId={r.id} />
        </section>
      ) : null}

      {r.status === "matched" && accepted ? (
        <section className="card r2 flex flex-col gap-3 p-6" aria-labelledby="m-h">
          <h2 id="m-h" className="t2">
            You chose {accepted.offer?.teacher_name ?? "a teacher"}
          </h2>
          <p className="text-ink-2">Agree a time in messages, then book a trial. The money is held until the lesson happens.</p>
          <div className="flex flex-wrap gap-3">
            {threadId ? (
              <Link className="btn" href={`/messages/${threadId}`}>
                <MessagesSquare size={18} aria-hidden="true" />
                Open messages
              </Link>
            ) : null}
            {accepted.offer ? (
              <Link className="btn2" href={`/offers/${accepted.offer.slug}`}>
                See the learning experience and book
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {r.status === "unmatched" ? (
        <div className="panel">
          <p>
            We could not find the right person this time. We have noted what you need; <Link href="/request">post a new request</Link> or{" "}
            <Link href="/explore">browse learning experiences</Link>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
