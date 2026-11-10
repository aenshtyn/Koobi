import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { Inbox } from "@/components/messages/inbox";

export const metadata: Metadata = { title: "Messages" };

export default function TeachMessagesPage(props: PageProps<"/teach/messages">) {
  return (
    <Guarded next="/teach/messages">
      <List searchParams={props.searchParams} />
    </Guarded>
  );
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  return <Inbox q={typeof q === "string" ? q.slice(0, 80) : ""} />;
}
