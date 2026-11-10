import type { NavItem } from "@/components/app/nav";

export const LEARNER_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "house", tab: true },
  { href: "/explore", label: "Explore", icon: "compass", tab: true },
  { href: "/sessions", label: "Sessions", icon: "calendar", tab: true },
  { href: "/messages", label: "Messages", icon: "messages", tab: true },
  { href: "/notifications", label: "Notifications", icon: "bell", section: "Account" },
  { href: "/account/learners", label: "Children", icon: "users", section: "Account" },
  { href: "/account/credits", label: "Credits", icon: "wallet", section: "Account" },
  { href: "/account/receipts", label: "Receipts", icon: "receipt", section: "Account" },
  { href: "/account/settings", label: "Settings", icon: "settings", section: "Account", tab: true },
];

/* Expert workspace (redesign of November 2026). Statements sit inside Earnings & Payouts, the waitlist
   inside Verification, and notifications on the bell. Web addresses did not change. */
export const TEACHER_NAV: NavItem[] = [
  { href: "/teach", label: "Dashboard", icon: "house", tab: true },
  { href: "/teach/offers", label: "Learning Experiences", tabLabel: "Experiences", icon: "book", tab: true },
  { href: "/teach/bookings", label: "Bookings", icon: "calendar", tab: true, also: ["/teach/sessions"] },
  { href: "/teach/requests", label: "Requests", icon: "inbox" },
  { href: "/teach/availability", label: "Availability & Schedule", icon: "clock" },
  { href: "/teach/messages", label: "Messages", icon: "messages", tab: true },
  { href: "/teach/business", label: "Business", icon: "chart", section: "Business" },
  { href: "/teach/earnings", label: "Earnings & Payouts", tabLabel: "Earnings", icon: "wallet", section: "Business", tab: true, also: ["/teach/statements"] },
  { href: "/teach/reviews", label: "Reviews & Ratings", icon: "star", section: "Business" },
  { href: "/teach/account", label: "Profile & Account", icon: "user", section: "Profile & Account" },
  { href: "/teach/profile", label: "Public Profile", icon: "globe", section: "Profile & Account", also: ["/teach/apply"] },
  { href: "/teach/verification", label: "Verification", icon: "shield", section: "Profile & Account", also: ["/teach/waitlist"] },
  { href: "/teach/settings", label: "Settings", icon: "settings", section: "Profile & Account" },
];

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "Home", icon: "house", tab: true },
  { href: "/staff/listings", label: "Listing approvals", icon: "listchecks", section: "Operations", tab: true },
  { href: "/staff/verification", label: "Verification", icon: "badge", section: "Operations" },
  { href: "/staff/requests", label: "Requests", icon: "inbox", section: "Operations", tab: true },
  { href: "/staff/bookings", label: "Bookings", icon: "calendar", section: "Operations" },
  { href: "/staff/disputes", label: "Disputes", icon: "gavel", section: "Operations", tab: true },
  { href: "/staff/waitlist", label: "Waitlist", icon: "list", section: "Operations" },
  { href: "/staff/payouts", label: "Payout batches", icon: "banknote", section: "Money" },
  { href: "/staff/refunds", label: "Refunds", icon: "refresh", section: "Money" },
  { href: "/staff/reconciliation", label: "Reconciliation", icon: "scale", section: "Money" },
  { href: "/staff/ledger", label: "Ledger", icon: "scroll", section: "Money" },
  { href: "/staff/teachers", label: "Teachers and experts", icon: "users", section: "Admin" },
  { href: "/staff/learners", label: "Learners", icon: "user", section: "Admin" },
  { href: "/staff/taxonomy", label: "Categories", icon: "tags", section: "Admin" },
  { href: "/staff/parameters", label: "Parameters", icon: "sliders", section: "Admin" },
  { href: "/staff/templates", label: "Templates", icon: "messages", section: "Admin" },
  { href: "/staff/users", label: "Staff and roles", icon: "shield", section: "Admin" },
  { href: "/staff/audit", label: "Audit log", icon: "file", section: "Admin" },
  { href: "/staff/reports/pilot", label: "Pilot metrics", icon: "chart", section: "Admin", tab: true },
  { href: "/staff/readiness", label: "Launch readiness", icon: "check", section: "Admin" },
];
