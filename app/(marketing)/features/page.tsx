import { GridDivider } from '@/components/marketing/grid/GridDivider';
import { Navbar } from '@/components/marketing/nav';
import {
  FeaturesHero,
  ProblemSection,
  ValuePropsV2,
  FeatureDeepDive,
  HowItWorksV2,
  MetricsStrip,
  FAQSection,
  FooterV2,
} from '@/components/marketing/sections/v2';
import { BenchmarkSections } from '@/app/(marketing)/benchmarks/client';
import { FeaturesCtaBanner } from './FeaturesCtaBanner';

export default function FeaturesPage() {
  return (
    <>
      <Navbar />
      <main className="relative z-10 bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] film-grain">
      {/* Compact hero — no product mockup (that lives on the home page) */}
      <FeaturesHero />

      {/* Problem — before/after pain points */}
      <ProblemSection />

      {/* Value props — 3 outcome cards */}
      <GridDivider />
      <ValuePropsV2 />

      {/* Feature deep-dive — 4 pillars (anchor: #features) */}
      <GridDivider />
      <FeatureDeepDive />

      {/* How it works — 3 steps */}
      <GridDivider />
      <HowItWorksV2 />

      {/* Benchmarks — architecture, tier routing, and performance data */}
      <GridDivider />
      <BenchmarkSections />

      {/* Metrics strip — product capability numbers */}
      <GridDivider />
      <MetricsStrip />

      {/* FAQ — objection handling + schema markup */}
      <GridDivider />
      <FAQSection />

      {/* Simple CTA banner — no mockup */}
      <GridDivider />
      <FeaturesCtaBanner />

      {/* Footer */}
      <FooterV2 />
    </main>
    </>
  );
}
