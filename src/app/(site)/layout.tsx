import { Kalam } from "next/font/google";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DevBar } from "@/components/site/dev-bar";

/* Kalam is loaded only on Chora (public) pages; signed-in screens never load it (BRAND §6). */
const kalam = Kalam({ variable: "--font-kalam", subsets: ["latin"], weight: ["400", "700"], display: "swap" });

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${kalam.variable} chora flex min-h-dvh flex-col`}>
      <DevBar />
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
