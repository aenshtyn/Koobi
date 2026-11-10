import Link from "next/link";
import { Suspense } from "react";
import { Bell } from "lucide-react";
import { Logo } from "@/components/ui/trust";
import { getSessionUser, requireUser, type Role } from "@/lib/auth";
import { SideNav, TabBar, type NavItem } from "./nav";
import { getUnreadCount } from "@/lib/data/account";
import { initials } from "@/domain/format";
import { UserMenu } from "./user-menu";
import { Presence } from "@/components/messages/composer";

type Props = {
  areaLabel: string;
  root: string;
  nav: NavItem[];
  /** Extra classes on the shell, e.g. the font variable and `hand-titles` for the expert workspace. */
  className?: string;
  /** Shown under the side navigation on wide screens. */
  sideExtra?: React.ReactNode;
  children: React.ReactNode;
};

/** Signed-in shell, Wazi rules: no hand lettering, 17px body, sticky bars, phone tab bar. */
export function AppShell({ areaLabel, root, nav, className, sideExtra, children }: Props) {
  return (
    <div className={`app flex min-h-dvh flex-col${className ? ` ${className}` : ""}`}>
      <header className="appbar">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3 sm:px-6">
          <Logo small href={root} />
          <span className="hidden border-l-[1.5px] border-line-2 pl-4 text-[15px] font-semibold text-ink-2 sm:inline">{areaLabel}</span>
          <span className="flex-1" />
          <Suspense fallback={null}>
            <UserChip root={root} />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 gap-8 px-4 sm:px-6">
        <aside className="hidden w-[232px] flex-none py-6 lg:block">
          <div className="sticky top-[84px] flex max-h-[calc(100dvh-100px)] flex-col gap-5 overflow-y-auto pr-1 pb-2">
            <SideNav items={nav} root={root} />
            {sideExtra}
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 py-6 pb-16">
          {children}
        </main>
      </div>
      <TabBar items={nav} root={root} />
      <Presence />
    </div>
  );
}

/** Page-level guard: wrap a signed-in page's content. Streams behind its own boundary. */
export function Guarded({ next, anyOf, children }: { next: string; anyOf?: Role[]; children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="skeleton h-[420px]" />}>
      <Guard next={next} anyOf={anyOf}>
        {children}
      </Guard>
    </Suspense>
  );
}

async function Guard({ next, anyOf, children }: { next: string; anyOf?: Role[]; children: React.ReactNode }) {
  const user = await requireUser(next, { anyOf });
  return (
    <>
      {user.dev ? (
        <div className="panel info mb-6" role="note">
          <p>
            <b>Local preview.</b> Supabase is not configured, so this screen opens without sign-in and shows no real
            records. <Link href="/dev/pages">Page map</Link>
          </p>
        </div>
      ) : null}
      {children}
    </>
  );
}

/** Name, notifications, the switch between learning and teaching (X2), and sign-out. */
async function UserChip({ root }: { root: string }) {
  const user = await getSessionUser();
  if (!user) return null;
  const unread = user.dev ? 0 : await getUnreadCount();
  const teaching = root === "/teach";
  const staff = root === "/staff";
  const isTeacher = user.roles.includes("teacher");
  return (
    <div className="flex items-center gap-3">
      {!staff ? (
        teaching ? (
          <Link className="btn3 hidden sm:inline-flex" href="/home">
            Switch to learning
          </Link>
        ) : (
          <Link className="btn3 hidden sm:inline-flex" href={isTeacher ? "/teach" : "/teach/apply"}>
            {isTeacher ? "Switch to teaching" : "Teach on Koobi"}
          </Link>
        )
      ) : null}
      {!staff ? (
        <Link className="iconbtn ghost relative" href={teaching ? "/teach/notifications" : "/notifications"} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell size={20} aria-hidden="true" />
          {unread ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-orange px-1 text-center text-[11px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span> : null}
        </Link>
      ) : null}
      <UserMenu
        name={user.dev ? "Preview user" : (user.name ?? "Your account")}
        initials={initials(user.name ?? "You") || "Y"}
        canSignOut={!user.dev}
        links={
          staff
            ? [{ href: "/staff", label: "Staff home" }]
            : teaching
              ? [
                  { href: "/teach/account", label: "Profile & Account" },
                  { href: "/teach/profile", label: "Public profile" },
                  { href: "/teach/settings", label: "Settings" },
                  { href: "/home", label: "Switch to learning" },
                ]
              : [
                  { href: "/account/settings", label: "Account settings" },
                  { href: "/account/receipts", label: "Receipts" },
                  { href: isTeacher ? "/teach" : "/teach/apply", label: isTeacher ? "Switch to teaching" : "Teach on Koobi" },
                ]
        }
      />
    </div>
  );
}
