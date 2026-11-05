import { AppShell } from "@/components/app/shell";
import { LEARNER_NAV } from "@/config/nav";

export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell areaLabel="Learning" root="/home" nav={LEARNER_NAV}>
      {children}
    </AppShell>
  );
}
