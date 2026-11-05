import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { ThreadList } from "@/components/messages/views";

export const metadata: Metadata = { title: "Messages" };

export default function TeachMessagesPage() {
  return (
    <Guarded next="/teach/messages">
      <ThreadList base="/teach/messages" />
    </Guarded>
  );
}
