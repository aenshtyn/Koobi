import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { PlannedBody, resolvePlanned } from "@/components/app/planned";
import { LEARNER_NAV } from "@/config/nav";

/** Planned learner and system routes at the root (/sessions, /bookings/…). Anything else is a plain 404. */
export default function PlannedRootPage(props: PageProps<"/[...slug]">) {
  return (
    <Suspense fallback={null}>
      <Resolve params={props.params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ slug: string[] }> }) {
  const { page, path } = await resolvePlanned(params, "", ["learner", "system"]);
  return (
    <AppShell areaLabel="Learning" root="/home" nav={LEARNER_NAV}>
      <PlannedBody page={page} path={path} />
    </AppShell>
  );
}
