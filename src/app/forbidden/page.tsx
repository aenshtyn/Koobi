import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { StatusPage } from "@/components/ui/status-page";

export const metadata: Metadata = { title: "No access" };

export default function Forbidden() {
  return <StatusPage Icon={Lock} title="You do not have access to this page" body={<p>If you think you should, ask the person who manages your account.</p>} />;
}
