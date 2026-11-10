import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { AppShell } from "@/components/app/shell";
import { LEARNER_NAV } from "@/config/nav";
import { kalam } from "@/lib/fonts";

export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      areaLabel="Learning"
      root="/home"
      nav={LEARNER_NAV}
      className={`${kalam.variable} hand-titles`}
      search={{ action: "/explore", placeholder: "Search for learning experiences" }}
      sideExtra={
        <div className="flex flex-col gap-2 rounded-[16px] bg-forest-wash p-4">
          <span className="flex items-center gap-2 font-semibold">
            <Rocket size={18} aria-hidden="true" className="text-orange" />
            Keep learning, keep growing
          </span>
          <span className="text-[14px] leading-5 text-ink-2">Find new skills and reach your goals with Koobi.</span>
          <Link className="btn3 self-start" href="/explore">
            Explore more <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
