import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { StatusPage } from "@/components/ui/status-page";

export const metadata: Metadata = { title: "Maintenance" };

export default function Maintenance() {
  return (
    <StatusPage
      Icon={Wrench}
      title="We are making an update"
      body={<p>We will be back shortly. Lessons that are booked still happen, and money held in escrow is safe.</p>}
    />
  );
}
