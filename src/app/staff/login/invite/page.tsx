import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/trust";
import { Guarded } from "@/components/app/shell";
import { InviteForm } from "../form";

export const metadata: Metadata = { title: "Invite a staff member", robots: { index: false } };

export default function StaffInvitePage() {
  return (
    <div className="app flex min-h-dvh flex-col items-center px-4 pt-12 pb-16">
      <div className="flex w-full max-w-[460px] flex-col gap-6">
        <Logo small href="/staff" />
        <Link className="btn3 self-start" href="/staff/users">
          Users and roles
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="t1">Invite a staff member</h1>
          <p className="text-ink-2">
            They get an email with a link. They choose their own password and set up an authenticator app before they can open any staff
            screen. The invitation and the role are recorded in the audit log.
          </p>
        </div>
        <Guarded next="/staff/login/invite" anyOf={["admin"]}>
          <InviteForm />
        </Guarded>
      </div>
    </div>
  );
}
