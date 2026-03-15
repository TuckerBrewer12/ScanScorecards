import { PublicNav } from "./PublicNav";
import { HeroSection } from "./sections/HeroSection";
import { ProblemSection } from "./sections/ProblemSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { FeaturesSection } from "./sections/FeaturesSection";
import { ComparisonSection } from "./sections/ComparisonSection";
import { ScreenshotsSection } from "./sections/ScreenshotsSection";
import { PricingSection } from "./sections/PricingSection";
import { FinalCtaSection } from "./sections/FinalCtaSection";

export function LandingPage() {
  return (
    <div className="public-landing min-h-screen bg-white">
      <PublicNav />
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <FeaturesSection />
      <ComparisonSection />
      <ScreenshotsSection />
      <PricingSection />
      <FinalCtaSection />
    </div>
  );
}
