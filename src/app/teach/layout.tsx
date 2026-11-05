import { AppShell } from "@/components/app/shell";
import { TEACHER_NAV } from "@/config/nav";

export default function TeachLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell areaLabel="Teaching" root="/teach" nav={TEACHER_NAV}>
      {children}
    </AppShell>
  );
}
