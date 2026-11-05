import Link from "next/link";
import { Logo } from "./trust";

/** Calm system states (Wazi rules): what happened, what it means for money, one way forward. */
export function StatusPage({ title, body, action = { href: "/", label: "Go to the home page" }, Icon }: {
  title: string;
  body: React.ReactNode;
  action?: { href: string; label: string };
  Icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}) {
  return (
    <div className="app flex min-h-dvh flex-col">
      <header className="page-wrap py-5">
        <Logo />
      </header>
      <main id="main" className="page-wrap flex flex-1 items-start pt-10 pb-20">
        <div className="flex max-w-[520px] flex-col gap-5">
          {Icon ? <Icon size={40} aria-hidden /> : null}
          <h1 className="t1">{title}</h1>
          <div className="text-ink-2">{body}</div>
          <Link className="btn self-start" href={action.href}>
            {action.label}
          </Link>
        </div>
      </main>
    </div>
  );
}
