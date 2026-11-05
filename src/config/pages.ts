/**
 * Every screen in the product (Koobi-Build-Plan.pdf; design/PAGES.md). One source for the page
 * map at /dev/pages, the signed-in navigation and the "planned" placeholder for routes not yet
 * built. Flip `built` to true when a screen ships. Sprints follow PLAN.md §3.
 */

export type Area = "public" | "auth" | "learner" | "teacher" | "staff" | "system";

export type PageSpec = {
  id: string;
  name: string;
  /** Next.js-style pattern; null for components and message templates */
  route: string | null;
  area: Area;
  group: string;
  phase: "MVP" | "v1";
  sprint: number | null;
  built: boolean;
  purpose: string;
};

const p = (
  id: string,
  area: Area,
  group: string,
  name: string,
  route: string | null,
  sprint: number | null,
  purpose: string,
  opts: { built?: boolean; v1?: boolean } = {},
): PageSpec => ({ id, area, group, name, route, sprint, purpose, built: opts.built ?? false, phase: opts.v1 ? "v1" : "MVP" });

const B = { built: true };
const V1 = { v1: true };

export const PAGES: PageSpec[] = [
  // 1 · Public site
  p("P1", "public", "Discover", "Home", "/", 2, "Promise, search, categories, featured offers, how it works.", B),
  p("P2", "public", "Discover", "Explore", "/explore", 2, "Every approved offer with filters; request a match when results are thin.", B),
  p("P3", "public", "Discover", "Category page", "/explore/[category]", 2, "Explore filtered to one of the four public categories.", B),
  p("P4", "public", "Discover", "Offer page", "/offers/[slug]", 2, "Scope, price basis, checks with dates, next times, reviews, booking card.", B),
  p("P5", "public", "Discover", "Teacher and expert profile", "/teachers/[slug]", 2, "Proof of doing, dated checks, offers, reviews. No contact details.", B),
  p("P6", "public", "Discover", "Programme detail", "/runs/[id]", null, "Seats left, dates, minimum to run, refund at cut-off.", V1),
  p("P7", "public", "Discover", "Request a match", "/request", 3, "Ask before showing: what, when, budget; a person replies within 24 hours.", B),
  p("P8", "public", "Learn more", "How it works", "/how-it-works", 2, "Explore, book, learn, confirm; escrow explained.", B),
  p("P9", "public", "Learn more", "Pricing and promises", "/pricing", 2, "What learners pay, what experts keep, the three promises.", B),
  p("P10", "public", "Learn more", "Become an expert", "/become-an-expert", 2, "Who can teach, the checks, how payouts work.", B),
  p("P11", "public", "Learn more", "Founding members", "/founding-members", 2, "Join early in a category before it is marketed.", B),
  p("P12", "public", "Learn more", "About", "/about", 2, "Why the company exists and who runs it.", B),
  p("P13", "public", "Learn more", "Trust and safety", "/trust", 2, "What each check means, escrow, child safety, reporting a problem.", B),
  p("P14", "public", "Learn more", "Help centre", "/help", 2, "Answers to common questions.", B),
  p("P15", "public", "Legal", "Terms", "/terms", 8, "Versioned terms, pending legal review.", B),
  p("P16", "public", "Legal", "Privacy", "/privacy", 8, "Versioned privacy notice, pending ODPC registration.", B),

  // 2 · Sign in
  p("A1", "auth", "Phone OTP", "Phone number", "/signin", 1, "Sign in or sign up with a phone number.", B),
  p("A2", "auth", "Phone OTP", "Code", "/signin/code", 1, "Enter the six-digit code sent by SMS.", B),
  p("A3", "auth", "Phone OTP", "Welcome and role", "/welcome", 1, "Learning for me, for my child, or teaching.", B),

  // 3 · Learner and guardian
  p("L1", "learner", "Book", "Home", "/home", 2, "Request first, then offers and upcoming lessons.", B),
  p("L2", "learner", "Book", "Request status and shortlist", "/requests/[id]", 3, "A person is on it; then three teachers to choose from.", B),
  p("L3", "learner", "Book", "Pick a slot", "/book/[slug]", 4, "Trial, single session, package or seat; time; cancellation terms.", B),
  p("L4", "learner", "Book", "Learner and location", null, 4, "Part of Pick a slot: who is learning and where.", B),
  p("L5", "learner", "Book", "Pay by M-Pesa", "/checkout/[id]/pay", 4, "STK push, one pay button, escrow panel.", B),
  p("L6", "learner", "Book", "Pay by card", "/checkout/[id]/card", 4, "Card checkout for learners abroad.", B),
  p("L7", "learner", "Book", "Payment status", "/checkout/[id]/status", 4, "Waiting for the PIN, paid, or failed with nothing charged.", B),
  p("L8", "learner", "Book", "Booking confirmed", "/bookings/[id]/confirmed", 4, "Receipt and the teacher's response window.", B),
  p("L9", "learner", "Book", "Packages and renewal", "/packages/new", 4, "8, 12 or 16 sessions at a package price."),
  p("L10", "learner", "Book", "Managed plan", "/packages/[id]/managed-plan", 7, "In-person pairs after the first month."),
  p("L11", "learner", "Learn", "My sessions", "/sessions", 5, "Upcoming and past lessons.", B),
  p("L12", "learner", "Learn", "Booking detail", "/bookings/[id]", 5, "Status, reschedule and cancel with the rule applied.", B),
  p("L13", "learner", "Learn", "Did it happen?", "/sessions/[id]/confirm", 5, "One tap releases payment to the teacher."),
  p("L14", "learner", "Learn", "Lesson notes and progress", "/learners/[id]/progress", 5, "A note after every lesson, as a timeline."),
  p("L15", "learner", "Learn", "Leave a review", "/bookings/[id]/review", 5, "Only after a completed booking."),
  p("L16", "learner", "Problems", "Open a dispute", "/sessions/[id]/dispute", 5, "Report a problem inside the window."),
  p("L17", "learner", "Problems", "Dispute status", "/disputes/[id]", 5, "Open, reviewing, resolved."),
  p("L18", "learner", "Problems", "Ask for a replacement", "/requests/replacement", 5, "A new match within 48 hours at no cost."),
  p("L19", "learner", "Account", "Children", "/account/learners", 7, "Child profiles for the school track."),
  p("L20", "learner", "Account", "Add child and consent", "/account/learners/new", 7, "Parental consent before any child data."),
  p("L21", "learner", "Account", "Guardian ID check", "/account/identity", 7, "Required before in-person lessons for a child."),
  p("L22", "learner", "Account", "Messages", "/messages", 3, "Masked threads with teachers.", B),
  p("L23", "learner", "Account", "Thread", "/messages/[id]", 3, "One conversation; contacts stay masked until the first paid booking.", B),
  p("L24", "learner", "Account", "Receipts", "/account/receipts", 4, "Every payment and refund.", B),
  p("L25", "learner", "Account", "Credits", "/account/credits", 5, "Balance from cancellations."),
  p("L26", "learner", "Account", "Settings", "/account/settings", 7, "Name, phone, language, notifications, data requests."),

  // 4 · Teacher and expert
  p("T1", "teacher", "Join", "Apply", "/teach/apply", 2, "Profile draft, categories, employment declaration.", B),
  p("T2", "teacher", "Join", "Verification ladder", "/teach/verification", 6, "Which checks are done and what is next."),
  p("T3", "teacher", "Join", "Identity", "/teach/verification/identity", 6, "ID against IPRS."),
  p("T4", "teacher", "Join", "Payout number", "/teach/verification/payout-number", 6, "A test payout proves the M-Pesa number is yours."),
  p("T5", "teacher", "Join", "Documents", "/teach/verification/documents", 6, "Certificates and TSC number."),
  p("T6", "teacher", "Join", "Evidence and references", "/teach/verification/evidence", 6, "Proof of practice and two references."),
  p("T7", "teacher", "Join", "Subject test", "/teach/verification/subject-test/[id]", 6, "School track."),
  p("T8", "teacher", "Join", "Demo lesson", "/teach/verification/demo", 6, "A short recorded lesson, scored."),
  p("T9", "teacher", "Join", "Waitlist", "/teach/waitlist", 6, "Founding members before a category opens."),
  p("T10", "teacher", "Teach", "Dashboard", "/teach", 2, "Today, what needs doing, earnings at a glance.", B),
  p("T11", "teacher", "Teach", "My offers", "/teach/offers", 2, "Draft, in review, live, changes needed.", B),
  p("T12", "teacher", "Teach", "Offer editor", "/teach/offers/new", 2, "Scope, format, price within the band, availability.", B),
  p("T13", "teacher", "Teach", "Group runs", "/teach/runs", null, "Seats, dates, minimum to run.", V1),
  p("T14", "teacher", "Teach", "Availability", "/teach/availability", 2, "Weekly windows learners can book.", B),
  p("T15", "teacher", "Teach", "Requests inbox", "/teach/requests", 3, "Open requests that match your offers.", B),
  p("T16", "teacher", "Teach", "Apply to a request", "/teach/requests/[id]/apply", 3, "A short pitch and a price.", B),
  p("T17", "teacher", "Teach", "Bookings", "/teach/bookings", 4, "Accept within the response window.", B),
  p("T18", "teacher", "Teach", "Booking detail", "/teach/bookings/[id]", 4, "Learner, time, meeting link.", B),
  p("T19", "teacher", "Teach", "Check in and out", "/teach/sessions/[id]", 5, "Starts ten minutes before the lesson."),
  p("T20", "teacher", "Teach", "Lesson note", "/teach/sessions/[id]/note", 5, "Due before payment is released."),
  p("T21", "teacher", "Teach", "Sites", "/teach/locations", null, "Site-visit locations, checked by staff.", V1),
  p("T22", "teacher", "Earn", "Earnings", "/teach/earnings", 6, "Pending, released, paid."),
  p("T23", "teacher", "Earn", "Payouts and statements", "/teach/statements", 6, "Weekly M-Pesa payouts with withholding shown."),
  p("T24", "teacher", "Earn", "Reviews", "/teach/reviews", 5, "Reply once to each review."),
  p("T25", "teacher", "Earn", "Profile preview", "/teach/profile", 2, "What learners see.", B),
  p("T26", "teacher", "Earn", "Messages", "/teach/messages", 3, "Threads with learners and guardians.", B),
  p("T27", "teacher", "Earn", "Pro", "/teach/pro", null, "Optional subscription.", V1),
  p("T28", "teacher", "Earn", "Settings", "/teach/settings", 6, "KRA PIN, payout number, notifications."),

  // 5 · Staff console
  p("S1", "staff", "Operations", "Sign in", "/staff/login", 1, "Staff sign-in with a TOTP code.", B),
  p("S2", "staff", "Operations", "Home and queues", "/staff", 2, "Every queue with its oldest item and timer.", B),
  p("S3", "staff", "Operations", "Verification queue", "/staff/verification", 6, "Checks waiting for a reviewer."),
  p("S4", "staff", "Operations", "Check review", "/staff/verification/[id]", 6, "Documents by signed URL; every view logged."),
  p("S5", "staff", "Operations", "Listing approvals", "/staff/listings", 2, "Approve or reject profiles and offers with a reason.", B),
  p("S6", "staff", "Operations", "Request queue", "/staff/requests", 3, "Requests by age with 24 and 48 hour timers.", B),
  p("S7", "staff", "Operations", "Matching console", "/staff/requests/[id]", 3, "Ranked candidates, shortlist of three, send.", B),
  p("S8", "staff", "Operations", "Waitlist", "/staff/waitlist", 6, "Founding members per category."),
  p("S9", "staff", "Operations", "Bookings", "/staff/bookings", 4, "Oversight and overrides with a reason.", B),
  p("S10", "staff", "Operations", "Group runs", "/staff/runs", null, "Runs and cut-offs.", V1),
  p("S11", "staff", "Operations", "Disputes", "/staff/disputes", 5, "Queue with timers."),
  p("S12", "staff", "Operations", "Dispute detail", "/staff/disputes/[id]", 5, "Evidence, statements, outcome."),
  p("S13", "staff", "Money", "Payout batches", "/staff/payouts", 6, "Computed weekly; two approvers."),
  p("S14", "staff", "Money", "Refunds", "/staff/refunds", 5, "Pending and executed refunds."),
  p("S15", "staff", "Money", "Reconciliation", "/staff/reconciliation", 6, "Provider against ledger, daily."),
  p("S16", "staff", "Money", "Ledger", "/staff/ledger", 4, "Balances and journals.", B),
  p("S17", "staff", "Money", "FX review", "/staff/fx", null, "USD card settlements.", V1),
  p("S18", "staff", "Admin", "Teachers and experts", "/staff/teachers", 6, "Directory, suspend, offboard."),
  p("S19", "staff", "Admin", "Learners and guardians", "/staff/learners", 7, "Directory and erasure requests."),
  p("S20", "staff", "Admin", "Categories and taxonomy", "/staff/taxonomy", 7, "Categories, subjects, levels, places."),
  p("S21", "staff", "Admin", "Parameters and flags", "/staff/parameters", 7, "Dated rates and feature flags."),
  p("S22", "staff", "Admin", "Message templates", "/staff/templates", 7, "SMS, WhatsApp and email wording."),
  p("S23", "staff", "Admin", "Staff and roles", "/staff/users", 7, "Concierge, reviewer, finance, admin."),
  p("S24", "staff", "Admin", "Audit log", "/staff/audit", 7, "Every sensitive read and write."),
  p("S25", "staff", "Admin", "Pilot metrics", "/staff/reports/pilot", 7, "The six pilot thresholds, weekly."),
  p("S26", "staff", "Admin", "Reports", "/staff/reports", null, "Operations, finance and teacher reports.", V1),

  // 6 · System
  p("X1", "system", "States", "Notifications", "/notifications", 7, "Everything we sent you."),
  p("X2", "system", "States", "Role switch", null, 7, "Switch between learning and teaching."),
  p("X3", "system", "States", "Not found", null, 1, "Calm, with a way back.", B),
  p("X4", "system", "States", "Forbidden", "/forbidden", 1, "You do not have access to this page.", B),
  p("X5", "system", "States", "Server error", null, 1, "Something broke; nothing was charged.", B),
  p("X6", "system", "States", "Link expired", "/link-expired", 1, "Signed links last a short time.", B),
  p("X7", "system", "States", "Offline", "/offline", 1, "Shown by the app when the connection drops.", B),
  p("X8", "system", "States", "Maintenance", "/maintenance", 1, "Planned downtime.", B),
  p("X9", "system", "Messages", "SMS and WhatsApp templates", null, 7, "Approved templates per event."),
  p("X10", "system", "Messages", "Email templates", null, 7, "Receipts and statements."),
];

export const AREA_LABELS: Record<Area, string> = {
  public: "Public site",
  auth: "Sign in",
  learner: "Learner and guardian",
  teacher: "Teacher and expert",
  staff: "Staff console",
  system: "System",
};

function toRegex(route: string): RegExp {
  const src = route
    .split("/")
    .map((seg) => (seg.startsWith("[") ? "[^/]+" : seg.replace(/[.*+?^${}()|\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${src}/?$`);
}

/** The registry entry for a concrete path, preferring static segments over params. */
export function findPage(pathname: string): PageSpec | undefined {
  const candidates = PAGES.filter((pg) => pg.route && toRegex(pg.route).test(pathname));
  return candidates.sort((a, b) => (a.route!.match(/\[/g)?.length ?? 0) - (b.route!.match(/\[/g)?.length ?? 0))[0];
}

export function pagesIn(area: Area): PageSpec[] {
  return PAGES.filter((pg) => pg.area === area);
}
