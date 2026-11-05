import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono, Figtree } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: "500",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${brand.domain}`),
  title: {
    default: `${brand.name}: learn from people who have done it`,
    template: `%s · ${brand.name}`,
  },
  description:
    "Live lessons, group classes, workshops and programmes with verified Kenyan teachers and experts. Pay by M-Pesa; the money is held until the lesson happens.",
  applicationName: brand.name,
};

export const viewport: Viewport = {
  themeColor: "#FBF6EE",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${figtree.variable} ${dmMono.variable}`}>
      <body className="min-h-dvh flex flex-col">{children}</body>
    </html>
  );
}
