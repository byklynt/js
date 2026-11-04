import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { SocialProof } from "@/components/landing/social-proof";
import { BentoFeatures } from "@/components/landing/bento-features";
import { ServicesWide } from "@/components/landing/services-wide";
import { DashboardMockup } from "@/components/landing/dashboard-mockup";
import { FeatureColumns } from "@/components/landing/feature-columns";
import { Testimonials } from "@/components/landing/testimonials";
import { Faq } from "@/components/landing/faq";
import { ClosingFooter } from "@/components/landing/closing-footer";
import { siteConfig } from "@/lib/site-config";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        {/* Real reviews / counts only: off until there is real data (lib/site-config.ts). */}
        {siteConfig.showSocialProof ? <SocialProof /> : null}
        <BentoFeatures />
        <ServicesWide />
        <DashboardMockup />
        <FeatureColumns />
        {siteConfig.showSocialProof ? <Testimonials /> : null}
        <Faq />
        <ClosingFooter />
      </main>
    </>
  );
}
