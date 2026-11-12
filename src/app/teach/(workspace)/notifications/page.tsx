import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { Inbox } from "@/components/app/notifications-inbox";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Guarded next="/teach/notifications">
      <Inbox />
    </Guarded>
  );
}
