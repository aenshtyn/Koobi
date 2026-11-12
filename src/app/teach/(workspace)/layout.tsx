import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Rocket } from "lucide-react";
import { AppShell } from "@/components/app/shell";
import { TEACHER_NAV } from "@/config/nav";
import { kalam } from "@/lib/fonts";
import { getSessionUser } from "@/lib/auth";
import { getMyTeacher } from "@/lib/data/listings";

/**
 * The expert dashboard. It opens only once the application is approved: until then every address
 * under /teach leads to the application or its status page. A visitor who is not signed in passes
 * through, and the page's own guard sends them to sign in.
 */
export default function TeachLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="app min-h-dvh p-6"><div className="skeleton mx-auto h-[420px] max-w-[1280px]" /></div>}>
      <ApprovedOnly>
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
      </ApprovedOnly>
    </Suspense>
  );
}

async function ApprovedOnly({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user && !user.dev) {
    const teacher = await getMyTeacher();
    if (!teacher || teacher.application_status === "draft" || teacher.application_status === "more_info") redirect("/teach/apply");
    if (teacher.application_status !== "approved") redirect("/teach/apply/status");
  }
  return <>{children}</>;
}
