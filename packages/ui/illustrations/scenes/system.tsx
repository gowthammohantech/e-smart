import React from 'react';
import { Circle, G, Path, Rect } from 'react-native-svg';
import { usePop } from '../motion';
import { Backdrop, Card, CheckBadge, Float, Ground, Layer, Person, Scene, SceneProps, Sparkle, TextLine, Twinkle, useScene } from './kit';

/*
 * System moments: mail sent, offline, something broke, a locked feature,
 * signing in and joining a team.
 */

export function MailSent(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
      </Layer>
      <Envelope />
      <SpeedLines />
      <PopTick />
    </Scene>
  );
}

function Envelope() {
  const { p, motion, width } = useScene();
  const arrive = usePop({ delay: 0, from: 0.85 });
  return (
    <Layer style={[arrive, { transform: [...arrive.transform, { translateY: motion.bob(5 * (width / 400), 0) }] }]}>
      <Rect x={120} y={106} width={160} height={112} rx={10} fill={p.paper} stroke={p.edgeStrong} strokeWidth={3} />
      <Path d="M120 116l80 56 80-56" fill="none" stroke={p.primary} strokeWidth={5} strokeLinejoin="round" />
      <Path d="M124 214l58-46M276 214l-58-46" stroke={p.inkFaint} strokeWidth={3} />
    </Layer>
  );
}

function SpeedLines() {
  const { p } = useScene();
  return (
    <Twinkle min={0.15}>
      <Path d="M78 130h34M64 156h48M88 182h24" stroke={p.primarySoft} strokeWidth={5} strokeLinecap="round" />
    </Twinkle>
  );
}

function PopTick() {
  const pop = usePop({ delay: 420 });
  return (
    <Layer style={pop}>
      <CheckBadge cx={272} cy={102} r={24} />
      <Sparkle x={306} y={72} r={7} />
    </Layer>
  );
}

export function Offline(props: SceneProps) {
  return (
    <Scene {...props} duration={4800}>
      <Layer>
        <Backdrop tone="warn" />
      </Layer>
      <Float amp={6}>
        <Cloud />
      </Float>
      <Twinkle min={0.35}>
        <SignalBars />
      </Twinkle>
    </Scene>
  );
}

function Cloud() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M146 176a34 34 0 016-67 48 48 0 0192-12 34 34 0 016 79z" fill={p.paper} stroke={p.ink} strokeWidth={5} strokeLinejoin="round" />
      <Path d="M158 96l92 92" stroke={p.warn} strokeWidth={8} strokeLinecap="round" />
    </G>
  );
}

function SignalBars() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M182 226v-8M200 226v-18M218 226v-28" stroke={p.inkFaint} strokeWidth={8} strokeLinecap="round" />
    </G>
  );
}

/** A page with a crack through it — the app hit an error. */
export function ErrorScene(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop tone="bad" />
        <Ground from={120} to={290} />
      </Layer>
      <Float amp={4}>
        <Card x={140} y={70} w={120} h={150} r={10} />
        <BrokenPage />
      </Float>
      <Float amp={7} shift={0.4}>
        <Bolt />
      </Float>
    </Scene>
  );
}

function BrokenPage() {
  const { p } = useScene();
  return (
    <G>
      <TextLine x={158} y={98} w={62} />
      <TextLine x={158} y={118} w={84} />
      <Path d="M140 150l30-8 14 16 22-14 18 12 36-10" stroke={p.bad} strokeWidth={4} strokeLinejoin="round" fill="none" />
      <TextLine x={158} y={184} w={52} />
      <TextLine x={158} y={202} w={70} />
    </G>
  );
}

function Bolt() {
  const { p } = useScene();
  return (
    <G>
      <Circle cx={278} cy={96} r={28} fill={p.bad} />
      <Path d="M282 78l-14 22h12l-6 16 16-24h-12z" fill="#fff" />
    </G>
  );
}

