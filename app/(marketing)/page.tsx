import { Navbar } from '@/components/marketing/nav';
import { GridDivider } from '@/components/marketing/grid/GridDivider';
import {
  HeroSection,
  LogoSlider,
  HowItWorksSection,
  SocialProofStrip,
  ValuePropGrid,
  FeatureCards,
  AgentScrollStory,
  StyleIntelligenceSection,
  ScrollRevealSection,
  TestimonialCarousel,
  CaseStudySection,
  CTASection,
  Footer,
} from '@/components/marketing/sections';

export default function MarketingPage() {
  return (
    <>
      <Navbar />
      <main className="relative z-10 bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] film-grain">
        <HeroSection />
        <GridDivider />
        <LogoSlider />
        <GridDivider />
        <SocialProofStrip />
        <GridDivider />
        <HowItWorksSection />
        <GridDivider />
        <ValuePropGrid />
        <GridDivider />
        <FeatureCards />
        <GridDivider />
        <AgentScrollStory />
        <GridDivider />
        <StyleIntelligenceSection />
        <GridDivider />
        <ScrollRevealSection />
        <TestimonialCarousel />
        <GridDivider />
        <CaseStudySection />
        <GridDivider />
        <CTASection />
        <Footer />
      </main>
    </>
  );
}
