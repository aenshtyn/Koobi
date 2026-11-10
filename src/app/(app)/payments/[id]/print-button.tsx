"use client";
import { Printer } from "lucide-react";

/** The browser's print dialog also saves the receipt as a PDF. */
export function PrintButton() {
  return (
    <button className="btn" type="button" onClick={() => window.print()}>
      <Printer size={18} aria-hidden="true" />
      Print or save as PDF
    </button>
  );
}
