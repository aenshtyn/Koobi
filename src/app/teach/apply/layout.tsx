import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/ui/trust";
import { kalam } from "@/lib/fonts";
import { brand } from "@/config/brand";

const POINTS = ["Teach one-to-one lessons, group classes, workshops and programmes", "Reach learners in Kenya and abroad", "Be paid every week by M-Pesa"];

/**
 * The application has its own frame, without the dashboard's menu: the dashboard opens only once the
 * application is approved.
 */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`app ${kalam.variable} hand-titles flex min-h-dvh flex-col`}>
      <header className="appbar">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3 sm:px-6">
          <Logo small href="/" />
          <span className="hidden border-l-[1.5px] border-line-2 pl-4 text-[15px] font-semibold text-ink-2 sm:inline">Expert application</span>
          <span className="flex-1" />
          <Link className="btn3" href="/home">
            Back to {brand.name}
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 gap-8 px-4 sm:px-6">
        <aside className="hidden w-[250px] flex-none py-8 lg:block">
          <div className="sticky top-[92px] flex flex-col gap-5 rounded-[20px] bg-orange-wash p-5">
            <p className="text-[22px] leading-7 font-bold [font-family:var(--font-display)]">Share your expertise. Inspire more learners.</p>
            <ul className="flex flex-col gap-3 text-[15px] leading-5">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-forest text-white">
                    <Check size={13} aria-hidden="true" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-2">You do not need a university degree. Practical experience counts.</p>
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 py-6 pb-16 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
