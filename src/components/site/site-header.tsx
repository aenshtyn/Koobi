import Link from "next/link";
import { Suspense } from "react";
import { Menu, Search } from "lucide-react";
import { Logo } from "@/components/ui/trust";
import { STAFF_ROLES, getSessionUser } from "@/lib/auth";
import { NavLinks } from "./nav-links";
import { SearchForm } from "./search-form";

/** Public header: the four pages, search, then Sign in and Sign up (or the way back in, when signed in). */
export function SiteHeader() {
  return (
    <header className="page-wrap relative flex items-center justify-between gap-4 py-5">
      <Logo />
      <NavLinks className="hidden items-center gap-[30px] lg:flex" />
      <div className="flex items-center gap-2 sm:gap-3.5">
        <details className="sm:relative">
          <summary className="iconbtn ghost list-none [&::-webkit-details-marker]:hidden" aria-label="Search learning experiences">
            <Search size={20} aria-hidden="true" />
          </summary>
          <div className="card r3 absolute top-[calc(100%-8px)] right-4 left-4 z-30 p-3! sm:top-[52px] sm:right-0 sm:left-auto sm:w-[420px]">
            <SearchForm small id="header-q" />
          </div>
        </details>
        <Suspense fallback={<Account signedIn={null} />}>
          <AccountLinks />
        </Suspense>
        <details className="relative lg:hidden">
          <summary className="iconbtn list-none [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu size={20} aria-hidden="true" />
          </summary>
          <div className="card r3 absolute right-0 top-[52px] z-30 w-[240px] p-4">
            <NavLinks className="flex flex-col gap-3" />
            <hr className="rule my-3" />
            <Suspense fallback={<Account signedIn={null} menu />}>
              <AccountLinks menu />
            </Suspense>
          </div>
        </details>
      </div>
    </header>
  );
}

async function AccountLinks({ menu = false }: { menu?: boolean }) {
  const user = await getSessionUser();
  const home = !user || user.dev ? null : user.roles.some((r) => STAFF_ROLES.includes(r)) ? "/staff" : user.roles.includes("teacher") && !user.roles.includes("learner") && !user.roles.includes("guardian") ? "/teach" : "/home";
  return <Account signedIn={home} menu={menu} />;
}

function Account({ signedIn, menu = false }: { signedIn: string | null; menu?: boolean }) {
  if (signedIn) {
    return menu ? (
      <Link className="navlink" href={signedIn}>
        My account
      </Link>
    ) : (
      <Link className="opill ink" href={signedIn}>
        My account
      </Link>
    );
  }
  if (menu) {
    return (
      <div className="flex flex-col gap-3">
        <Link className="navlink" href="/signin">
          Sign in
        </Link>
        <Link className="navlink" href="/signup">
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <>
      <Link className="navlink hidden sm:inline" href="/signin">
        Sign in
      </Link>
      <Link className="opill ink" href="/signup">
        Sign up
      </Link>
    </>
  );
}
