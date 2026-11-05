import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { ChecksPage } from "../checks-page";

export const metadata: Metadata = { title: "Evidence and references" };

/** T6: proof of practice and two references (FR-VER-3). */
export default function EvidencePage(props: PageProps<"/teach/verification/evidence">) {
  return (
    <Guarded next="/teach/verification/evidence">
      <Body searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ChecksPage title="Evidence and references" types={["experience_evidence", "teaching_reference"]} path="/teach/verification/evidence" done={typeof sp.done === "string" ? sp.done : undefined} />;
}
