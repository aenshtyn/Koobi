/** Payout and verification rules shown on screens (PRD §4.2, §4.9). The database applies the same. */

/** KRA PIN: a letter, nine digits, a letter (e.g. A012345678Z). */
export function normaliseKraPin(input: string): string | null {
  const v = input.replace(/\s+/g, "").toUpperCase();
  return /^[AP]\d{9}[A-Z]$/.test(v) ? v : null;
}

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending_approval: "Waiting for approval",
  approved: "Approved",
  excluded: "Held back",
  sending: "Sending",
  sent: "Paid",
  failed: "Failed, retrying",
  parked: "Stopped, Finance is checking",
  cancelled: "Cancelled, carried to next week",
};

export const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "Being built",
  pending_approval: "Waiting for approval",
  approved: "Approved",
  sending: "Sending",
  completed: "Paid",
  cancelled: "Withdrawn",
};

export const CHECK_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for you",
  in_review: "With a reviewer",
  passed: "Passed",
  failed: "Not passed",
  expired: "Expired",
};

/** The ladder (FR-VER-1). Tier 1 is identity; payout ownership is needed to be paid, not for a tier. */
export const LADDER: { tier: number; title: string; text: string; checks: { type: string; href: string }[] }[] = [
  {
    tier: 1,
    title: "Identity",
    text: "Your ID, checked against your photo. Needed before anyone can book you.",
    checks: [
      { type: "identity_iprs", href: "/teach/verification/identity" },
      { type: "payout_ownership", href: "/teach/verification/payout-number" },
    ],
  },
  {
    tier: 2,
    title: "Qualifications or experience",
    text: "Certificates, a TSC number, or evidence of your practice and two references.",
    checks: [
      { type: "certificate_kcse", href: "/teach/verification/documents" },
      { type: "certificate_degree", href: "/teach/verification/documents" },
      { type: "certificate_tsc", href: "/teach/verification/documents" },
      { type: "tsc_lookup", href: "/teach/verification/documents" },
      { type: "credential_professional", href: "/teach/verification/documents" },
      { type: "experience_evidence", href: "/teach/verification/evidence" },
      { type: "teaching_reference", href: "/teach/verification/evidence" },
    ],
  },
  { tier: 3, title: "Police clearance", text: "A Certificate of Good Conduct.", checks: [{ type: "good_conduct", href: "/teach/verification/documents" }] },
  {
    tier: 4,
    title: "Tested teaching",
    text: "A subject test for school learning experiences, or a short recorded demo lesson.",
    checks: [
      { type: "subject_test", href: "/teach/offers" },
      { type: "demo_lesson", href: "/teach/verification/demo" },
    ],
  },
  { tier: 5, title: "Track record", text: "Earned on Koobi from confirmed lessons and reviews.", checks: [] },
];

export const DOC_KINDS: Record<string, string> = {
  id_front: "ID, front",
  id_back: "ID, back",
  passport: "Passport",
  selfie: "Photo of you holding the ID",
  certificate: "Certificate",
  tsc_screenshot: "TSC record",
  good_conduct: "Certificate of Good Conduct",
  portfolio: "Portfolio or evidence",
  reference: "Reference letter",
  other: "Other",
};

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "application/pdf"];
