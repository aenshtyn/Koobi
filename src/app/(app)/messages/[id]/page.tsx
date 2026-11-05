import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { ThreadView } from "@/components/messages/views";

export const metadata: Metadata = { title: "Conversation" };

export default function ThreadPage(props: PageProps<"/messages/[id]">) {
  return (
    <Guarded next="/messages">
      <Thread params={props.params} />
    </Guarded>
  );
}

async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ThreadView id={id} base="/messages" />;
}
