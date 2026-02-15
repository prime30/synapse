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
      <main className="relative z-10 bg-[#fafaf9] dark:bg-[#0a0a0a] film-grain">
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
