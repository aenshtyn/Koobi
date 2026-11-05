import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock } from "lucide-react";
import { AREA_LABELS, findPage, type Area, type PageSpec } from "@/config/pages";
import type { Role } from "@/lib/auth";
import { Guarded } from "./shell";

/**
 * Routes that are in the product plan but not built yet render a placeholder, so navigation
 * works end to end on the dev branch. Paths that are not in the plan are a real 404.
 */
type Props = { params: Promise<{ slug: string[] }>; prefix: string; area: Area[]; anyOf?: Role[] };

export function PlannedScreen(props: Props) {
  return (
    <Suspense fallback={<div className="skeleton h-[320px]" />}>
      <Planned {...props} />
    </Suspense>
  );
}

export async function resolvePlanned(params: Promise<{ slug: string[] }>, prefix: string, area: Area[]) {
  const { slug } = await params;
  const path = `${prefix}/${slug.join("/")}`.replace(/\/+/g, "/");
  const page = findPage(path);
  if (!page || page.built || !area.includes(page.area)) notFound();
  return { page, path };
}

async function Planned({ params, prefix, area, anyOf }: Props) {
  const { page, path } = await resolvePlanned(params, prefix, area);
  return <PlannedBody page={page} path={path} anyOf={anyOf} />;
}

export function PlannedBody({ page, path, anyOf }: { page: PageSpec; path: string; anyOf?: Role[] }) {
  return (
    <Guarded next={path} anyOf={anyOf}>
      <div className="flex max-w-[640px] flex-col gap-5">
        <span className="pill self-start">
          {AREA_LABELS[page.area]} · {page.group}
        </span>
        <h1 className="t1">{page.name}</h1>
        <p className="text-ink-2">{page.purpose}</p>
        <div className="empty">
          <p className="flex items-center gap-2 font-semibold">
            <CalendarClock size={20} aria-hidden="true" />
            {page.sprint ? (
              <span>
                Planned for sprint <span className="mono">{page.sprint}</span> of <span className="mono">8</span>
              </span>
            ) : (
              <span>Planned for v1, after the launch decision</span>
            )}
          </p>
          <p className="help">
            Screen <span className="mono">{page.id}</span> · route <span className="mono">{page.route}</span>
          </p>
          <Link className="btn3" href="/dev/pages">
            See every screen and its status
          </Link>
        </div>
      </div>
    </Guarded>
  );
}
