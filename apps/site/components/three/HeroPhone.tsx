'use client';

import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { usePaletteKey, usePrefersReducedMotion, useThreeColors } from '@/lib/hooks';
import { motionState } from '@/lib/scroll';

import { drawInvoiceScreen, TEX_H, TEX_W } from './screenTexture';

/** Phone body in world units; the screen is inset by the bezel. */
const BODY_W = 2.1;
const BEZEL = 0.09;
const SCREEN_W = BODY_W - BEZEL * 2;
const SCREEN_H = (SCREEN_W * TEX_H) / TEX_W;
const BODY_H = SCREEN_H + BEZEL * 2;
const DEPTH = 0.22;

/** The invoice screen as a texture, repainted when the palette or fonts change. */
function useScreenTexture() {
  const palette = usePaletteKey();
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(document.createElement('canvas'));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    return tex;
  }, [gl]);

  useEffect(() => {
    let live = true;
    const paint = () => {
      if (!live) return;
      // next/font registers Inter under a generated family name; borrow it from <body>.
      drawInvoiceScreen(texture.image as HTMLCanvasElement, palette, getComputedStyle(document.body).fontFamily);
      texture.needsUpdate = true;
      invalidate();
    };
    paint();
    void document.fonts.ready.then(paint);
    return () => {
      live = false;
    };
  }, [palette, texture, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Phone({ reduced, anchor }: { reduced: boolean; anchor: React.RefObject<HTMLElement | null> }) {
  const colors = useThreeColors();
  const screen = useScreenTexture();
  const group = useRef<THREE.Group>(null);
  const tilt = useRef({ x: 0, y: 0 });

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const rect = anchor.current?.getBoundingClientRect();
    // 0 while the hero fills the screen, 1 once it has scrolled a screen away.
    const p = rect ? THREE.MathUtils.clamp(-rect.top / window.innerHeight, 0, 1) : 0;
    const t = reduced ? 0 : clock.elapsedTime;
    const follow = 1 - Math.exp(-delta * 6);

    // Ease towards the pointer, so the tilt lags the cursor slightly.
    tilt.current.x += (motionState.pointerY * 0.12 - tilt.current.x) * follow;
    tilt.current.y += (motionState.pointerX * 0.25 - tilt.current.y) * follow;

    // At rest: a slight three-quarter turn. Scrolling swings it to face front,
    // tips it back and sinks it into the panel below.
    g.rotation.y = -0.28 + p * 0.28 + (reduced ? 0 : tilt.current.y);
    g.rotation.x = 0.06 + p * 0.5 + (reduced ? 0 : tilt.current.x);
    g.rotation.z = 0.05 - p * 0.05;
    g.position.y = Math.sin(t * ((Math.PI * 2) / 6)) * 0.08 - p * 1.6;
  });

  return (
    <group ref={group}>
      <RoundedBox args={[BODY_W, BODY_H, DEPTH]} radius={0.24} smoothness={6}>
        <meshPhysicalMaterial color={colors.body} metalness={0.9} roughness={0.28} clearcoat={1} clearcoatRoughness={0.15} />
      </RoundedBox>
      {/* A thin coloured rim, a touch larger than the body, for the edge glow. */}
      <RoundedBox args={[BODY_W + 0.025, BODY_H + 0.025, DEPTH * 0.55]} radius={0.25} smoothness={6}>
        <meshStandardMaterial color={colors.primary} emissive={colors.primary} emissiveIntensity={0.9} transparent opacity={0.6} />
      </RoundedBox>
      <mesh position={[0, 0, DEPTH / 2 + 0.002]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={screen} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Whether `el` is on screen, so the scene can stop drawing once scrolled away. */
function useOnScreen(el: React.RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!el.current) return;
    const observer = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting));
    observer.observe(el.current);
    return () => observer.disconnect();
  }, [el]);
  return on;
}

export default function HeroPhone({ anchor }: { anchor: React.RefObject<HTMLElement | null> }) {
  const reduced = usePrefersReducedMotion();
  const onScreen = useOnScreen(anchor);
  return (
    <Canvas
      camera={{ position: [0, 0, 7.4], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      frameloop={reduced || !onScreen ? 'demand' : 'always'}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={2} />
      {/* Studio reflections built from light panels, so no HDR file is fetched. */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[0, 3, 4]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={2} position={[-4, 0, 2]} rotation-y={Math.PI / 2} scale={[4, 6, 1]} />
        <Lightformer form="ring" intensity={1.5} position={[4, 1, 2]} scale={2} />
      </Environment>
      <Phone reduced={reduced} anchor={anchor} />
    </Canvas>
  );
}
