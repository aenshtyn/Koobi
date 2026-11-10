import { kalam } from "@/lib/fonts";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DevBar } from "@/components/site/dev-bar";

/* Kalam is loaded on Chora (public) pages; among signed-in screens only the expert workspace loads it, for page titles. */

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
