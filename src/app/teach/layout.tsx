import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { AppShell } from "@/components/app/shell";
import { TEACHER_NAV } from "@/config/nav";
import { kalam } from "@/lib/fonts";

export default function TeachLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      areaLabel="Teaching"
      root="/teach"
      nav={TEACHER_NAV}
      className={`${kalam.variable} hand-titles`}
      sideExtra={
        <div className="flex flex-col gap-2 rounded-[16px] bg-forest-wash p-4">
          <span className="flex items-center gap-2 font-semibold">
            <Rocket size={18} aria-hidden="true" className="text-orange" />
            Grow your impact
          </span>
          <span className="text-[14px] leading-5 text-ink-2">Reach more learners and grow your income with Koobi.</span>
          <Link className="btn3 self-start" href="/teach/tips">
            Explore tips <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
