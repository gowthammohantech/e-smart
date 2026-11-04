import React from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { Backdrop, Card, Float, Ground, Layer, Person, Scene, SceneProps, Sparkle, TextLine, Twinkle, useScene } from './kit';

/*
 * One small scene per onboarding step, shown above the step's title so the
 * wizard never opens on a bare form. Keyed `onboarding-<step>` to match
 * ONBOARDING_STEPS in the app's onboarding store.
 */

export function OnboardingBusiness(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <Ground />
        <Shop />
        <Person x={208} y={146} s={0.9} wave />
      </Layer>
      <Twinkle>
        <Sparkle x={300} y={84} r={8} />
      </Twinkle>
      <Twinkle shift={0.5}>
        <Sparkle x={96} y={70} r={6} />
      </Twinkle>
    </Scene>
  );
}

function Shop() {
  const { p } = useScene();
  const stripes = [0, 1, 2, 3, 4];
  return (
    <G>
      <Rect x={96} y={116} width={150} height={128} rx={6} fill={p.paper} stroke={p.edgeStrong} strokeWidth={3} />
      {stripes.map((i) => (
        <Rect key={`s${i}`} x={90 + i * 32.4} y={92} width={32.4} height={24} fill={i % 2 ? p.paper : p.primary} />
      ))}
      {stripes.map((i) => (
        <Circle key={`c${i}`} cx={106.2 + i * 32.4} cy={116} r={16.2} fill={i % 2 ? p.paper : p.primary} />
      ))}
      <Rect x={114} y={152} width={46} height={92} rx={4} fill={p.primarySoft} />
      <Rect x={176} y={152} width={52} height={40} rx={4} fill={p.box} opacity={0.6} />
      <Circle cx={152} cy={198} r={3} fill={p.paper} />
    </G>
  );
}

export function OnboardingCountry(props: SceneProps) {
  return (
    <Scene {...props} duration={6000}>
      <Layer>
        <Backdrop />
      </Layer>
      <Globe />
      <Float amp={8} shift={0.2}>
        <Pin />
      </Float>
    </Scene>
  );
}

function Globe() {
  const { p, motion, width } = useScene();
  return (
    <Layer style={{ transform: [{ translateY: motion.bob(3 * (width / 400), 0.5) }] }}>
      <Circle cx={200} cy={156} r={78} fill={p.primary} opacity={0.9} />
      <Path d="M150 118c10-12 30-14 40-4s2 22-8 26-4 18 6 24-2 22-14 22-28-14-30-32 0-28 6-36z" fill={p.good} opacity={0.85} />
      <Path d="M214 98c12-4 30 2 36 14s-4 20-14 22-10 12-2 20 6 22-6 28-20-4-22-16 4-22-2-30-6-34 10-38z" fill={p.good} opacity={0.85} />
      <Ellipse cx={200} cy={156} rx={78} ry={28} fill="none" stroke="#fff" strokeWidth={2} opacity={0.35} />
      <Path d="M200 78v156" stroke="#fff" strokeWidth={2} opacity={0.35} />
      <Circle cx={200} cy={156} r={78} fill="none" stroke={p.paper} strokeWidth={3} opacity={0.5} />
    </Layer>
  );
}

function Pin() {
  const { p } = useScene();
  return (
    <G>
      <Ellipse cx={256} cy={136} rx={10} ry={4} fill="#000" opacity={0.18} />
      <Path d="M256 132c-14-18-22-28-22-40a22 22 0 0144 0c0 12-8 22-22 40z" fill={p.red} />
      <Circle cx={256} cy={92} r={8} fill="#fff" />
    </G>
  );
}

export function OnboardingTax(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <Ground from={120} to={290} />
      </Layer>
      <Float amp={4}>
        <Card x={136} y={66} w={124} h={164} r={10} />
        <TaxLines />
      </Float>
      <Float amp={7} shift={0.4}>
        <PercentBadge />
      </Float>
    </Scene>
  );
}

