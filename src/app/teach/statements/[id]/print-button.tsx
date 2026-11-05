"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button className="btn2" type="button" onClick={() => window.print()}>
      <Printer size={18} aria-hidden="true" />
      Print or save as PDF
    </button>
  );
}
