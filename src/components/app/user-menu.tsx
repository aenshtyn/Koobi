"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

/** The name in the top bar, opening a short menu: account pages, the switch between areas, sign out. */
export function UserMenu({ name, initials, links, canSignOut }: { name: string; initials: string; links: { href: string; label: string }[]; canSignOut: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent py-1 pr-2 pl-1 font-[inherit] text-ink hover:bg-sand"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="av sm" aria-hidden="true">
          {initials}
        </span>
        <span className="hidden max-w-[160px] truncate text-[15px] font-semibold sm:inline">{name}</span>
        <ChevronDown size={16} aria-hidden="true" className="hidden text-ink-2 sm:block" />
      </button>
      {open ? (
        <div role="menu" className="card absolute top-full right-0 z-30 mt-2 flex w-[236px] flex-col p-2!">
          {links.map((l) => (
            <Link key={l.href} role="menuitem" href={l.href} className="rounded-[10px] px-3 py-2.5 text-[15px] font-semibold text-ink no-underline hover:bg-orange-wash" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          {canSignOut ? (
            <form action={signOut} className="mt-1 border-t border-dashed border-line-2 pt-1">
              <button role="menuitem" type="submit" className="flex w-full cursor-pointer items-center gap-2 rounded-[10px] border-0 bg-transparent px-3 py-2.5 text-left font-[inherit] text-[15px] font-semibold text-ink hover:bg-orange-wash">
                <LogOut size={18} aria-hidden="true" />
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
