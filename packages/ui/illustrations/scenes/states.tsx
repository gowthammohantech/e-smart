import React from 'react';
import { Circle, G, Path, Rect } from 'react-native-svg';
import { Backdrop, Card, CheckBadge, Float, Ground, Layer, Lens, Scene, SceneProps, Sparkle, TextLine, Twinkle, useScene } from './kit';

/*
 * Empty states: a list, search or record with nothing in it. Each one is calm —
 * the main object drifts a few points and a sparkle or two twinkles — so it
 * reads as "nothing here yet" rather than "something went wrong".
 */

function Base({ children, tone }: { children?: React.ReactNode; tone?: 'primary' | 'good' | 'warn' | 'bad' }) {
  return (
    <Layer>
      <Backdrop tone={tone} />
      {children}
    </Layer>
  );
}

function Sparkles({ at }: { at: [number, number, number?][] }) {
  return (
    <>
      <Twinkle shift={0}>
        {at.filter((_, i) => i % 2 === 0).map(([x, y, r], i) => <Sparkle key={i} x={x} y={y} r={r} />)}
      </Twinkle>
      <Twinkle shift={0.5}>
        {at.filter((_, i) => i % 2 === 1).map(([x, y, r], i) => <Sparkle key={i} x={x} y={y} r={r} />)}
      </Twinkle>
    </>
  );
}

export function NotFound(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base>
        <Ground from={120} to={290} />
      </Base>
      <Float amp={4}>
        <Card x={140} y={66} w={120} h={156} r={10} />
        <TextLine x={158} y={96} w={66} />
        <TextLine x={158} y={116} w={84} />
        <TextLine x={158} y={136} w={48} />
      </Float>
      <Float amp={6} shift={0.35}>
        <InnerLens />
      </Float>
      <Sparkles at={[[110, 92, 7], [306, 104, 6], [318, 72, 4]]} />
    </Scene>
  );
}

function InnerLens() {
  const { p } = useScene();
  return (
    <G>
      <Lens cx={238} cy={190} r={38} color={p.ink} fill={p.paper} />
      <Path d="M226 178l24 24M250 178l-24 24" stroke={p.bad} strokeWidth={5} strokeLinecap="round" />
    </G>
  );
}

export function SearchIdle(props: SceneProps) {
  const { width } = props;
  return (
    <Scene {...props} duration={4200}>
      <Base />
      <Sweeper width={width} />
      <Sparkles at={[[118, 96, 7], [290, 86, 5], [300, 210, 6]]} />
    </Scene>
  );
}

function Sweeper({ width }: { width: number }) {
  const { motion } = useScene();
  const s = width / 400;
  return (
    <Layer style={{ transform: [{ translateX: motion.bob(14 * s, 0) }, { translateY: motion.bob(6 * s, 0.25) }] }}>
      <SearchGlass />
    </Layer>
  );
}

function SearchGlass() {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={188} cy={140} r={40} fill={p.primarySoft} opacity={0.28} />
      <Lens cx={188} cy={140} r={58} color={p.primary} />
      <TextLine x={150} y={128} w={52} color={p.primary} />
      <TextLine x={150} y={148} w={34} color={p.primarySoft} />
    </G>
  );
}

export function SearchEmpty(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base />
      <Float amp={5}>
        <SearchEmptyGlass />
      </Float>
      <Sparkles at={[[112, 100, 6], [292, 84, 5]]} />
    </Scene>
  );
}

function SearchEmptyGlass() {
  const { p } = useScene();
  return (
    <G>
      <Lens cx={188} cy={140} r={58} color={p.ink} fill={p.paper} />
      <Path d="M170 122l36 36M206 122l-36 36" stroke={p.bad} strokeWidth={7} strokeLinecap="round" />
    </G>
  );
}

export function SingleLocation(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base>
        <Ground />
        <ShopFront />
      </Base>
      <Twinkle shift={0} min={0.35}>
        <GhostShop />
      </Twinkle>
    </Scene>
  );
}

function ShopFront() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M130 244V146l50-38 50 38v98z" fill={p.paper} stroke={p.ink} strokeWidth={5} strokeLinejoin="round" />
      <Rect x={160} y={190} width={40} height={54} rx={4} fill={p.primarySoft} />
      <Rect x={146} y={156} width={24} height={20} rx={3} fill={p.primary} opacity={0.5} />
      <Rect x={190} y={156} width={24} height={20} rx={3} fill={p.primary} opacity={0.5} />
    </G>
  );
}

function GhostShop() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M252 244v-66l36-28 36 28v66z" fill="none" stroke={p.inkFaint} strokeWidth={5} strokeLinejoin="round" strokeDasharray="10 9" />
      <Path d="M288 186v28M274 200h28" stroke={p.primary} strokeWidth={5} strokeLinecap="round" />
    </G>
  );
}

export function NoScanResult(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base>
        <ScanCorners faint />
      </Base>
      <Float amp={4}>
        <Card x={142} y={84} w={116} h={140} r={10} />
        <QuestionMark />
      </Float>
    </Scene>
  );
}

