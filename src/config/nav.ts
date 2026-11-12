import type { NavItem } from "@/components/app/nav";

/* Learner workspace (redesign of November 2026). Receipts and credits sit inside Payments &
   Transactions, lesson notes and packages inside My Learning, and notifications on the bell. Explore
   stays in the list so a phone, which has no side card or search box, can still reach it. */
export const LEARNER_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "house", tab: true },
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/learning", label: "My Learning", tabLabel: "Learning", icon: "book", section: "Learning", tab: true, also: ["/learners", "/packages"] },
  { href: "/bookings", label: "My Bookings", tabLabel: "Bookings", icon: "calendar", section: "Learning", tab: true, also: ["/disputes"] },
  { href: "/sessions", label: "My Schedule", tabLabel: "Schedule", icon: "clock", section: "Learning" },
  { href: "/messages", label: "Messages", icon: "messages", section: "Communication", tab: true },
  { href: "/following", label: "Following", icon: "follow", section: "Communication" },
  { href: "/payments", label: "Payments & Transactions", tabLabel: "Payments", icon: "card", section: "Financial", also: ["/account/receipts", "/account/credits"] },
  { href: "/reviews", label: "My Reviews", icon: "star", section: "Feedback" },
  { href: "/account/profile", label: "My Profile", icon: "user", section: "Account" },
  { href: "/account/learners", label: "Children", icon: "users", section: "Account", also: ["/account/identity"] },
  { href: "/account/settings", label: "Settings", icon: "settings", section: "Account" },
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
  { href: "/teach/profile", label: "Public Profile", icon: "globe", section: "Profile & Account" },
  { href: "/teach/verification", label: "Verification", icon: "shield", section: "Profile & Account", also: ["/teach/waitlist"] },
  { href: "/teach/settings", label: "Settings", icon: "settings", section: "Profile & Account" },
];

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "Home", icon: "house", tab: true },
  { href: "/staff/applications", label: "Expert applications", tabLabel: "Applications", icon: "user", section: "Operations", tab: true },
  { href: "/staff/profile-reviews", label: "Profile reviews", icon: "globe", section: "Operations" },
  { href: "/staff/listings", label: "Learning experience approvals", icon: "listchecks", section: "Operations" },
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
