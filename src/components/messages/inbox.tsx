import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, CalendarCheck, Clock, EyeOff, Info, MessagesSquare, Phone, Search, UserRound } from "lucide-react";
import { getThread, getThreadContact, getThreadDetails, getThreads, type Message, type ThreadDetails, type ThreadSummary } from "@/lib/data/matching";
import { BookingPill } from "@/components/app/booking-pill";
import { formatDate, formatDayMonth, formatTime, formatWeekday, initials } from "@/domain/format";
import { dayKey } from "@/domain/schedule";
import { KIND_LABELS } from "@/domain/booking";
import { FORMATS, type FormatCode } from "@/domain/taxonomy";
import { Bubble } from "./bubble";
import { Composer, MarkRead, ScrollPane } from "./composer";

type Side = "teacher" | "learner";
type Base = "/teach/messages" | "/messages";
// Pane heights, written out in full so the stylesheet picks each one up.
const PANE = "h-[calc(100dvh-190px)] min-h-[440px] lg:h-[calc(100dvh-250px)] lg:min-h-[460px]";
const PANE_LG = "lg:h-[calc(100dvh-250px)] lg:min-h-[460px]";
const PANE_XL = "xl:h-[calc(100dvh-250px)] xl:min-h-[460px]";
const TONES = ["", "g", "r", "s"] as const;
const tone = (name: string) => TONES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TONES.length];
/** Booking states that count as a live booking between the pair. */
const LIVE = ["paid", "accepted", "scheduled", "in_progress"];

/**
 * T22 and L22: messages in three panes: conversations, the open conversation, and what it is about.
 * On a phone the list and the conversation are separate screens, with the details underneath.
 * `side` is who is reading: the expert (the default) or the learner.
 */
