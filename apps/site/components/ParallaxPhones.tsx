'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

import { PhoneFrame, type ScreenName } from './mockups/Screens';

type Props = {
  back: ScreenName;
  front: ScreenName;
  /** Tilted and overlapping (about), or upright side by side (features). */
  layout?: 'tilted' | 'upright';
};

/** Two phones that drift apart vertically as the section scrolls past. */
export function ParallaxPhones({ back, front, layout = 'tilted' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const backY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [40, -40]);
  const frontY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [90, -70]);
  const tilted = layout === 'tilted';

  return (
    <div ref={ref} className="relative mx-auto flex h-[470px] w-full max-w-[460px] items-center justify-center sm:h-[540px]">
      <motion.div
        style={{ y: backY }}
        className={`absolute ${tilted ? 'top-0 left-[4%] -rotate-[8deg]' : 'top-6 left-[6%]'}`}
      >
        <PhoneFrame screen={back} width={210} className="opacity-90" />
      </motion.div>
      <motion.div
        style={{ y: frontY }}
        className={`absolute ${tilted ? 'top-14 right-[7%] rotate-[6deg] sm:right-[4%]' : 'top-16 right-[6%]'}`}
      >
        <PhoneFrame screen={front} width={226} />
      </motion.div>
    </div>
  );
}
