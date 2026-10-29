'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { usePrefersReducedMotion, useThreeColors } from '@/lib/hooks';
import { motionState, progressOf } from '@/lib/scroll';

/**
 * The fixed layer behind the page: soft colour glows that drift as you
 * scroll, a sparse field of particles with depth parallax, and coins
 * either side of the pricing section.
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
  const colors = useThreeColors();
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

  // Recolour in place when the palette changes, so nothing is rebuilt.
  GLOWS.forEach((g, i) => materials[i].uniforms.uColor.value.set(colors[g.color]));

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
          <pointsMaterial color={colors.soft} size={0.035} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
        </points>
      ))}
    </group>
  );
}

/** Where each coin sits: two loose columns either side of the cards, never behind the copy. */
const COINS: [x: number, y: number, z: number][] = [
  [-8.6, 2.6, -1],
  [-10.2, 0.4, -3],
  [-8.2, -1.8, 0],
  [-9.6, -3.9, -2],
  [8.8, 3.1, -2],
  [10.0, 0.9, -1],
  [8.4, -1.4, -3],
  [9.4, -3.6, 0],
];

/** Coins either side of the pricing cards, rising and fading with that section. */
function Coins({ reduced }: { reduced: boolean }) {
  const colors = useThreeColors();
  const group = useRef<THREE.Group>(null);
  const section = useRef<Element | null>(null);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    section.current ??= document.getElementById('pricing');
    const p = progressOf(section.current);
    // Present while the cards fill the screen, gone by the sections either side.
    const presence = THREE.MathUtils.smoothstep(p, 0.12, 0.35) * (1 - THREE.MathUtils.smoothstep(p, 0.65, 0.85));
    g.visible = presence > 0.01;
    g.position.y = (0.5 - p) * 6;
    const t = reduced ? 0 : clock.elapsedTime;
    g.children.forEach((coin, i) => {
      coin.scale.setScalar(presence);
      // A slow half-turn either way shows off the rim, then back to face front.
      coin.rotation.set(0.15, Math.sin(t * 0.6 + i * 1.3) * 1.1, 0);
      coin.position.y = COINS[i][1] + Math.sin(t * 0.7 + i) * 0.25;
    });
  });

  return (
    <group ref={group} position={[0, 0, -3]}>
      {COINS.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.08, 48]} />
            <meshStandardMaterial color={colors.deep} metalness={0.85} roughness={0.3} emissive={colors.primary} emissiveIntensity={0.15} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.42, 0.035, 12, 48]} />
            <meshStandardMaterial color={colors.primary} emissive={colors.primary} emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <ringGeometry args={[0.24, 0.27, 40]} />
            <meshBasicMaterial color={colors.soft} transparent opacity={0.45} toneMapped={false} />
          </mesh>
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
        <Coins reduced={reduced} />
      </Canvas>
    </div>
  );
}
