import React from 'react';
import { Circle, G, Path, Rect } from 'react-native-svg';
import { usePop } from '../motion';
import { Backdrop, Card, CheckBadge, Float, Ground, Layer, Person, Scene, SceneProps, Sparkle, TextLine, Twinkle, useScene } from './kit';
import { Coin, ScanCorners } from './states';

/*
 * Heroes: the big, livelier scenes — first run, a finished setup, the scanner,
 * and the loading screen. These loop continuously.
 */

export function Welcome(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <Ground />
      </Layer>
      <Float amp={5}>
        <Card x={196} y={88} w={118} h={136} r={10} />
        <InvoiceLines />
      </Float>
      <Layer>
        <Person x={96} y={128} s={1.15} wave />
      </Layer>
      <Float amp={7} shift={0.35}>
        <CheckBadge cx={318} cy={76} r={17} />
      </Float>
      <Twinkle>
        <Sparkle x={86} y={92} r={8} />
        <Sparkle x={340} y={170} r={6} />
      </Twinkle>
    </Scene>
  );
}

function InvoiceLines() {
  const { p } = useScene();
  return (
    <G>
      <TextLine x={212} y={114} w={68} color={p.primary} width={7} />
      <TextLine x={212} y={134} w={86} />
      <TextLine x={212} y={152} w={60} />
      <Rect x={212} y={176} width={86} height={28} rx={8} fill={p.primarySoft} opacity={0.6} />
      <TextLine x={232} y={190} w={46} color={p.primary} />
    </G>
  );
}

export function SetupComplete(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop tone="good" />
        <Ground />
        <Person x={92} y={150} s={0.9} wave />
        <PersonRight />
      </Layer>
      <PoppingCheck />
      <Confetti />
    </Scene>
  );
}

function PersonRight() {
  const { p } = useScene();
  return <Person x={256} y={150} s={0.9} accent={p.cyan} />;
}

/** The big tick springs in once, then floats with the loop. */
function PoppingCheck() {
  const { p, motion, width } = useScene();
  const pop = usePop({ delay: 200, from: 0.4 });
  return (
    <Layer style={[pop, { transform: [...pop.transform, { translateY: motion.bob(6 * (width / 400), 0) }] }]}>
      <Circle cx={200} cy={124} r={58} fill={p.good} opacity={0.18} />
      <CheckBadge cx={200} cy={124} r={42} />
    </Layer>
  );
}

function Confetti() {
  const { p } = useScene();
  const bits: [number, number, string, number][] = [
    [120, 70, p.yellow, -20], [146, 46, p.primary, 30], [262, 52, p.red, 15],
    [292, 82, p.cyan, -35], [110, 128, p.good, 45], [306, 132, p.yellow, 10],
  ];
  return (
    <>
      <Twinkle shift={0} min={0.15}>
        {bits.filter((_, i) => i % 2 === 0).map(([x, y, c, r], i) => (
          <Rect key={i} x={x} y={y} width={12} height={6} rx={2} fill={c} transform={`rotate(${r} ${x + 6} ${y + 3})`} />
        ))}
        <Sparkle x={214} y={46} r={8} />
      </Twinkle>
      <Twinkle shift={0.5} min={0.15}>
        {bits.filter((_, i) => i % 2 === 1).map(([x, y, c, r], i) => (
          <Rect key={i} x={x} y={y} width={12} height={6} rx={2} fill={c} transform={`rotate(${r} ${x + 6} ${y + 3})`} />
        ))}
        <Sparkle x={178} y={40} r={5} />
      </Twinkle>
    </>
  );
}

export function Scanning(props: SceneProps) {
  return (
    <Scene {...props} duration={2400}>
      <Layer>
        <Backdrop />
        <Card x={142} y={74} w={116} h={150} r={10} />
        <ScanDocLines />
        <ScanCorners />
      </Layer>
      <Beam />
    </Scene>
  );
}

function ScanDocLines() {
  const { p } = useScene();
  return (
    <G>
      <TextLine x={160} y={102} w={60} color={p.primary} width={6} />
      <TextLine x={160} y={122} w={80} />
      <TextLine x={160} y={142} w={52} />
      <TextLine x={160} y={178} w={80} color={p.primarySoft} width={7} />
      <Path d="M160 200h4M170 200h2M178 200h6M190 200h2M198 200h4M208 200h6M220 200h2M228 200h4" stroke={p.ink} strokeWidth={14} />
    </G>
  );
}

function Beam() {
  const { p, motion, width } = useScene();
  return (
    <Layer style={{ transform: [{ translateY: motion.sweep(118 * (width / 400)) }] }}>
      <Rect x={128} y={84} width={144} height={26} fill={p.primary} opacity={0.14} />
      <Rect x={128} y={84} width={144} height={5} rx={2.5} fill={p.primary} />
    </Layer>
  );
}

export function EmptyDashboard(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <Ground />
        <Card x={112} y={66} w={168} h={158} r={12} />
        <DashHeader />
        <Person x={294} y={148} s={0.82} wave />
      </Layer>
      <GrowingBars />
      <Float amp={6} shift={0.6}>
        <Coin cx={96} cy={110} r={18} />
      </Float>
    </Scene>
  );
}

function DashHeader() {
  const { p } = useScene();
  return (
    <G>
      <TextLine x={132} y={90} w={62} color={p.inkFaint} />
      <TextLine x={132} y={106} w={40} color={p.inkFaint} />
      <Path d="M130 204h132" stroke={p.inkFaint} strokeWidth={2} />
    </G>
  );
}

function GrowingBars() {
  const { p, motion, width } = useScene();
  const s = width / 400;
  const bars = [34, 58, 44, 76, 62];
  return (
    <>
      {bars.map((b, i) => (
        <Layer key={i} style={{ transform: [{ translateY: motion.bob(5 * s, i * 0.15) }] }}>
          <Rect x={136 + i * 26} y={202 - b} width={16} height={b} rx={6} fill={i === 3 ? p.primary : p.primarySoft} />
        </Layer>
      ))}
    </>
  );
}

/** The app's own loading mark: a ledger page filling itself in. */
export function Loading(props: SceneProps) {
  return (
    <Scene {...props} duration={1800}>
      <Layer>
        <Backdrop />
      </Layer>
      <Float amp={4}>
        <Card x={150} y={70} w={100} h={140} r={10} />
      </Float>
      <LoadingLines />
      <Twinkle min={0.1}>
        <Sparkle x={274} y={84} r={8} />
      </Twinkle>
      <Twinkle shift={0.5} min={0.1}>
        <Sparkle x={124} y={190} r={6} />
      </Twinkle>
    </Scene>
  );
}

function LoadingLines() {
  const { p, motion, width } = useScene();
  const rows = [
    { y: 98, w: 46, c: p.primary },
    { y: 120, w: 62, c: p.inkFaint },
    { y: 140, w: 54, c: p.inkFaint },
    { y: 160, w: 64, c: p.inkFaint },
    { y: 186, w: 40, c: p.good },
  ];
  return (
    <>
      {rows.map((r, i) => (
        <Layer key={i} style={{ opacity: motion.twinkle(i * 0.12, 0.15), transform: [{ translateY: motion.bob(4 * (width / 400), 0) }] }}>
          <TextLine x={168} y={r.y} w={r.w} color={r.c} width={i === 0 ? 7 : 5} />
        </Layer>
      ))}
    </>
  );
}
