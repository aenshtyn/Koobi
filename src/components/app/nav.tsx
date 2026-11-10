"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import {
  Bell,
  BadgeCheck, Banknote, BookOpen, CalendarDays, ClipboardCheck, ClipboardList, Compass, FileText, Gavel, House, Inbox,
  Layers, ListChecks, MessagesSquare, Receipt, RefreshCw, Scale, Settings, ShieldCheck, SlidersHorizontal, Tags, UserRound,
  Users, Wallet, BarChart3, ScrollText, Clock, Globe, Star, Ellipsis, X,
} from "lucide-react";

const ICONS = {
  house: House, compass: Compass, calendar: CalendarDays, messages: MessagesSquare, user: UserRound, receipt: Receipt,
  users: Users, layers: Layers, inbox: Inbox, wallet: Wallet, badge: BadgeCheck, settings: Settings, book: BookOpen,
  clock: Clock, check: ClipboardCheck, list: ClipboardList, listchecks: ListChecks, gavel: Gavel, banknote: Banknote,
  refresh: RefreshCw, scale: Scale, file: FileText, tags: Tags, sliders: SlidersHorizontal, shield: ShieldCheck,
  chart: BarChart3, scroll: ScrollText, bell: Bell, globe: Globe, star: Star,
} as const;
export type IconName = keyof typeof ICONS;
export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  section?: string;
  tab?: boolean;
  /** Shorter label for the phone tab bar. */
  tabLabel?: string;
  /** Other paths that belong to this item (pages folded into it). */
  also?: string[];
};

function isOn(path: string, it: NavItem, root: string) {
  if (it.href === root) return path === root;
  return [it.href, ...(it.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));
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
            <Link href={it.href} aria-current={isOn(path, it, root) ? "page" : undefined}>
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
  // "More" holds every section that has no tab of its own. It closes itself when the page changes.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === path;
  const allTabs = items.filter((i) => i.tab);
  const tabs = allTabs.length < items.length ? allTabs.slice(0, 4) : allTabs;
  const rest = items.filter((i) => !tabs.includes(i));
  const restOn = rest.some((it) => isOn(path, it, root));
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[15] flex flex-col justify-end lg:hidden">
          <button type="button" className="absolute inset-0 cursor-default border-0 bg-ink/40" aria-label="Close the menu" onClick={() => setOpenOn(null)} />
          <div className="relative flex max-h-[80dvh] flex-col gap-2 overflow-y-auto rounded-t-[22px] border-t-[1.5px] border-ink bg-card px-4 pt-4 pb-[calc(84px+env(safe-area-inset-bottom))]" role="dialog" aria-label="More sections">
            <div className="flex items-center justify-between">
              <span className="font-display text-[18px] font-bold">More</span>
              <button type="button" className="iconbtn ghost" aria-label="Close" onClick={() => setOpenOn(null)}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="More sections" className="sidenav flex flex-col gap-0.5">
              {rest.map((it, i) => {
                const Icon = ICONS[it.icon];
                const head = it.section && it.section !== rest[i - 1]?.section ? it.section : null;
                return (
                  <div key={it.href} className="contents">
                    {head ? <span className="sec">{head}</span> : null}
                    <Link href={it.href} aria-current={isOn(path, it, root) ? "page" : undefined} onClick={() => setOpenOn(null)}>
                      <Icon size={20} aria-hidden="true" />
                      {it.label}
                    </Link>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
      <nav aria-label="Sections" className="tabbar lg:hidden">
        {tabs.map((it) => {
          const Icon = ICONS[it.icon];
          return (
            <Link key={it.href} href={it.href} aria-current={!open && isOn(path, it, root) ? "page" : undefined}>
              <Icon size={24} aria-hidden="true" />
              {it.tabLabel ?? it.label}
            </Link>
          );
        })}
        {rest.length ? (
          <button type="button" aria-expanded={open} aria-current={open || restOn ? "page" : undefined} onClick={() => setOpenOn(open ? null : path)}>
            <Ellipsis size={24} aria-hidden="true" />
            More
          </button>
        ) : null}
      </nav>
    </>
  );
}