export async function Inbox({ id, q = "", side = "teacher" }: { id?: string; q?: string; side?: Side }) {
  const BASE: Base = side === "teacher" ? "/teach/messages" : "/messages";
  const [threads, open, details, phone] = await Promise.all([
    getThreads(),
    id ? getThread(id) : null,
    id ? getThreadDetails(id) : null,
    id ? getThreadContact(id) : null,
  ]);
  if (id && !open) notFound();

  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const short = (iso: string) => {
    const k = dayKey(iso);
    return k === today ? formatTime(iso) : k === yesterday ? "Yesterday" : formatDayMonth(iso);
  };
  const long = (iso: string) => {
    const k = dayKey(iso);
    return k === today ? "Today" : k === yesterday ? "Yesterday" : formatWeekday(iso);
  };

  // Online means seen in the last two minutes; otherwise say when.
  const seenLabel = (iso: string | null) => {
    if (!iso) return null;
    const ago = now.getTime() - new Date(iso).getTime();
    if (ago < 120_000) return { online: true, text: "Online" };
    const k = dayKey(iso);
    return { online: false, text: `Last seen ${k === today ? `today ${formatTime(iso)}` : k === yesterday ? `yesterday ${formatTime(iso)}` : formatDayMonth(iso)}` };
  };

  const needle = q.trim().toLowerCase();
  const shown = needle ? threads.filter((t) => `${t.other_name} ${t.title} ${t.last_body ?? ""}`.toLowerCase().includes(needle)) : threads;
  // The open conversation is being read now, so it no longer counts as unread.
  const unread = threads.reduce((n, t) => n + (t.id === id ? 0 : t.unread), 0);
  const suffix = needle ? `?q=${encodeURIComponent(q.trim())}` : "";

  return (
    <div className="flex max-w-[1180px] flex-col gap-5">
      <div className={`flex-wrap items-end justify-between gap-3 ${id ? "hidden lg:flex" : "flex"}`}>
        <div className="flex flex-col gap-3">
          <h1 className="t1">Messages</h1>
          <p className="text-ink-2">Talk with your {side === "teacher" ? "learners" : "experts"}. Phone numbers and email addresses stay hidden until the first paid booking.</p>
        </div>
        {unread ? (
          <span className="pill bg-orange-wash text-orange-ink">
            <span className="h-2 w-2 rounded-full bg-orange" aria-hidden="true" />
            <span>
              <span className="mono">{unread}</span> unread
            </span>
          </span>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_280px]">
        {/* ------------------------------------------------------------ conversations */}
        <section className={`card flex-col overflow-hidden p-0! lg:flex ${id ? "hidden" : "flex"} ${PANE_LG}`} aria-labelledby="conv-h">
          <div className="flex flex-col gap-3 p-4">
            <h2 id="conv-h" className="t3 flex items-center gap-2">
              <MessagesSquare size={20} aria-hidden="true" />
              Conversations
            </h2>
            <form action={id ? `${BASE}/${id}` : BASE} className="relative" role="search">
              <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-2" />
              <input name="q" className="input min-h-[46px]! py-2! pl-10! text-[16px]!" defaultValue={q} placeholder="Search conversations" aria-label="Search conversations" />
            </form>
          </div>
          {shown.length ? (
            <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-dashed border-line-2">
              {shown.map((t, i) => {
                const on = t.id === id;
                const n = on ? 0 : t.unread;
                return (
                  <li key={t.id} className={i ? "border-t border-dashed border-line-2" : ""}>
                    <Link
                      href={`${BASE}/${t.id}${suffix}`}
                      aria-current={on ? "page" : undefined}
                      className={`flex items-start gap-3 px-4 py-3.5 text-ink no-underline hover:bg-orange-wash ${on ? "bg-orange-wash shadow-[inset_3px_0_0_var(--ink)]" : ""}`}
                    >
                      <span className={`av sm ${tone(t.other_name)}`} aria-hidden="true">
                        {initials(t.other_name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate ${n ? "font-bold" : "font-semibold"}`}>{t.other_name}</span>
                          <span className="mono flex-none text-xs text-ink-2">{short(t.last_at)}</span>
                        </span>
                        <span className="truncate text-[13.5px] leading-5 text-ink-2">{t.title}</span>
                        <span className="flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[15px] ${n ? "font-semibold" : ""}`}>{t.last_body ?? "No messages yet."}</span>
                          {n ? (
                            <span className="mono inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-orange px-1.5 text-[11px] text-white" aria-label={`${n} unread`}>
                              {n}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 border-t border-dashed border-line-2 px-5 py-10 text-center">
              <MessagesSquare size={24} aria-hidden="true" className="text-ink-2" />
              {threads.length ? (
                <>
                  <p className="font-semibold">No conversations match.</p>
                  <Link className="btn3" href={id ? `${BASE}/${id}` : BASE}>
                    Clear the search
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-semibold">No messages yet.</p>
                  <p className="help">{side === "teacher" ? "A conversation opens when a learner accepts you from a shortlist." : "A conversation opens when you choose an expert from a shortlist, or message one from a paid booking."}</p>
                </>
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ the open conversation */}
        {open ? (
          <Conversation thread={open.thread} messages={open.messages} me={open.me} long={long} seen={seenLabel(details?.other_last_seen_at ?? null)} base={BASE} />
        ) : (
          <section className={`card hidden flex-col items-center justify-center gap-2 p-8 text-center lg:flex ${PANE_LG}`} aria-label="Conversation">
            <MessagesSquare size={28} aria-hidden="true" className="text-ink-2" />
            <p className="t3">{threads.length ? "Choose a conversation" : "Nothing to read yet"}</p>
            <p className="help max-w-[320px]">
              {threads.length
                ? "Pick a conversation on the left to read and reply."
                : side === "teacher"
                  ? "When a learner accepts you from a shortlist, the conversation appears here."
                  : "When you choose an expert from a shortlist or message one from a paid booking, the conversation appears here."}
            </p>
          </section>
        )}

        {/* ------------------------------------------------------------ what it is about */}
        {open ? (
          <Details thread={open.thread} details={details} phone={phone} now={now.getTime()} side={side} />
        ) : (
          <aside className={`card hidden flex-col gap-3 p-5 xl:flex ${PANE_XL}`} aria-label="Conversation details">
            <h2 className="t3 flex items-center gap-2">
              <Info size={20} aria-hidden="true" />
              Conversation details
            </h2>
            <p className="help">The learning experience, the booking and the {side === "teacher" ? "learner" : "expert"} show here once you open a conversation.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

function Conversation({ thread, messages, me, long, seen, base: BASE }: { thread: ThreadSummary; messages: Message[]; me: string; long: (iso: string) => string; seen: { online: boolean; text: string } | null; base: Base }) {
  return (
    <section className={`card flex flex-col overflow-hidden p-0! ${PANE}`} aria-label={`Conversation with ${thread.other_name}`}>
      <MarkRead threadId={thread.id} count={messages.length} />
      <div className="flex items-center gap-3 border-b border-dashed border-line-2 px-4 py-3">
        <Link className="iconbtn lg:hidden" href={BASE} aria-label="All conversations">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <span className={`av sm ${tone(thread.other_name)}`} aria-hidden="true">
          {initials(thread.other_name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{thread.other_name}</span>
          {seen ? (
            <span className="flex items-center gap-1.5 text-[13.5px] leading-5 text-ink-2">
              <span className={`h-2 w-2 flex-none rounded-full ${seen.online ? "bg-forest" : "bg-line-2"}`} aria-hidden="true" />
              {seen.text}
            </span>
          ) : (
            <span className="truncate text-[13.5px] leading-5 text-ink-2">{thread.title}</span>
          )}
        </span>
      </div>
      <ScrollPane count={messages.length} label="Messages" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {messages.length ? (
          <ol className="mt-auto flex flex-col gap-3">
            {messages.map((m, i) => {
              const mine = m.sender_user_id === me;
              const newDay = i === 0 || dayKey(messages[i - 1].created_at) !== dayKey(m.created_at);
              return (
                <li key={m.id} className="flex flex-col gap-3">
                  {newDay ? <span className="self-center rounded-full bg-sand px-3 py-0.5 text-[12.5px] leading-5 font-semibold text-ink-2">{long(m.created_at)}</span> : null}
                  <Bubble m={m} mine={mine} from={thread.other_name} />
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="m-auto flex max-w-[320px] flex-col items-center gap-2 text-center">
            <MessagesSquare size={24} aria-hidden="true" className="text-ink-2" />
            <p className="font-semibold">No messages yet.</p>
            <p className="help">Say hello and agree a time for the first lesson.</p>
          </div>
        )}
      </ScrollPane>
      <div className="border-t border-dashed border-line-2 p-3">
        <Composer threadId={thread.id} base={BASE} canAttach={thread.contact_revealed} />
      </div>
    </section>
  );
}

function Details({ thread, details, phone, now, side }: { thread: ThreadSummary; details: ThreadDetails | null; phone: string | null; now: number; side: Side }) {
  const bookings = details?.bookings ?? [];
  const next = bookings
    .filter((b) => LIVE.includes(b.status) && new Date(b.starts_at).getTime() > now - 3 * 3600_000)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const booking = next ?? bookings[0];
  const o = details?.offering;
  const teaching = side === "teacher";
  // The learner opens their own view of it, or the public page when they have not booked it yet.
  const experienceHref = !o ? null : teaching ? `/teach/offers/${o.id}` : bookings.length ? `/learning/${o.id}` : o.published ? `/offers/${o.slug}` : null;
  return (
    <aside className={`card flex flex-col gap-5 overflow-y-auto p-5 lg:col-start-2 xl:col-start-auto ${PANE_XL}`} aria-labelledby="det-h">
      <h2 id="det-h" className="t3 flex items-center gap-2">
        <Info size={20} aria-hidden="true" />
        Conversation details
      </h2>

      <div className="flex flex-col gap-3">
        <h3 className="label flex items-center gap-2">
          <BookOpen size={16} aria-hidden="true" />
          Related learning experience
        </h3>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px] bg-fmt-1 text-orange-deep" aria-hidden="true">
            <BookOpen size={22} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">{o?.title ?? thread.title}</span>
            {o ? <span className="help text-[14px]! leading-5!">{FORMATS[o.format as FormatCode]?.label ?? o.format}</span> : null}
          </span>
        </div>
        {experienceHref ? (
          <Link className="btn2 w-full justify-center" href={experienceHref}>
            View learning experience <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {details ? (
        <div className="flex flex-col gap-3 border-t border-dashed border-line-2 pt-5">
          <h3 className="label flex items-center gap-2">
            <CalendarCheck size={16} aria-hidden="true" />
            Booking status
          </h3>
          {booking ? (
            <>
              <Link href={`${teaching ? "/teach/bookings" : "/bookings"}/${booking.id}`} className="flex flex-col gap-2 rounded-[14px] bg-sand px-4 py-3 text-ink no-underline hover:bg-orange-wash">
                <span className="self-start">
                  <BookingPill status={booking.status} />
                </span>
                <span className="font-semibold">{booking.title}</span>
                <span className="text-[14px] leading-5 text-ink-2">
                  {KIND_LABELS[booking.kind] ?? "Lesson"} · <span className="mono">{formatDayMonth(booking.starts_at)}</span>, <span className="mono">{formatTime(booking.starts_at)}</span>
                </span>
              </Link>
              {bookings.length > 1 ? (
                <Link className="btn3 self-start" href={`${teaching ? "/teach/bookings" : "/bookings"}?tab=all&q=${encodeURIComponent(thread.other_name)}`}>
                  All <span className="mono">{bookings.length}</span> bookings <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : null}
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-[14px] bg-orange-wash px-4 py-3">
              <Clock size={20} aria-hidden="true" className="mt-0.5 flex-none text-orange-deep" />
              <span className="flex flex-col">
                <span className="font-semibold">Not yet booked</span>
                <span className="text-[14px] leading-5 text-ink-2">{teaching ? "This learner has made an enquiry but has not booked a session." : "You have not booked a session with this expert yet."}</span>
              </span>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-dashed border-line-2 pt-5">
        <h3 className="label flex items-center gap-2">
          <UserRound size={16} aria-hidden="true" />
          {thread.my_role === "teacher" ? "Learner" : thread.my_role === "payer" ? "Expert" : "With"}
        </h3>
        <div className="flex items-center gap-3">
          <span className={`av ${tone(thread.other_name)}`} aria-hidden="true">
            {initials(thread.other_name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">{thread.other_name}</span>
            {details ? (
              <span className="help text-[14px]! leading-5!">
                Conversation started <span className="mono">{formatDate(details.started_at)}</span>
              </span>
            ) : null}
          </span>
        </div>
        {thread.contact_revealed ? (
          phone ? (
            <p className="flex items-center gap-2 text-[15px]">
              <Phone size={16} aria-hidden="true" className="flex-none text-ink-2" />
              <span className="mono">{phone}</span>
            </p>
          ) : null
        ) : (
          <p className="flex items-start gap-2 text-[14px] leading-5 text-ink-2">
            <EyeOff size={16} aria-hidden="true" className="mt-0.5 flex-none" />
            Phone numbers and emails are hidden until the first paid booking. Keep talking here; it protects you both.
          </p>
        )}
      </div>
    </aside>
  );
}
