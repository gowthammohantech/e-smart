'use client';

import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { SCREEN_H as CAPTURE_H, SCREEN_W as CAPTURE_W } from '@/components/mockups/Screens';
import { usePrefersReducedMotion, useThemeKey, useThreeColors } from '@/lib/hooks';
import { motionState } from '@/lib/scroll';

/** Points above the capture for the phone's status bar and Dynamic Island. */
const STATUS_H = 50;
/** The app's own background behind the status bar, per theme. */
const APP_BG = { light: '#F4F6FA', dark: '#0E121A' } as const;
const PX = 2;

/**
 * Phone body in world units, in a modern iPhone's proportions: corners about
 * 16% of the width, a slim black border round the screen, and a metal band
 * about a ninth of the width deep.
 */
const BODY_W = 2.1;
const BEZEL = 0.075;
const SCREEN_W = BODY_W - BEZEL * 2;
const SCREEN_H = (SCREEN_W * (CAPTURE_H + STATUS_H)) / CAPTURE_W;
const BODY_H = SCREEN_H + BEZEL * 2;
const DEPTH = 0.2;
const CORNER = 0.34;
/** The band's rounded edge, front and back. */
const BEVEL = 0.05;

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A flat rounded-rect face whose UVs run 0..1 across it, so a texture fills it exactly. */
function faceGeometry(w: number, h: number, r: number) {
  const geo = new THREE.ShapeGeometry(roundedRect(w, h, r), 24);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return geo;
}

/** The metal band: an extruded rounded rect with rounded front and back edges, centred on z = 0. */
const bandGeo = (() => {
  const inner = DEPTH - BEVEL * 2;
  const geo = new THREE.ExtrudeGeometry(roundedRect(BODY_W - BEVEL * 2, BODY_H - BEVEL * 2, CORNER - BEVEL), {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 8,
    curveSegments: 32,
  });
  geo.translate(0, 0, -inner / 2);
  return geo;
})();
const glassGeo = faceGeometry(BODY_W - 0.06, BODY_H - 0.06, CORNER - 0.03);
const screenGeo = faceGeometry(SCREEN_W, SCREEN_H, CORNER - BEZEL);

