"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import {
  Bell,
  BadgeCheck, Banknote, BookOpen, CalendarDays, ClipboardCheck, ClipboardList, Compass, FileText, Gavel, House, Inbox,
  Layers, ListChecks, MessagesSquare, Receipt, RefreshCw, Scale, Settings, ShieldCheck, SlidersHorizontal, Tags, UserRound,
  Users, Wallet, BarChart3, ScrollText, Clock,
} from "lucide-react";

const ICONS = {
  house: House, compass: Compass, calendar: CalendarDays, messages: MessagesSquare, user: UserRound, receipt: Receipt,
  users: Users, layers: Layers, inbox: Inbox, wallet: Wallet, badge: BadgeCheck, settings: Settings, book: BookOpen,
  clock: Clock, check: ClipboardCheck, list: ClipboardList, listchecks: ListChecks, gavel: Gavel, banknote: Banknote,
  refresh: RefreshCw, scale: Scale, file: FileText, tags: Tags, sliders: SlidersHorizontal, shield: ShieldCheck,
  chart: BarChart3, scroll: ScrollText, bell: Bell,
} as const;
export type IconName = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: IconName; section?: string; tab?: boolean };

function isOn(path: string, href: string, root: string) {
  return href === root ? path === root : path === href || path.startsWith(`${href}/`);
}

type Props = { items: NavItem[]; root: string };

/* The active state reads the URL, so it streams in; the static list renders in the shell. */
export function SideNav(props: Props) {
  return (
    <Suspense fallback={<SideNavList {...props} path="" />}>
      <SideNavActive {...props} />
    </Suspense>
  );
}

function SideNavActive(props: Props) {
  return <SideNavList {...props} path={usePathname()} />;
}

function SideNavList({ items, root, path }: Props & { path: string }) {
  return (
    <nav aria-label="Sections" className="sidenav flex flex-col gap-0.5">
      {items.map((it, i) => {
        const Icon = ICONS[it.icon];
        const head = it.section && it.section !== items[i - 1]?.section ? it.section : null;
        return (
          <div key={it.href} className="contents">
            {head ? <span className="sec">{head}</span> : null}
            <Link href={it.href} aria-current={isOn(path, it.href, root) ? "page" : undefined}>
              <Icon size={20} aria-hidden="true" />
              {it.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function TabBar(props: Props) {
  return (
    <Suspense fallback={<TabBarList {...props} path="" />}>
      <TabBarActive {...props} />
    </Suspense>
  );
}

function TabBarActive(props: Props) {
  return <TabBarList {...props} path={usePathname()} />;
}

function TabBarList({ items, root, path }: Props & { path: string }) {
  return (
    <nav aria-label="Sections" className="tabbar lg:hidden">
      {items
        .filter((i) => i.tab)
        .map((it) => {
          const Icon = ICONS[it.icon];
          return (
            <Link key={it.href} href={it.href} aria-current={isOn(path, it.href, root) ? "page" : undefined}>
              <Icon size={24} aria-hidden="true" />
              {it.label}
            </Link>
          );
        })}
    </nav>
  );
}