function QuestionMark() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M168 170h64" stroke={p.inkFaint} strokeWidth={6} strokeLinecap="round" />
      <Path d="M168 190h40" stroke={p.inkFaint} strokeWidth={6} strokeLinecap="round" />
      <Circle cx={200} cy={126} r={22} fill={p.warn} />
      <Path d="M193 120a7 7 0 1110 6c-2 1-3 3-3 5" stroke="#fff" strokeWidth={4} strokeLinecap="round" fill="none" />
      <Circle cx={200} cy={139} r={2.5} fill="#fff" />
    </G>
  );
}

export function ScanCorners({ faint = false }: { faint?: boolean }) {
  const { p } = useScene();
  return (
    <Path
      d="M118 84v-14h16M282 84v-14h-16M118 224v14h16M282 224v14h-16"
      stroke={faint ? p.inkFaint : p.primary}
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

export function UnknownReport(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base>
        <Ground from={110} to={290} />
      </Base>
      <Float amp={3}>
        <Card x={132} y={76} w={136} h={148} r={10} />
        <ReportBars />
      </Float>
      <Float amp={6} shift={0.4}>
        <WarnDot />
      </Float>
    </Scene>
  );
}

function ReportBars() {
  const { p } = useScene();
  return <Path d="M156 200v-34M184 200v-56M212 200v-24M240 200v-70" stroke={p.inkFaint} strokeWidth={12} strokeLinecap="round" />;
}

function WarnDot() {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={272} cy={92} r={26} fill={p.warn} />
      <Path d="M272 80v16M272 104v3" stroke="#fff" strokeWidth={5} strokeLinecap="round" />
    </G>
  );
}

export function NoDocuments(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base>
        <BackSheet />
      </Base>
      <Float amp={4}>
        <Card x={150} y={74} w={100} h={130} r={9} />
        <DocLines />
      </Float>
      <Float amp={6} shift={0.3}>
        <PlusBadge cx={256} cy={190} />
      </Float>
      <Sparkles at={[[122, 88, 6], [296, 120, 5]]} />
    </Scene>
  );
}

function BackSheet() {
  const { p } = useScene();
  return <Rect x={130} y={92} width={100} height={130} rx={9} fill={p.paper2} stroke={p.edgeStrong} strokeWidth={2} transform="rotate(-8 180 157)" />;
}

function DocLines() {
  const { p } = useScene();
  return (
    <G>
      <TextLine x={168} y={100} w={40} color={p.primary} width={6} />
      <TextLine x={168} y={122} w={64} />
      <TextLine x={168} y={140} w={56} />
      <TextLine x={168} y={158} w={44} />
      <Rect x={168} y={174} width={64} height={16} rx={5} fill={p.primary} opacity={0.18} />
    </G>
  );
}

export function PlusBadge({ cx, cy }: { cx: number; cy: number }) {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={cx} cy={cy} r={26} fill={p.primary} />
      <Path d={`M${cx} ${cy - 11}v22M${cx - 11} ${cy}h22`} stroke="#fff" strokeWidth={5} strokeLinecap="round" />
    </G>
  );
}

export function NoContacts(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base />
      <Float amp={4}>
        <ContactFront />
      </Float>
      <Float amp={5} shift={0.45}>
        <ContactBack />
      </Float>
      <Sparkles at={[[118, 92, 6], [300, 92, 6]]} />
    </Scene>
  );
}

function ContactFront() {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={172} cy={120} r={30} fill={p.primary} />
      <Path d="M128 208c0-26 20-44 44-44s44 18 44 44z" fill={p.primary} />
    </G>
  );
}

function ContactBack() {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={252} cy={134} r={22} fill={p.paper} stroke={p.ink} strokeWidth={4} strokeDasharray="7 6" />
      <Path d="M218 206c0-20 15-34 34-34s34 14 34 34z" fill={p.paper} stroke={p.ink} strokeWidth={4} strokeDasharray="7 6" />
      <Path d="M252 126v16M244 134h16" stroke={p.primary} strokeWidth={4} strokeLinecap="round" />
    </G>
  );
}

export function NoItems(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base>
        <Ground from={120} to={280} y={252} />
      </Base>
      <Float amp={6}>
        <Box />
      </Float>
      <Sparkles at={[[116, 104, 7], [290, 92, 5], [300, 200, 5]]} />
    </Scene>
  );
}

function Box() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M200 92l72 38v72l-72 38-72-38v-72z" fill={p.box} stroke={p.boxEdge} strokeWidth={4} strokeLinejoin="round" />
      <Path d="M128 130l72 38 72-38" fill="none" stroke={p.boxEdge} strokeWidth={4} strokeLinejoin="round" />
      <Path d="M200 168v72" stroke={p.boxEdge} strokeWidth={4} />
      <Path d="M200 168l72-38v72l-72 38z" fill={p.boxEdge} opacity={0.35} />
      <Path d="M164 111l72 38v22" stroke={p.paper} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.85} />
    </G>
  );
}

