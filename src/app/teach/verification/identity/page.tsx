import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { ChecksPage } from "../checks-page";

export const metadata: Metadata = { title: "Identity" };

/** T3: ID against IPRS, reviewed by a person (FR-VER-2). */
export default function IdentityPage(props: PageProps<"/teach/verification/identity">) {
  return (
    <Guarded next="/teach/verification/identity">
      <Body searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ChecksPage title="Identity" types={["identity_iprs"]} path="/teach/verification/identity" done={typeof sp.done === "string" ? sp.done : undefined} />;
}
