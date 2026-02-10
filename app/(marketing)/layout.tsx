import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Synapse - AI-Powered Shopify Development",
  description:
    "Ship Shopify themes 10x faster with multi-agent AI. Synapse writes, tests, and deploys your themes.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased bg-[#fafaf9] text-stone-900 min-h-screen`}
    >
      <MarketingShell>{children}</MarketingShell>
    </div>
  );
}
