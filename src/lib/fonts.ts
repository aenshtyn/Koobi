import { Kalam } from "next/font/google";

/**
 * The hand face. Loaded on Chora (public) pages and, since the expert workspace redesign of
 * November 2026, on expert screens for the one page title only. Staff and learner screens never load it.
 */
export const kalam = Kalam({ variable: "--font-kalam", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
