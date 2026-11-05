import type { Metadata } from "next";
import { DraftLegal } from "@/components/site/draft-legal";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <DraftLegal
      title="Terms"
      sections={[
        ["Who we are", "The company, its registration and how to contact it."],
        ["Accounts", "Phone sign-in, who may hold an account, and guardians acting for children."],
        ["Bookings and payments", "Prices, escrow, when teachers are paid, and receipts."],
        ["Cancellations and refunds", "The 24-hour rule, the grace period, teacher cancellations and no-shows."],
        ["Disputes and the replacement promise", "How problems are reported, reviewed and resolved."],
        ["Teachers and experts", "Verification, listing review, fees, withholding tax and payouts."],
        ["Conduct", "What is not allowed, including taking payments off the platform."],
        ["Liability, changes and governing law", "Kenyan law and how these terms change."],
      ]}
    />
  );
}
