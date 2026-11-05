import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { ChecksPage } from "../checks-page";

export const metadata: Metadata = { title: "Demo lesson" };

/** T8: a short recorded lesson, scored (FR-VER-4). */
export default function DemoPage(props: PageProps<"/teach/verification/demo">) {
  return (
    <Guarded next="/teach/verification/demo">
      <Body searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ChecksPage title="Demo lesson" types={["demo_lesson"]} path="/teach/verification/demo" done={typeof sp.done === "string" ? sp.done : undefined} />;
}
