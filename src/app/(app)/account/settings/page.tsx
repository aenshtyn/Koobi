import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getSettings } from "@/lib/data/account";
import { formatDate } from "@/domain/format";
import { requestData } from "../actions";
import Link from "next/link";
import { PrefsForm } from "../forms";
import { getSessionUser } from "@/lib/auth";
import { EmailForm, PasswordForm, PhoneForm, SignOutEverywhere } from "./security-forms";

export const metadata: Metadata = { title: "Settings" };

const DONE: Record<string, string> = {
  prefs: "Message choices saved.",
  email: "Email address changed. Use the new one to sign in from now on.",
  phone: "Phone number confirmed and saved.",
  export: "Export requested.",
  erasure: "Erasure requested. An admin handles it and the status shows below. Payment records are kept as the law requires.",
};
const REQ: Record<string, string> = { requested: "Requested", in_progress: "In progress", completed: "Done", rejected: "Not possible" };

/** L26: sign-in details (email, password, phone), notifications, data requests (FR-ACC-7, FR-NOTIF-1). */
export default function SettingsPage(props: PageProps<"/account/settings">) {
  return (
    <Guarded next="/account/settings">
      <Settings searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { profile, prefs, followReady, requests }, user] = await Promise.all([searchParams, getSettings(), getSessionUser()]);
  const email = user?.email ?? profile?.email ?? null;
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <h1 className="t1">Settings</h1>
      {done ? (
        <p className="panel escrow" role="status">
          {done}
        </p>
      ) : null}
      {typeof sp.error === "string" ? <p className="panel error">{sp.error}</p> : null}
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="me-h">
        <h2 id="me-h" className="t3">
          You
        </h2>
        <p className="help">
          Signed in as <span className="mono break-all">{email ?? profile?.phone_e164 ?? "—"}</span>
        </p>
        <Link className="btn2 self-start" href="/account/profile">
          Edit My Profile
        </Link>
      </section>
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="email-h">
        <h2 id="email-h" className="t3">
          Email address
        </h2>
        <EmailForm current={email} />
      </section>
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="pw-h">
        <h2 id="pw-h" className="t3">
          Password
        </h2>
        <PasswordForm />
      </section>
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="phone-h">
        <h2 id="phone-h" className="t3">
          Phone number
        </h2>
        <PhoneForm current={profile?.phone_e164 ?? null} />
      </section>
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="out-h">
        <h2 id="out-h" className="t3">
          Signed-in devices
        </h2>
        <SignOutEverywhere />
      </section>
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="msg-h">
        <h2 id="msg-h" className="t3">
          Messages
        </h2>
        <PrefsForm prefs={prefs} hasEmail={!!profile?.email} followReady={followReady} />
      </section>
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="data-h">
        <h2 id="data-h" className="t3">
          Your data
        </h2>
        <p className="help">Under the Data Protection Act 2019 you can get a copy of what we hold or ask us to erase it.</p>
        <div className="flex flex-wrap gap-3">
          <a className="btn2" href="/account/settings/export" download>
            Download my data
          </a>
          <form action={requestData}>
            <input type="hidden" name="kind" value="erasure" />
            <button className="btn3" type="submit">
              Ask to erase my account
            </button>
          </form>
        </div>
        {requests.length ? (
          <ul className="flex flex-col">
            {requests.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 border-b border-dashed border-line-2 py-2 text-[15px]">
                <span>
                  {r.kind === "export" ? "Copy of my data" : "Erase my account"} · <span className="mono">{formatDate(r.created_at)}</span>
                </span>
                <span>
                  {REQ[r.status] ?? r.status}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
