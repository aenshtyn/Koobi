import Link from "next/link";
import { Bell } from "lucide-react";
import { getNotifications } from "@/lib/data/account";
import { render } from "@/domain/messages";
import { formatDate, formatTime } from "@/domain/format";
import { markAllRead } from "@/app/(app)/notifications/actions";

/** X1: everything we sent you, newest first. Shared by the learner and teacher areas. */
export async function Inbox() {
  const { items, templates, timeZone } = await getNotifications();
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t1">Notifications</h1>
        {unread ? (
          <form action={markAllRead}>
            <button className="btn3" type="submit">
              Mark all read
            </button>
          </form>
        ) : null}
      </div>
      {items.length ? (
        <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
          {items.map((n) => {
            const text = render(templates[n.template] ?? n.template, n.payload, { timeZone, baseUrl: "" });
            const link = typeof n.payload.link === "string" ? n.payload.link : null;
            const body = (
              <span className="flex flex-col gap-1">
                <span className={n.read_at ? "" : "font-semibold"}>{text}</span>
                <span className="help mono">
                  {formatDate(n.created_at)} {formatTime(n.created_at)}
                </span>
              </span>
            );
            return (
              <li key={n.id} className={n.read_at ? "" : "bg-orange-wash/40"}>
                {link ? (
                  <Link href={link} className="block px-5 py-4 text-ink no-underline hover:bg-orange-wash">
                    {body}
                  </Link>
                ) : (
                  <div className="px-5 py-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <Bell size={24} aria-hidden="true" />
          <p className="font-semibold">Nothing yet.</p>
          <p className="help">Booking updates, reminders and receipts appear here, and by SMS if you allow it in Settings.</p>
        </div>
      )}
    </div>
  );
}