export function NoExpenses(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base />
      <Float amp={4}>
        <Receipt />
      </Float>
      <Float amp={6} shift={0.5}>
        <Coin cx={268} cy={196} />
      </Float>
      <Sparkles at={[[116, 96, 6], [292, 96, 5]]} />
    </Scene>
  );
}

function Receipt() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M148 76h104v150l-17-12-18 12-17-12-18 12-17-12-17 12z" fill={p.paper} stroke={p.edgeStrong} strokeWidth={3} strokeLinejoin="round" />
      <TextLine x={170} y={108} w={60} color={p.primary} width={6} />
      <TextLine x={170} y={130} w={44} />
      <TextLine x={170} y={150} w={56} />
      <TextLine x={170} y={182} w={60} color={p.primarySoft} />
    </G>
  );
}

export function Coin({ cx, cy, r = 24 }: { cx: number; cy: number; r?: number }) {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={p.yellow} />
      <Circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#fff" strokeWidth={3} opacity={0.6} />
      <Path d={`M${cx - 7} ${cy - 9}h14M${cx - 7} ${cy - 2}h14M${cx - 4} ${cy - 9}c8 0 8 9 0 9l9 10`} stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </G>
  );
}

export function NoPayments(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base />
      <Float amp={4}>
        <Wallet />
      </Float>
      <Float amp={7} shift={0.35}>
        <Coin cx={282} cy={98} r={20} />
      </Float>
      <Sparkles at={[[116, 104, 6], [312, 150, 5]]} />
    </Scene>
  );
}

function Wallet() {
  const { p } = useScene();
  return (
    <G>
      <Rect x={124} y={108} width={152} height={98} rx={12} fill={p.primary} />
      <Rect x={124} y={108} width={152} height={22} rx={10} fill={p.primarySoft} opacity={0.6} />
      <Rect x={226} y={142} width={58} height={34} rx={8} fill={p.paper} stroke={p.edgeStrong} strokeWidth={2} />
      <Circle cx={244} cy={159} r={6} fill={p.primary} />
    </G>
  );
}

export function AllSettled(props: SceneProps) {
  return (
    <Scene {...props}>
      <Base tone="good" />
      <Float amp={5}>
        <SettledMark />
      </Float>
      <Sparkles at={[[132, 92, 8], [272, 84, 7], [290, 196, 6], [118, 196, 5]]} />
    </Scene>
  );
}

function SettledMark() {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={200} cy={146} r={60} fill={p.good} opacity={0.18} />
      <CheckBadge cx={200} cy={146} r={42} />
    </G>
  );
}

export function NoNotifications(props: SceneProps) {
  const { width } = props;
  return (
    <Scene {...props}>
      <Base />
      <Bell width={width} />
      <Float amp={6} shift={0.3}>
        <CheckBadge cx={248} cy={94} r={16} />
      </Float>
      <Sparkles at={[[128, 100, 6], [292, 168, 5]]} />
    </Scene>
  );
}

function Bell({ width }: { width: number }) {
  const { p, motion } = useScene();
  const rock = motion.phase.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '6deg', '0deg', '-6deg', '0deg'] });
  return (
    <Layer style={{ transform: [{ translateY: -60 * (width / 400) }, { rotate: rock }, { translateY: 60 * (width / 400) }] }}>
      <Path d="M200 80c-24 0-42 18-42 42v34l-16 22h116l-16-22v-34c0-24-18-42-42-42z" fill={p.paper} stroke={p.ink} strokeWidth={5} strokeLinejoin="round" />
      <Path d="M184 178a16 16 0 0032 0" fill="none" stroke={p.ink} strokeWidth={5} strokeLinecap="round" />
      <Circle cx={200} cy={76} r={6} fill={p.ink} />
    </Layer>
  );
}

export function NoMovements(props: SceneProps) {
  const { width } = props;
  return (
    <Scene {...props} duration={3000}>
      <Base>
        <Track />
      </Base>
      <Arrows width={width} />
    </Scene>
  );
}

function Track() {
  const { p } = useScene();
  return (
    <G>
      <TextLine x={130} y={154} w={140} color={p.inkFaint} />
      <Circle cx={200} cy={154} r={10} fill={p.paper} stroke={p.ink} strokeWidth={4} />
    </G>
  );
}

function Arrows({ width }: { width: number }) {
  const { p, motion } = useScene();
  const s = width / 400;
  return (
    <>
      <Layer style={{ transform: [{ translateX: motion.bob(8 * s, 0) }] }}>
        <Path d="M150 118h74l-18-18" fill="none" stroke={p.primary} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      </Layer>
      <Layer style={{ transform: [{ translateX: motion.bob(-8 * s, 0) }] }}>
        <Path d="M250 190h-74l18 18" fill="none" stroke={p.good} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      </Layer>
    </>
  );
}
