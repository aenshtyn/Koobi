import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { StatusPage } from "@/components/ui/status-page";

export const metadata: Metadata = { title: "Offline" };

export default function Offline() {
  return (
    <StatusPage
      Icon={WifiOff}
      title="You are offline"
      body={<p>Check your data or Wi-Fi. Nothing you started has been charged; we will pick up where you left off.</p>}
      action={{ href: "/home", label: "Try again" }}
    />
  );
}
