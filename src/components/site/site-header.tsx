import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Logo } from "@/components/ui/trust";
import { NavLinks } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="page-wrap flex items-center justify-between gap-4 py-5">
      <Logo />
      <NavLinks className="hidden items-center gap-[30px] lg:flex" />
      <div className="flex items-center gap-3.5">
        <Link className="iconbtn ghost" href="/explore" aria-label="Search learning experiences">
          <Search size={20} aria-hidden="true" />
        </Link>
        <Link className="navlink hidden sm:inline" href="/signin">
          Sign in
        </Link>
        <Link className="opill ink" href="/signin">
          Sign up
        </Link>
        <details className="relative lg:hidden">
          <summary className="iconbtn list-none [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu size={20} aria-hidden="true" />
          </summary>
          <div className="card r3 absolute right-0 top-[52px] z-30 w-[240px] p-4">
            <NavLinks className="flex flex-col gap-3" />
            <hr className="rule my-3" />
            <Link className="navlink" href="/signin">
              Sign in
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
