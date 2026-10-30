'use client';

import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

import { useThreeColors } from '@/lib/hooks';

/**
 * The small 3D objects that flank each section (see SectionProps in
 * BackgroundScene). Each one is drawn around its own centre at roughly unit
 * size, facing the camera; the section layer positions, scales and turns it.
 * No text, so nothing fetches a font.
 */

type Colors = ReturnType<typeof useThreeColors>;
type Materials = Record<'body' | 'accent' | 'soft' | 'paper', THREE.Material>;

/** One set of materials per theme, shared by every prop on the page. */
const materialCache = new WeakMap<Colors, Materials>();

function useMaterials(): Materials {
  const c = useThreeColors();
  let set = materialCache.get(c);
  if (!set) {
    set = {
      body: new THREE.MeshStandardMaterial({ color: c.propBody, metalness: 0.8, roughness: 0.32, emissive: c.primary, emissiveIntensity: 0.15 }),
      accent: new THREE.MeshStandardMaterial({ color: c.primary, emissive: c.primary, emissiveIntensity: 0.5, roughness: 0.4 }),
      soft: new THREE.MeshBasicMaterial({ color: c.soft, transparent: true, opacity: 0.55, toneMapped: false }),
      paper: new THREE.MeshStandardMaterial({ color: c.paper, roughness: 0.6, metalness: 0.1 }),
    };
    materialCache.set(c, set);
  }
  return set;
}

/** Pricing: a coin with a bright rim and an inner ring. */
export function Coin() {
  const m = useMaterials();
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.body}>
        <cylinderGeometry args={[0.42, 0.42, 0.08, 48]} />
      </mesh>
      <mesh material={m.accent}>
        <torusGeometry args={[0.42, 0.035, 12, 48]} />
      </mesh>
      <mesh position={[0, 0, 0.045]} material={m.soft}>
        <ringGeometry args={[0.24, 0.27, 40]} />
      </mesh>
    </group>
  );
}

/** About: a small bar chart, rising left to right. */
export function Bars() {
  const m = useMaterials();
  const heights = [0.45, 0.75, 1.1];
  return (
    <group position={[0, -0.5, 0]}>
      {heights.map((h, i) => (
        <RoundedBox key={i} args={[0.22, h, 0.22]} radius={0.05} position={[(i - 1) * 0.3, h / 2, 0]} material={i === 2 ? m.accent : m.body} />
      ))}
      <mesh position={[0, -0.02, 0]} material={m.soft}>
        <boxGeometry args={[1.05, 0.02, 0.3]} />
      </mesh>
    </group>
  );
}

/** How it works: an invoice sheet with line items and a QR block. */
export function Sheet() {
  const m = useMaterials();
  return (
    <group>
      <RoundedBox args={[0.66, 0.9, 0.03]} radius={0.04} material={m.paper} />
      {[0.26, 0.14, 0.02].map((y, i) => (
        <mesh key={y} position={[-0.06, y, 0.02]} material={i === 0 ? m.accent : m.soft}>
          <planeGeometry args={[i === 0 ? 0.36 : 0.44, 0.045]} />
        </mesh>
      ))}
      <mesh position={[0.17, -0.24, 0.02]} material={m.body}>
        <planeGeometry args={[0.18, 0.18]} />
      </mesh>
      <mesh position={[-0.12, -0.24, 0.02]} material={m.soft}>
        <planeGeometry args={[0.26, 0.04]} />
      </mesh>
    </group>
  );
}

const shieldShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.bezierCurveTo(0.18, 0.42, 0.32, 0.4, 0.4, 0.4);
  s.lineTo(0.4, 0.02);
  s.bezierCurveTo(0.4, -0.25, 0.2, -0.42, 0, -0.52);
  s.bezierCurveTo(-0.2, -0.42, -0.4, -0.25, -0.4, 0.02);
  s.lineTo(-0.4, 0.4);
  s.bezierCurveTo(-0.32, 0.4, -0.18, 0.42, 0, 0.5);
  return s;
})();

const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
const tickGeo = new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3([new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(-0.04, -0.13, 0), new THREE.Vector3(0.2, 0.15, 0)], false, 'catmullrom', 0.1),
  24,
  0.04,
  8,
);

/** Features: a GST shield with a tick. */
export function Shield() {
  const m = useMaterials();
  return (
    <group>
      <mesh geometry={shieldGeo} material={m.body} position={[0, 0, -0.04]} />
      <mesh geometry={tickGeo} material={m.accent} position={[0, 0, 0.1]} />
    </group>
  );
}

/** Everything else (bento): a stock box with a primary band. */
export function StockBox() {
  const m = useMaterials();
  return (
    <group>
      <RoundedBox args={[0.62, 0.62, 0.62]} radius={0.06} material={m.body} />
      <RoundedBox args={[0.66, 0.14, 0.66]} radius={0.03} material={m.accent} />
    </group>
  );
}

/** FAQ: a chat bubble with a tail and three dots. */
export function Bubble() {
  const m = useMaterials();
  return (
    <group>
      <RoundedBox args={[0.92, 0.6, 0.16]} radius={0.08} material={m.body} />
      <mesh position={[-0.26, -0.36, 0]} rotation={[0, 0, Math.PI * 0.85]} material={m.body}>
        <coneGeometry args={[0.1, 0.2, 3]} />
      </mesh>
      {[-0.22, 0, 0.22].map((x) => (
        <mesh key={x} position={[x, 0, 0.1]} material={m.accent}>
          <sphereGeometry args={[0.06, 16, 12]} />
        </mesh>
      ))}
    </group>
  );
}

const starShape = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.48 : 0.2;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
})();

const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.04, bevelSegments: 3 });

/** Testimonials: a beveled five-point star. */
export function Star() {
  const m = useMaterials();
  return <mesh geometry={starGeo} material={m.accent} position={[0, 0, -0.04]} />;
}
