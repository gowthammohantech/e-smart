'use client';

import dynamic from 'next/dynamic';

import { useWebGL } from '@/lib/hooks';

const BackgroundScene = dynamic(() => import('./BackgroundScene'), { ssr: false });

/** The three.js backdrop, or a CSS glow wash where WebGL isn't available. */
export function Backdrop() {
  const webgl = useWebGL();
  return webgl ? <BackgroundScene /> : <div className="css-glow pointer-events-none fixed inset-0 -z-10" aria-hidden />;
}
