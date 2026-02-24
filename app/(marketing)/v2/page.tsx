import { Navbar } from '@/components/marketing/nav';
import { GridDivider } from '@/components/marketing/grid/GridDivider';
import {
  HeroSectionV2,
  ProblemSection,
  ValuePropsV2,
  FeatureDeepDive,
  HowItWorksV2,
  MetricsStrip,
  FAQSection,
  FinalCTAV2,
  FooterV2,
} from '@/components/marketing/sections/v2';

export default function MarketingPageV2() {
  return (
    <>
      <Navbar />
      <main className="relative z-10 bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] film-grain">
        {/* Hero — outcome-driven H1, static for SEO */}
        <HeroSectionV2 />

        {/* Problem — before/after pain points */}
        <ProblemSection />

        {/* Value props — 3 outcome cards */}
        <GridDivider />
        <ValuePropsV2 />

        {/* Feature deep-dive — 4 pillars */}
        <GridDivider />
        <FeatureDeepDive />

        {/* How it works — 3 steps */}
        <GridDivider />
        <HowItWorksV2 />

        {/* Metrics strip — product capability numbers */}
        <GridDivider />
        <MetricsStrip />

        {/* FAQ — objection handling + schema markup */}
        <GridDivider />
        <FAQSection />

        {/* Final CTA */}
        <GridDivider />
        <FinalCTAV2 />

        {/* Footer */}
        <FooterV2 />
      </main>
    </>
  );
}
