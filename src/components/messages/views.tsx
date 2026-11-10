import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, MessagesSquare } from "lucide-react";
import { getThread, getThreads } from "@/lib/data/matching";
import { formatDayMonth, initials } from "@/domain/format";
import { Bubble } from "./bubble";
import { Composer, MarkRead } from "./composer";

export async function ThreadList({ base }: { base: "/messages" | "/teach/messages" }) {
  const threads = await getThreads();
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="t1">Messages</h1>
        <p className="text-ink-2">Phone numbers and email addresses stay hidden until the first paid booking.</p>
      </div>
      {threads.length ? (
        <ul className="card flex flex-col p-0!">
          {threads.map((t, i) => (
            <li key={t.id} className={i ? "border-t border-dashed border-line-2" : ""}>
              <Link href={`${base}/${t.id}`} className="flex items-start gap-3 px-5 py-4 text-ink no-underline hover:bg-orange-wash">
                <span className="av sm" aria-hidden="true">
                  {initials(t.other_name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{t.other_name}</span>
                    <span className="mono text-xs text-ink-2">{formatDayMonth(t.last_at)}</span>
                  </span>
                  <span className="text-sm text-ink-2">{t.title}</span>
                  <span className="truncate text-[15px]">{t.last_body ?? "No messages yet."}</span>
                </span>
                {t.unread ? (
                  <span className="mono inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-orange px-2 text-xs text-white" aria-label={`${t.unread} unread`}>
                    {t.unread}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <MessagesSquare size={24} aria-hidden="true" />
          <p className="font-semibold">No messages yet.</p>
          <p className="help">A conversation opens when a learner accepts a teacher from a shortlist.</p>
        </div>
      )}
    </div>
  );
}

export async function ThreadView({ id, base }: { id: string; base: "/messages" | "/teach/messages" }) {
  const data = await getThread(id);
  if (!data) notFound();
  const { thread, messages, me } = data;
  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <MarkRead threadId={thread.id} count={messages.length} />
      <div className="flex flex-col gap-1">
        <Link className="btn3 self-start" href={base}>
          All messages
        </Link>
        <h1 className="t2">{thread.other_name}</h1>
        <p className="text-sm text-ink-2">{thread.title}</p>
      </div>
      {!thread.contact_revealed ? (
        <div className="panel info items-center" role="note">
          <EyeOff size={20} aria-hidden="true" />
          <p>Phone numbers and emails are hidden until the first paid booking. Keep talking here; it protects you both.</p>
        </div>
      ) : null}
      <ol className="flex flex-col gap-3" aria-label="Messages">
        {messages.length ? (
          messages.map((m, i) => {
            const mine = m.sender_user_id === me;
            return (
              <li key={m.id} id={i === messages.length - 1 ? "latest" : undefined} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="w-full">
                  <Bubble m={m} mine={mine} from={thread.other_name} stamp={formatDayMonth(m.created_at)} />
                </div>
              </li>
            );
          })
        ) : (
          <li className="help">Say hello and agree a time for the first lesson.</li>
        )}
      </ol>
      <Composer threadId={thread.id} base={base} canAttach={thread.contact_revealed} />
    </div>
  );
}