/** Time, Dynamic Island with its lens, and signal / Wi-Fi / battery, as a phone draws them. */
function drawStatusBar(ctx: CanvasRenderingContext2D, ink: string) {
  const mid = 25;
  ctx.fillStyle = ink;
  ctx.font = `600 15px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('9:41', 34, mid + 1);
  // Dynamic Island and front camera.
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(CAPTURE_W / 2 - 56, mid - 16, 112, 32, 16);
  ctx.fill();
  const lens = ctx.createRadialGradient(CAPTURE_W / 2 + 38, mid - 2, 1, CAPTURE_W / 2 + 40, mid, 7);
  lens.addColorStop(0, '#3B4A6B');
  lens.addColorStop(1, '#0B0D14');
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(CAPTURE_W / 2 + 40, mid, 6, 0, Math.PI * 2);
  ctx.fill();
  // Signal bars.
  ctx.fillStyle = ink;
  const sx = CAPTURE_W - 96;
  [4, 6.5, 9, 12].forEach((h, i) => {
    ctx.beginPath();
    ctx.roundRect(sx + i * 4.6, mid + 6 - h, 3, h, 0.8);
    ctx.fill();
  });
  // Wi-Fi: three arcs and a dot.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const wx = CAPTURE_W - 66;
  [8.5, 5.6, 2.8].forEach((r) => {
    ctx.beginPath();
    ctx.arc(wx, mid + 5, r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  });
  // Battery.
  const bx = CAPTURE_W - 50;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, mid - 6, 24, 12, 3.6);
  ctx.stroke();
  ctx.fillRect(bx + 25.5, mid - 2.2, 1.6, 4.4);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.roundRect(bx + 1.8, mid - 4.2, 20.4, 8.4, 2.2);
  ctx.fill();
}

/**
 * The real invoice capture (public/screens) under a drawn status bar, as a
 * texture. It reloads when the theme changes, so the phone matches the page.
 */
function useScreenTexture() {
  const theme = useThemeKey();
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CAPTURE_W * PX;
    canvas.height = (CAPTURE_H + STATUS_H) * PX;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    return tex;
  }, [gl]);

  useEffect(() => {
    let live = true;
    const img = new Image();
    img.src = `/screens/${theme}/invoice.webp`;
    void img.decode().then(() => {
      if (!live) return;
      const canvas = texture.image as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      ctx.clearRect(0, 0, CAPTURE_W, CAPTURE_H + STATUS_H);
      ctx.fillStyle = APP_BG[theme];
      ctx.fillRect(0, 0, CAPTURE_W, STATUS_H);
      drawStatusBar(ctx, theme === 'dark' ? '#FFFFFF' : '#0E121A');
      ctx.drawImage(img, 0, STATUS_H, CAPTURE_W, CAPTURE_H);
      ctx.restore();
      texture.needsUpdate = true;
      invalidate();
    });
    return () => {
      live = false;
    };
  }, [theme, texture, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Side buttons, as fractions of the body's height from the top: [side, top, length]. */
const BUTTONS: [side: 'left' | 'right', top: number, length: number][] = [
  ['left', 0.17, 0.045],
  ['left', 0.25, 0.075],
  ['left', 0.345, 0.075],
  ['right', 0.27, 0.11],
];

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
      {/* Polished titanium band. */}
      <mesh geometry={bandGeo}>
        <meshPhysicalMaterial color={colors.frame} metalness={1} roughness={0.18} clearcoat={0.8} clearcoatRoughness={0.1} envMapIntensity={1.6} />
      </mesh>
      {/* The black glass front, edge to edge inside the band. */}
      <mesh geometry={glassGeo} position={[0, 0, DEPTH / 2 + 0.001]}>
        <meshPhysicalMaterial color="#030304" metalness={0.1} roughness={0.06} clearcoat={1} clearcoatRoughness={0.03} />
      </mesh>
      {/* Side buttons: action and volume on the left, power on the right. */}
      {BUTTONS.map(([side, top, length]) => (
        <RoundedBox
          key={`${side}-${top}`}
          args={[0.04, length * BODY_H, 0.07]}
          radius={0.018}
          smoothness={4}
          position={[(side === 'left' ? -1 : 1) * (BODY_W / 2 + 0.006), BODY_H / 2 - (top + length / 2) * BODY_H, 0]}
        >
          <meshPhysicalMaterial color={colors.frame} metalness={1} roughness={0.22} envMapIntensity={1.6} />
        </RoundedBox>
      ))}
      <mesh geometry={screenGeo} position={[0, 0, DEPTH / 2 + 0.003]}>
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      {/* A faint glass coat over the whole front that catches the studio reflections. */}
      <mesh geometry={glassGeo} position={[0, 0, DEPTH / 2 + 0.006]}>
        <meshPhysicalMaterial transparent opacity={0.12} metalness={0} roughness={0.03} clearcoat={1} />
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
        {/* Tall strip lights either side, so the metal band shows bright edge highlights. */}
        <Lightformer form="rect" intensity={5} position={[-3, 0, -1]} rotation-y={Math.PI / 2.5} scale={[0.5, 10, 1]} />
        <Lightformer form="rect" intensity={5} position={[3, 0, -1]} rotation-y={-Math.PI / 2.5} scale={[0.5, 10, 1]} />
        <Lightformer form="rect" intensity={2.5} position={[0, -4, 1]} rotation-x={-Math.PI / 2} scale={[6, 0.6, 1]} />
      </Environment>
      <Phone reduced={reduced} anchor={anchor} />
    </Canvas>
  );
}
