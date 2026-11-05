"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/explore", label: "Explore learning" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/become-an-expert", label: "Become an expert" },
  { href: "/about", label: "About" },
];

export function NavLinks({ className = "" }: { className?: string }) {
  return (
    <Suspense fallback={<Links className={className} path="" />}>
      <ActiveLinks className={className} />
    </Suspense>
  );
}

function ActiveLinks({ className }: { className: string }) {
  return <Links className={className} path={usePathname()} />;
}

function Links({ className, path }: { className: string; path: string }) {
  return (
    <nav aria-label="Main" className={className}>
      {LINKS.map((l) => {
        const on = path === l.href || path.startsWith(`${l.href}/`) || (l.href === "/explore" && path.startsWith("/offers"));
        return (
          <Link key={l.href} className="navlink" href={l.href} aria-current={on ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
