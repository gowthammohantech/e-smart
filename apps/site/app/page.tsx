import { About } from '@/components/About';
import { Bento } from '@/components/Bento';
import { EverythingGrid } from '@/components/EverythingGrid';
import { Faq } from '@/components/Faq';
import { Features } from '@/components/Features';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { MarqueePanel } from '@/components/MarqueePanel';
import { Navbar } from '@/components/Navbar';
import { PaletteSwitcher } from '@/components/PaletteSwitcher';
import { Pricing } from '@/components/Pricing';
import { Testimonials } from '@/components/Testimonials';
import { Waitlist } from '@/components/Waitlist';
import { Backdrop } from '@/components/three/Backdrop';
import { SmoothScroll } from '@/components/three/SmoothScroll';
import { pricing } from '@/content/site';

export default function Home() {
  return (
    <>
      <SmoothScroll />
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
        <Waitlist />
      </main>
      <Footer />
      <PaletteSwitcher />
    </>
  );
}
