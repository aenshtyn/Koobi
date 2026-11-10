import { redirect } from "next/navigation";

/** L24: receipts now live in Payments & Transactions; the old address still works. */
export default function ReceiptsPage() {
  redirect("/payments");
}
