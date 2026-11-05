import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { StatusPage } from "@/components/ui/status-page";

export const metadata: Metadata = { title: "Link expired" };

export default function LinkExpired() {
  return (
    <StatusPage
      Icon={Link2Off}
      title="This link has expired"
      body={<p>Links we send by SMS or WhatsApp work for a short time and only once. Sign in to see the same page.</p>}
      action={{ href: "/signin", label: "Sign in" }}
    />
  );
}
