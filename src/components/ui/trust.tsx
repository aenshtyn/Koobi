import type { Badge } from "@/domain/types";
import { formatDate, formatDayMonth } from "@/domain/format";
import { brand } from "@/config/brand";

export function Seal({ className = "", size }: { className?: string; size?: number }) {
  return <span className={`seal ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden="true" />;
}

export function Logo({ small = false, href = "/" }: { small?: boolean; href?: string }) {
  return (
    <a className={`logo${small ? " sm" : ""}`} href={href} aria-label={`${brand.name} home`}>
      <Seal />
      <span className="word">{brand.wordmark}</span>
    </a>
  );
}

/** Dated badges: passed checks only, never colour alone (seal + label + date). */
export function Badges({ badges, small = false, long = false }: { badges: Badge[]; small?: boolean; long?: boolean }) {
  if (!badges.length) return null;
  return (
    <ul className="badges" aria-label="Checks passed">
      {badges.map((b) => (
        <li key={b.label} className={`badge${small ? " sm" : ""}`}>
          <Seal />
          {b.label}
          <span className="dt">{long ? formatDate(b.passed_at) : formatDayMonth(b.passed_at)}</span>
        </li>
      ))}
    </ul>
  );
}

const CHECK_NOTES: Record<string, string> = {
  "ID checked": "National ID matched against IPRS.",
  "Certificates checked": "Certificates seen and verified with the issuer.",
  "TSC checked": "TSC registration confirmed.",
  "Experience checked": "Work history checked and two references called.",
  "Police clearance": "Certificate of Good Conduct seen.",
  "Top rated": "Consistently high ratings across completed lessons.",
};

/** The long form of the badges, for offer and profile pages. */
export function CheckLedger({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  return (
    <ul className="checks" aria-label="Checks passed">
      {badges.map((b) => (
        <li key={b.label}>
          <Seal />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">{b.label}</span>
            {CHECK_NOTES[b.label] ? <span>{CHECK_NOTES[b.label]}</span> : null}
          </span>
          <span className="dt">{formatDate(b.passed_at)}</span>
        </li>
      ))}
    </ul>
  );
}

export function EscrowPanel({ who = "The teacher or expert" }: { who?: string }) {
  return (
    <div className="panel escrow items-center">
      <Seal />
      <p>
        <b>Held in escrow.</b> {who} is paid after you confirm the session happened. If it does not happen, the full
        amount comes back to your M-Pesa.
      </p>
    </div>
  );
}
