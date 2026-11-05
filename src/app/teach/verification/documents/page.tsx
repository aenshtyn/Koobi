import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { ChecksPage } from "../checks-page";
import { CHECKS } from "../config";

export const metadata: Metadata = { title: "Documents" };

const TYPES = ["certificate_kcse", "certificate_degree", "certificate_tsc", "tsc_lookup", "credential_professional", "good_conduct"];

/** T5: certificates, TSC number, professional credentials and the Good Conduct certificate (FR-VER-3). */
export default function DocumentsPage(props: PageProps<"/teach/verification/documents">) {
  return (
    <Guarded next="/teach/verification/documents">
      <Body searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" && TYPES.includes(sp.type) ? sp.type : TYPES[0];
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex max-w-[680px] flex-wrap gap-2" aria-label="Document">
        {TYPES.map((t) => (
          <Link key={t} className={`chip sm${t === type ? " on" : ""}`} href={`/teach/verification/documents?type=${t}`}>
            {CHECKS[t].title}
          </Link>
        ))}
      </nav>
      <ChecksPage title="Documents" types={[type]} path={`/teach/verification/documents?type=${type}`} done={typeof sp.done === "string" ? sp.done : undefined} />
    </div>
  );
}
