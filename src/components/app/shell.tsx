import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/ui/trust";
import { getSessionUser, requireUser, type Role } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { SideNav, TabBar, type NavItem } from "./nav";

type Props = {
  areaLabel: string;
  root: string;
  nav: NavItem[];
  children: React.ReactNode;
};

/** Signed-in shell, Wazi rules: no hand lettering, 17px body, sticky bars, phone tab bar. */
export function AppShell({ areaLabel, root, nav, children }: Props) {
  return (
    <div className="app flex min-h-dvh flex-col">
      <header className="appbar">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3 sm:px-6">
          <Logo small href={root} />
          <span className="hidden border-l-[1.5px] border-line-2 pl-4 text-[15px] font-semibold text-ink-2 sm:inline">{areaLabel}</span>
          <span className="flex-1" />
          <Suspense fallback={null}>
            <UserChip />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 gap-8 px-4 sm:px-6">
        <aside className="hidden w-[232px] flex-none py-6 lg:block">
          <div className="sticky top-[84px]">
            <SideNav items={nav} root={root} />
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 py-6 pb-16">
          {children}
        </main>
      </div>
      <TabBar items={nav} root={root} />
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

async function UserChip() {
  const user = await getSessionUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-[15px] font-semibold sm:inline">{user.dev ? "Preview user" : user.name ?? "Your account"}</span>
      {user.dev ? null : (
        <form action={signOut}>
          <button className="iconbtn ghost" type="submit" aria-label="Sign out">
            <LogOut size={20} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}
