import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { ThreadList } from "@/components/messages/views";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <Guarded next="/messages">
      <ThreadList base="/messages" />
    </Guarded>
  );
}
