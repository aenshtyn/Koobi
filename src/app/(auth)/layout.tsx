import Link from "next/link";
import { Logo } from "@/components/ui/trust";
import { brand } from "@/config/brand";

/** Sign-in screens follow Wazi's rules: plain, large, high contrast, no hand lettering. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app flex min-h-dvh flex-col">
      <header className="page-wrap flex items-center justify-between py-5">
        <Logo />
        <Link className="btn3" href="/explore">
          Explore first
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-12">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
      <footer className="page-wrap pb-8 text-sm text-ink-2">
        {brand.name} · <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