export function Locked(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <Ground from={130} to={270} y={240} />
      </Layer>
      <Float amp={5}>
        <Padlock />
      </Float>
      <Twinkle>
        <Sparkle x={120} y={96} r={8} />
        <Sparkle x={290} y={190} r={6} />
      </Twinkle>
      <Twinkle shift={0.5}>
        <Sparkle x={282} y={80} r={7} />
        <Sparkle x={112} y={186} r={5} />
      </Twinkle>
    </Scene>
  );
}

function Padlock() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M166 132v-24a34 34 0 0168 0v24" fill="none" stroke={p.ink} strokeWidth={12} strokeLinecap="round" />
      <Rect x={146} y={128} width={108} height={90} rx={14} fill={p.primary} />
      <Rect x={146} y={128} width={108} height={22} rx={12} fill={p.primarySoft} opacity={0.5} />
      <Circle cx={200} cy={168} r={11} fill="#fff" />
      <Path d="M200 172v18" stroke="#fff" strokeWidth={7} strokeLinecap="round" />
      <Path d="M262 112l10-6M266 128h12" stroke={p.yellow} strokeWidth={5} strokeLinecap="round" />
    </G>
  );
}

/** Signing in: a phone with a shield, the account kept safe. */
export function Secure(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <Ground from={110} to={290} />
      </Layer>
      <Float amp={4}>
        <Phone />
      </Float>
      <Float amp={7} shift={0.35}>
        <Shield />
      </Float>
      <Twinkle>
        <Sparkle x={118} y={92} r={7} />
      </Twinkle>
      <Twinkle shift={0.5}>
        <Sparkle x={304} y={182} r={6} />
      </Twinkle>
    </Scene>
  );
}

function Phone() {
  const { p } = useScene();
  return (
    <G>
      <Rect x={150} y={56} width={96} height={180} rx={16} fill={p.phone} />
      <Rect x={158} y={70} width={80} height={152} rx={8} fill={p.paper} />
      <Circle cx={198} cy={104} r={16} fill={p.primary} opacity={0.2} />
      <Circle cx={198} cy={100} r={6} fill={p.primary} />
      <Path d="M188 114c0-6 4-9 10-9s10 3 10 9" fill={p.primary} />
      <Rect x={170} y={134} width={56} height={14} rx={5} fill={p.paper2} stroke={p.edgeStrong} strokeWidth={1.5} />
      <Rect x={170} y={156} width={56} height={14} rx={5} fill={p.paper2} stroke={p.edgeStrong} strokeWidth={1.5} />
      <Rect x={170} y={182} width={56} height={16} rx={6} fill={p.primary} />
    </G>
  );
}

function Shield() {
  const { p } = useScene();
  return (
    <G>
      <Path d="M268 122l34 12v24c0 22-15 36-34 42-19-6-34-20-34-42v-24z" fill={p.good} />
      <Path d="M254 160l10 10 18-20" stroke="#fff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </G>
  );
}

/** Joining a team: two people and an envelope-shaped invite between them. */
export function Invite(props: SceneProps) {
  return (
    <Scene {...props}>
      <Layer>
        <Backdrop />
        <Ground />
        <Person x={88} y={136} s={1} wave />
        <InviteeRight />
      </Layer>
      <Float amp={8} shift={0.2}>
        <InviteCard />
      </Float>
      <Twinkle>
        <Sparkle x={200} y={70} r={8} />
      </Twinkle>
    </Scene>
  );
}

function InviteeRight() {
  const { p } = useScene();
  return <Person x={264} y={136} s={1} accent={p.cyan} />;
}

function InviteCard() {
  const { p } = useScene();
  return (
    <G>
      <Card x={160} y={96} w={80} h={56} r={8} />
      <Path d="M160 102l40 26 40-26" fill="none" stroke={p.primary} strokeWidth={4} strokeLinejoin="round" />
      <Circle cx={236} cy={98} r={10} fill={p.red} />
      <TextLine x={174} y={140} w={32} />
    </G>
  );
}
