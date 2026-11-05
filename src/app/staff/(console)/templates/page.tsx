import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getSessionUser } from "@/lib/auth";
import { getTemplates } from "@/lib/data/staff-admin";
import { saveTemplate, sendQueuedNow } from "../admin-actions";

export const metadata: Metadata = { title: "Message templates", robots: { index: false } };

const CHANNEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email", in_app: "In the app" };

/** S22: SMS, WhatsApp and email wording (FR-NOTIF-2). Placeholders: {teacher} {learner} {when} {amount} {title} {check} {link}. */
export default function TemplatesPage(props: PageProps<"/staff/templates">) {
  return (
    <Guarded next="/staff/templates" anyOf={["concierge", "admin"]}>
      <Templates searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Templates({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, templates, user] = await Promise.all([searchParams, getTemplates(), getSessionUser()]);
  const admin = !!user?.roles.includes("admin");
  const keys = [...new Set(templates.map((t) => t.key))];
  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t1">Message templates</h1>
        {admin ? (
          <form action={sendQueuedNow}>
            <button className="btn3" type="submit">Send queued messages now</button>
          </form>
        ) : null}
      </div>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      <p className="help">
        Placeholders: <span className="mono">{"{teacher} {learner} {when} {amount} {title} {check} {link}"}</span>. Times are written in the reader’s time zone. WhatsApp sends only
        templates Meta has approved; put the approved name here and keep the wording identical.
      </p>
      {keys.map((k) => (
        <section key={k} className="card flex flex-col gap-4 p-5" aria-label={k}>
          <h2 className="t3 mono">{k}</h2>
          {templates.filter((t) => t.key === k).map((t) => (
            <form key={t.id} action={saveTemplate} className="flex flex-col gap-2">
              <input type="hidden" name="template_id" value={t.id} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label">{CHANNEL[t.channel] ?? t.channel} · v{t.version}{t.urgent ? " · sent in quiet hours" : ""}</span>
                {admin ? (
                  <label className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" name="active" defaultChecked={t.active} /> Active
                  </label>
                ) : null}
              </div>
              {t.channel === "email" ? (
                <input name="subject" className="input" defaultValue={t.subject ?? ""} aria-label="Subject" disabled={!admin} />
              ) : null}
              <textarea name="body" className="input min-h-16" defaultValue={t.body} maxLength={t.channel === "sms" ? 320 : 1000} disabled={!admin} aria-label="Wording" />
              {t.channel === "whatsapp" ? (
                <input name="whatsapp_template_name" className="input mono" defaultValue={t.whatsapp_template_name ?? ""} placeholder="Approved WhatsApp template name" disabled={!admin} />
              ) : null}
              {admin ? <button className="btn3 self-start" type="submit">Save</button> : null}
            </form>
          ))}
        </section>
      ))}
    </div>
  );
}
