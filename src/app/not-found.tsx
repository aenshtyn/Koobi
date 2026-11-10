import { Compass } from "lucide-react";
import { StatusPage } from "@/components/ui/status-page";

export default function NotFound() {
  return (
    <StatusPage
      Icon={Compass}
      title="We cannot find that page"
      body={<p>The link may be old, or the learning experience may no longer be open.</p>}
      action={{ href: "/explore", label: "Explore learning" }}
    />
  );
}