function TaxLines() {
  const { p } = useScene();
  return (
    <G>
      <TextLine x={154} y={94} w={56} color={p.primary} width={7} />
      <TextLine x={154} y={118} w={88} />
      <TextLine x={154} y={136} w={70} />
      <Path d="M154 160h88" stroke={p.inkFaint} strokeWidth={2} strokeDasharray="5 5" />
      <TextLine x={154} y={182} w={40} />
      <TextLine x={206} y={182} w={36} color={p.good} width={6} />
      <TextLine x={154} y={204} w={40} />
      <TextLine x={206} y={204} w={36} color={p.primary} width={6} />
    </G>
  );
}

function PercentBadge() {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={276} cy={96} r={30} fill={p.warn} />
      <Path d="M264 110l24-28" stroke="#fff" strokeWidth={5} strokeLinecap="round" />
      <Circle cx={266} cy={86} r={5} fill="none" stroke="#fff" strokeWidth={4} />
      <Circle cx={286} cy={106} r={5} fill="none" stroke="#fff" strokeWidth={4} />
    </G>
  );
}

export function OnboardingNumbering(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <StackBack />
      </Layer>
      <Float amp={5}>
        <Card x={148} y={72} w={112} h={146} r={10} />
        <NumberedLines />
      </Float>
      <Twinkle>
        <Sparkle x={290} y={84} r={7} />
      </Twinkle>
      <Twinkle shift={0.5}>
        <Sparkle x={110} y={200} r={6} />
      </Twinkle>
    </Scene>
  );
}

function StackBack() {
  const { p } = useScene();
  return (
    <G>
      <Rect x={128} y={96} width={112} height={146} rx={10} fill={p.paper2} stroke={p.edgeStrong} strokeWidth={2} />
      <Rect x={138} y={84} width={112} height={146} rx={10} fill={p.paper2} stroke={p.edgeStrong} strokeWidth={2} />
    </G>
  );
}

function NumberedLines() {
  const { p } = useScene();
  return (
    <G>
      <Rect x={164} y={88} width={64} height={24} rx={6} fill={p.primary} />
      <Path d="M174 94l-3 12M182 94l-3 12M169 98h15M168 104h15" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
      <TextLine x={190} y={100} w={28} color="#fff" width={4} />
      <TextLine x={166} y={132} w={76} />
      <TextLine x={166} y={150} w={58} />
      <TextLine x={166} y={168} w={68} />
      <TextLine x={166} y={196} w={40} color={p.good} width={6} />
    </G>
  );
}

export function OnboardingBranches(props: SceneProps) {
  return (
    <Scene {...props} duration={4200}>
      <Layer>
        <Backdrop />
        <MapSheet />
      </Layer>
      <Float amp={6}>
        <MapPin x={150} y={150} color="primary" />
      </Float>
      <Float amp={6} shift={0.33}>
        <MapPin x={250} y={128} color="good" />
      </Float>
      <Float amp={6} shift={0.66}>
        <MapPin x={214} y={206} color="red" />
      </Float>
    </Scene>
  );
}

function MapSheet() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M96 96l70-20 68 20 70-20v148l-70 20-68-20-70 20z" fill={p.paper} stroke={p.edgeStrong} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M166 76v148M234 96v148" stroke={p.edgeStrong} strokeWidth={2} />
      <Path d="M110 190c30-30 60 10 90-20s50-40 90-10" stroke={p.primarySoft} strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.7} />
      <Path d="M150 150L250 128M250 128L214 206M150 150L214 206" stroke={p.inkFaint} strokeWidth={2.5} strokeDasharray="6 6" />
    </G>
  );
}

function MapPin({ x, y, color }: { x: number; y: number; color: 'primary' | 'good' | 'red' }) {
  const { p } = useScene();
  return (
    <G>
      <Path d={`M${x} ${y}c-10-13-16-20-16-29a16 16 0 0132 0c0 9-6 16-16 29z`} fill={p[color]} />
      <Circle cx={x} cy={y - 29} r={6} fill="#fff" />
    </G>
  );
}
