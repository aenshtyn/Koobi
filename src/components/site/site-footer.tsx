import Link from "next/link";
import { brand } from "@/config/brand";
import { CATEGORIES } from "@/domain/taxonomy";
import { Logo } from "@/components/ui/trust";
import { Spark } from "@/components/ui/doodles";

export function SiteFooter() {
  return (
    <footer className="site-footer mt-auto">
      <div className="page-wrap flex flex-wrap justify-between gap-10 pt-12 pb-10">
        <div className="flex flex-[1_1_240px] flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <Logo />
            <Spark className="spark sm -mt-2" />
          </div>
          <p className="max-w-[260px] text-sm text-ink-2">
            Live lessons with verified Kenyan teachers and experts. Pay by M-Pesa; the money is held until the lesson happens.
          </p>
        </div>
        <nav aria-label="Explore" className="flex flex-[0_1_200px] flex-col gap-2.5">
          <span className="fhead">Explore</span>
          <Link href="/explore">All learning</Link>
          {CATEGORIES.map((c) => (
            <Link key={c.code} href={`/explore/${c.slug}`}>
              {c.short}
            </Link>
          ))}
          <Link href="/request">Request a match</Link>
        </nav>
        <nav aria-label="For experts" className="flex flex-[0_1_160px] flex-col gap-2.5">
          <span className="fhead">For experts</span>
          <Link href="/become-an-expert">Become an expert</Link>
          <Link href="/founding-members">Founding members</Link>
          <Link href="/trust">Verification</Link>
          <Link href="/teach">Expert dashboard</Link>
        </nav>
        <nav aria-label={brand.name} className="flex flex-[0_1_160px] flex-col gap-2.5">
          <span className="fhead">{brand.name}</span>
          <Link href="/about">About</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/trust">Trust and safety</Link>
        </nav>
        <nav aria-label="Support" className="flex flex-[0_1_160px] flex-col gap-2.5">
          <span className="fhead">Support</span>
          <Link href="/help">Help centre</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
        </nav>
      </div>
      <div className="page-wrap flex flex-wrap justify-between gap-3 border-t border-line-2 pt-[18px] pb-7 text-xs text-ink-2">
        <span>
          {brand.name}. {brand.tagline} · {brand.city}
        </span>
        <span>Payments processed by Paystack · Lipa na M-Pesa</span>
      </div>
    </footer>
  );
}
