'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { propSideFor } from '@/content/tour';
import { usePrefersReducedMotion, useThreeColors, useThreeTheme } from '@/lib/hooks';
import { motionState, progressOf } from '@/lib/scroll';

import { Bars, Bubble, Coin, Sheet, Shield, Star, StockBox } from './props';

/**
 * The fixed layer behind the page: soft colour glows that drift as you
 * scroll, a sparse field of particles with depth parallax, and a
 * motif in the free margin of each section (coins by pricing, shields by GST…).
 */

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float d = distance(vUv, vec2(0.5));
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * uOpacity);
  }
`;

type GlowSpec = { color: 'glowA' | 'glowB' | 'primary'; x: number; y: number; size: number; opacity: number; drift: number };

/** Glow positions in page-space: y is in screen heights from the top of the page. */
const GLOWS: GlowSpec[] = [
  { color: 'glowA', x: -7, y: 0.1, size: 16, opacity: 0.9, drift: 0.6 },
  { color: 'primary', x: 8, y: 0.0, size: 10, opacity: 0.25, drift: 0.4 },
  { color: 'glowB', x: -9, y: 2.4, size: 12, opacity: 0.7, drift: 0.8 },
  { color: 'glowB', x: 9, y: 4.2, size: 12, opacity: 0.6, drift: 0.5 },
  { color: 'glowA', x: -8, y: 6.5, size: 14, opacity: 0.7, drift: 0.7 },
  { color: 'primary', x: 7, y: 8.8, size: 11, opacity: 0.2, drift: 0.6 },
  { color: 'glowB', x: -6, y: 11, size: 12, opacity: 0.6, drift: 0.5 },
];

/** World units per screen height at z=0, for the camera below (fov 50, z 10). */
const SCREEN_UNITS = 2 * Math.tan(THREE.MathUtils.degToRad(25)) * 10;

function Glows({ reduced }: { reduced: boolean }) {
  const { three: colors, additiveGlow } = useThreeTheme();
  const group = useRef<THREE.Group>(null);
  const materials = useMemo(
    () =>
      GLOWS.map(
        (g) =>
          new THREE.ShaderMaterial({
            vertexShader: glowVertex,
            fragmentShader: glowFragment,
            uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: g.opacity } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
      ),
    [],
  );

  // Recolour in place when the theme changes, so nothing is rebuilt. Light
  // glows would vanish on a light page, so there they blend normally, fainter.
  GLOWS.forEach((g, i) => {
    const m = materials[i];
    m.uniforms.uColor.value.set(colors[g.color]);
    m.uniforms.uOpacity.value = additiveGlow ? g.opacity : g.opacity * 0.55;
    m.blending = additiveGlow ? THREE.AdditiveBlending : THREE.NormalBlending;
  });

  useFrame(({ clock }) => {
    if (!group.current) return;
    const screens = motionState.y / window.innerHeight;
    const t = reduced ? 0 : clock.elapsedTime;
    group.current.children.forEach((mesh, i) => {
      const g = GLOWS[i];
      // Glows scroll at 70% of page speed, so they trail the content.
      mesh.position.y = (screens * 0.7 - g.y) * SCREEN_UNITS * 0.7 + Math.sin(t * 0.2 + i) * g.drift;
      mesh.position.x = g.x + Math.cos(t * 0.15 + i * 2) * g.drift;
    });
  });

  return (
    <group ref={group}>
      {GLOWS.map((g, i) => (
        <mesh key={i} position={[g.x, 0, -2]} material={materials[i]}>
          <planeGeometry args={[g.size, g.size]} />
        </mesh>
      ))}
    </group>
  );
}

const FIELD_H = 18;

function Particles({ reduced, count = 420 }: { reduced: boolean; count?: number }) {
  const colors = useThreeColors();
  const field = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 30;
      positions[i * 3 + 1] = (rand() - 0.5) * FIELD_H;
      positions[i * 3 + 2] = -rand() * 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  useFrame(({ clock }) => {
    if (!field.current) return;
    const t = reduced ? 0 : clock.elapsedTime;
    // Two copies stacked one field-height apart, so wrapping the offset is seamless.
    field.current.position.y = (motionState.y * 0.004) % FIELD_H;
    field.current.position.x = motionState.pointerX * -0.3 + Math.sin(t * 0.05) * 0.4;
  });

  return (
    <group ref={field}>
      {[0, -FIELD_H].map((y) => (
        <points key={y} geometry={geometry} position={[0, y, 0]}>
          <pointsMaterial color={colors.particles} size={0.035} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
        </points>
      ))}
    </group>
  );
}

/**
 * Two props in one page margin, the one Lixi isn't standing in: how far out (a
 * fraction of the visible half-width at that depth, so 1 is the screen edge),
 * y, z and size. One near and larger, one farther and smaller, for depth.
 * Placing by fraction keeps the props in the margin at any viewport width.
 */
const SLOTS: [out: number, y: number, z: number, scale: number][] = [
  [0.88, 0.9, 0, 1.25],
  [0.94, -2.4, -3, 0.8],
];

/** The site's content column (container-site at max width, less its padding). */
const CONTENT_W = 1152;
/** Props need this much margin either side of the content, in CSS px, or they'd sit behind copy. */
const MIN_MARGIN = 96;
/** The section layer's depth; slot z is added to it. */
const LAYER_Z = -3;
const CAMERA_Z = 10;
const HALF_FOV = THREE.MathUtils.degToRad(25);

/**
 * How a section's props move: `turn` swings each one a half-turn and back,
 * `tumble` rolls it slowly over, `sway` rocks it gently.
 */
type Motion = 'turn' | 'tumble' | 'sway';

type SectionSpec = { id: string; Prop: () => React.ReactNode; motion: Motion; size: number; seed: number };

/** One motif per section, about what that section covers. */
const SECTIONS: SectionSpec[] = [
  { id: 'about', Prop: Bars, motion: 'sway', size: 0.85, seed: 3 },
  { id: 'how-it-works', Prop: Sheet, motion: 'sway', size: 1, seed: 7 },
  { id: 'features', Prop: Shield, motion: 'turn', size: 0.95, seed: 11 },
  { id: 'all-in-one', Prop: StockBox, motion: 'tumble', size: 0.9, seed: 5 },
  { id: 'pricing', Prop: Coin, motion: 'turn', size: 1, seed: 0 },
  { id: 'faq', Prop: Bubble, motion: 'sway', size: 0.85, seed: 13 },
  { id: 'testimonials', Prop: Star, motion: 'turn', size: 0.95, seed: 17 },
];

/** The slots on this section's side, nudged up or down by its seed so sections don't line up. */
function slotsFor(id: string, seed: number) {
  const side = propSideFor(id);
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  return SLOTS.map(([out, y, z, scale]) => ({ side, out, y: y + rand() * 1.2, z, scale }));
}

/** A section's props in its free margin, rising and fading as it scrolls through. */
function SectionProps({ spec, reduced }: { spec: SectionSpec; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const section = useRef<Element | null>(null);
  const slots = useMemo(() => slotsFor(spec.id, spec.seed), [spec.id, spec.seed]);
  const { Prop, motion, size } = spec;

  useFrame(({ clock, size: view }) => {
    const g = group.current;
    if (!g) return;
    section.current ??= document.getElementById(spec.id);
    const p = progressOf(section.current);
    // Present while the section fills the screen, gone by the sections either side.
    const presence = THREE.MathUtils.smoothstep(p, 0.12, 0.35) * (1 - THREE.MathUtils.smoothstep(p, 0.65, 0.85));
    const roomy = (view.width - CONTENT_W) / 2 >= MIN_MARGIN;
    g.visible = roomy && presence > 0.01;
    if (!g.visible) return;
    g.position.y = (0.5 - p) * 6;
    const aspect = view.width / view.height;
    const t = reduced ? 0 : clock.elapsedTime;
    g.children.forEach((prop, i) => {
      const slot = slots[i];
      const halfW = (CAMERA_Z - (LAYER_Z + slot.z)) * Math.tan(HALF_FOV) * aspect;
      prop.position.set(slot.side * slot.out * halfW, slot.y + Math.sin(t * 0.7 + i) * 0.25, slot.z);
      prop.scale.setScalar(presence * size * slot.scale);
      if (motion === 'turn') prop.rotation.set(0.15, Math.sin(t * 0.6 + i * 1.3) * 1.1, 0);
      else if (motion === 'tumble') prop.rotation.set(0.5 + t * 0.25 + i, 0.6 + t * 0.35 + i * 0.7, 0);
      else prop.rotation.set(0.1, Math.sin(t * 0.5 + i * 1.1) * 0.5, Math.sin(t * 0.4 + i) * 0.15);
    });
  });

  return (
    <group ref={group} position={[0, 0, LAYER_Z]} visible={false}>
      {slots.map((_, i) => (
        <group key={i}>
          <Prop />
        </group>
      ))}
    </group>
  );
}

export default function BackgroundScene() {
  const reduced = usePrefersReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        frameloop={reduced ? 'demand' : 'always'}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 6, 6]} intensity={1.6} />
        <Glows reduced={reduced} />
        <Particles reduced={reduced} />
        {SECTIONS.map((spec) => (
          <SectionProps key={spec.id} spec={spec} reduced={reduced} />
        ))}
      </Canvas>
    </div>
  );
}
