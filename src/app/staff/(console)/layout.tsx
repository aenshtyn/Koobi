import { AppShell } from "@/components/app/shell";
import { STAFF_NAV } from "@/config/nav";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell areaLabel="Staff console" root="/staff" nav={STAFF_NAV}>
      {children}
    </AppShell>
  );
}
