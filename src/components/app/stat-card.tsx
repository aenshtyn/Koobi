import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

const TONES = {
  orange: "bg-fmt-1 text-orange-deep",
  forest: "bg-forest-tint text-forest-ink",
  sand: "bg-sand text-ink-2",
  red: "bg-error-tint text-error",
} as const;

/**
 * One number with its label and a round icon (expert workspace overview cards). The value is always
 * a real count or amount; pass 0 or "—" when there is nothing, never a sample figure.
 */
export function StatCard({ icon: Icon, value, label, sub, href, tone = "orange" }: { icon: LucideIcon; value: React.ReactNode; label: string; sub?: string; href?: string; tone?: keyof typeof TONES }) {
  const body = (
    <>
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full sm:h-12 sm:w-12 ${TONES[tone]}`} aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="mono text-[22px] leading-7 tracking-tight sm:text-[26px] sm:leading-8">{value}</span>
        <span className="text-[15px] leading-5 font-semibold">{label}</span>
        {sub ? <span className="help text-[13.5px]! leading-[18px]!">{sub}</span> : null}
      </span>
      {href ? <ArrowRight size={18} aria-hidden="true" className="hidden flex-none self-center text-ink-2 sm:block" /> : null}
    </>
  );
  const cls = "card flex flex-col items-start gap-2 p-3.5 text-ink no-underline sm:flex-row sm:gap-3.5 sm:p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-orange-wash`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
