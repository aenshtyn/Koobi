import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { Inbox } from "@/components/messages/inbox";

export const metadata: Metadata = { title: "Conversation" };

export default function TeachThreadPage(props: PageProps<"/teach/messages/[id]">) {
  return (
    <Guarded next="/teach/messages">
      <Thread params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Thread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, { q }] = await Promise.all([params, searchParams]);
  return <Inbox id={id} q={typeof q === "string" ? q.slice(0, 80) : ""} />;
}
