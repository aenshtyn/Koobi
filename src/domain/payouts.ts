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
