import { About } from '@/components/About';
import { Bento } from '@/components/Bento';
import { EverythingGrid } from '@/components/EverythingGrid';
import { Faq } from '@/components/Faq';
import { Features } from '@/components/Features';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { LixiGuide } from '@/components/LixiGuide';
import { MarqueePanel } from '@/components/MarqueePanel';
import { Navbar } from '@/components/Navbar';
import { Pricing } from '@/components/Pricing';
import { Testimonials } from '@/components/Testimonials';
import { Backdrop } from '@/components/three/Backdrop';
import { SmoothScroll } from '@/components/three/SmoothScroll';
import { Spotlight } from '@/components/ui/Spotlight';
import { pricing } from '@/content/site';

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Spotlight />
      <Backdrop />
      <Navbar />
      <main>
        <Hero />
        <MarqueePanel />
        <About />
        <HowItWorks />
        <Features />
        <Bento />
        <EverythingGrid />
        {/* Plan data is resolved here, on the server, so the i18n catalogue stays out of the client bundle. */}
        <Pricing copy={pricing} />
        <Faq />
        <Testimonials />
      </main>
      <Footer />
      <LixiGuide />
    </>
  );
}
