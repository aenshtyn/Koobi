import type { Metadata } from "next";
import { DraftLegal } from "@/components/site/draft-legal";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <DraftLegal
      title="Privacy notice"
      sections={[
        ["What we collect", "Phone number, name, bookings and payments; for teachers, identity and verification documents."],
        ["Children", "Collected only with a guardian's consent, and only what lessons need."],
        ["Why we use it", "To run bookings and payments, verify teachers, keep people safe and meet tax law."],
        ["Who we share it with", "Payment, identity, SMS and WhatsApp providers, and KRA where the law requires."],
        ["Where it is stored", "Including storage outside Kenya, and the safeguards that apply under the Data Protection Act 2019."],
        ["How long we keep it", "Retention periods by type of record."],
        ["Your rights", "Access, correction, deletion and objection, and how to complain to the ODPC."],
      ]}
    />
  );
}
