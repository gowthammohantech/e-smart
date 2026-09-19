import React from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { LixiOrb } from '@/features/lixi/LixiOrb';
import { ScenePalette, useScenePalette } from './scenePalette';
import { useLoopPhase } from './useLoopPhase';

/** Scene coordinates. Every layer shares this box so they line up at any size. */
const VW = 360;
const VH = 280;
const ORB = { x: 312, y: 46 };

/**
 * The Welcome screen's hero: a shopkeeper at their counter, the phone that runs
 * the books, a sales chart, a coin and stock, with Lixi watching over them and
 * offering a nudge. Drawn in SVG so it stays crisp, follows the theme and ships
 * no assets. Each piece floats on its own phase; motion stops under Reduce
 * Motion. Decorative: the tagline beside it carries the meaning.
 */
export function WelcomeScene() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth']);
  const p = useScenePalette();
  const { width: winW, height: winH } = useWindowDimensions();
  const { bob, twinkle } = useLoopPhase();

  // Fit the width, but leave room for the logo and buttons on short phones.
  const width = Math.min(winW - t.spacing.xl * 2, 340, winH * 0.36 * (VW / VH));
  const s = width / VW;
  const height = VH * s;

  const layer = (children: React.ReactNode, style?: object) => (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`}>
        {children}
      </Svg>
    </Animated.View>
  );

  return (
    <View
      style={{ width, height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {layer(<Base p={p} />)}
      {layer(<Chart p={p} />, { transform: [{ translateY: bob(5, 0.3) }] })}
      {layer(<Phone p={p} />, { transform: [{ translateY: bob(5, 0) }] })}
      {layer(<Coin p={p} />, { transform: [{ translateY: bob(4, 0.6) }] })}
      {layer(<Sparkles p={p} set={0} />, { opacity: twinkle(0) })}
      {layer(<Sparkles p={p} set={1} />, { opacity: twinkle(0.5) })}

      <Animated.View
        style={{
          position: 'absolute',
          right: (VW - ORB.x + 34) * s,
          top: 2 * s,
          maxWidth: 176,
          paddingVertical: 7,
          paddingHorizontal: 10,
          borderRadius: t.radius.md,
          borderBottomRightRadius: 4,
          backgroundColor: t.c.card,
          borderWidth: 1,
          borderColor: t.c.line,
          transform: [{ translateY: bob(2, 0.1) }],
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 3,
        }}
      >
        <Text variant="caption" style={{ fontSize: 11 }}>
          {tr('auth:welcome.mockDue', { count: 3, amount: '₹12,400' })}
        </Text>
        <Text variant="caption" tone="primary" weight="700" style={{ fontSize: 11 }}>
          {tr('auth:welcome.mockCta')}
        </Text>
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: ORB.x * s - 26,
          top: ORB.y * s - 26,
          transform: [{ translateY: bob(3, 0.8) }],
        }}
      >
        <LixiOrb size={52} />
      </Animated.View>
    </View>
  );
}

/** A four-point sparkle centred on (x, y). */
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

function Base({ p }: { p: ScenePalette }) {
  const stripes = Array.from({ length: 7 }, (_, i) => i);
  return (
    <G>
      {/* Backdrop blobs: brand blue, Lixi cyan and gold. */}
      <Ellipse cx={180} cy={176} rx={164} ry={92} fill={p.primary} opacity={p.blob} />
      <Circle cx={300} cy={92} r={62} fill={p.cyan} opacity={p.blob} />
      <Circle cx={58} cy={132} r={52} fill={p.yellow} opacity={p.blob} />

      {/* Lixi reading the books: dashed links to the phone and the chart. */}
      <Path d={`M${ORB.x - 22} ${ORB.y + 18}Q272 78 250 104`} stroke={p.cyan} strokeWidth={2} strokeDasharray="4 5" strokeLinecap="round" fill="none" />
      <Path d={`M${ORB.x} ${ORB.y + 28}L304 110`} stroke={p.cyan} strokeWidth={2} strokeDasharray="4 5" strokeLinecap="round" fill="none" />

      {/* Ground. */}
      <Path d="M16 250h328" stroke={p.ink} strokeWidth={3} strokeLinecap="round" opacity={0.35} />

      {/* Shopkeeper, behind the counter. */}
      <G transform="translate(84 116)">
        <Path d="M0 62V34c0-11 8-20 19-20h10c11 0 19 9 19 20v28z" fill={p.primary} />
        <Path d="M18 14h12l-6 12z" fill={p.paper} />
        <Circle cx={24} cy={4} r={13} fill={p.skin} />
        <Path d="M11 2c0-8 6-13 13-13s13 5 13 13c0-4-6-6-13-6s-13 2-13 6z" fill={p.hair} />
        <Path d="M48 36l14-18" stroke={p.primary} strokeWidth={9} strokeLinecap="round" />
        <Circle cx={63} cy={16} r={5} fill={p.skin} />
        <Path d="M0 36l-8 24" stroke={p.primary} strokeWidth={9} strokeLinecap="round" />
      </G>

      {/* Awning posts and striped awning. */}
      <Rect x={30} y={84} width={5} height={104} rx={2} fill={p.woodDark} />
      <Rect x={195} y={84} width={5} height={104} rx={2} fill={p.woodDark} />
      {stripes.map((i) => (
        <Rect key={`s${i}`} x={24 + i * 26} y={62} width={26} height={22} fill={i % 2 ? p.paper : p.red} />
      ))}
      {stripes.map((i) => (
        <Circle key={`c${i}`} cx={37 + i * 26} cy={84} r={13} fill={i % 2 ? p.paper : p.red} />
      ))}
      <Rect x={24} y={62} width={182} height={22} fill="none" stroke={p.edge} strokeWidth={1.5} />

      {/* Stock on the counter. */}
      <Rect x={40} y={158} width={36} height={28} rx={3} fill={p.box} stroke={p.boxEdge} strokeWidth={1.5} />
      <Path d="M58 158v28" stroke={p.boxEdge} strokeWidth={2} />
      <Rect x={46} y={136} width={26} height={22} rx={3} fill={p.box} stroke={p.boxEdge} strokeWidth={1.5} />
      <Path d="M59 136v22" stroke={p.boxEdge} strokeWidth={2} />

      {/* Counter. */}
      <Rect x={30} y={186} width={170} height={64} rx={4} fill={p.paper2} stroke={p.edge} strokeWidth={1.5} />
      <Rect x={22} y={180} width={186} height={10} rx={3} fill={p.wood} />
      <Rect x={46} y={204} width={138} height={30} rx={6} fill={p.primary} opacity={0.14} />
      <Path d="M60 219h60" stroke={p.primary} strokeWidth={5} strokeLinecap="round" opacity={0.6} />
      <Path d="M130 219h36" stroke={p.yellow} strokeWidth={5} strokeLinecap="round" />

      {/* Plant. */}
      <Ellipse cx={324} cy={206} rx={7} ry={17} fill={p.good} transform="rotate(-24 324 206)" />
      <Ellipse cx={340} cy={204} rx={7} ry={18} fill={p.good} opacity={0.8} transform="rotate(22 340 204)" />
      <Ellipse cx={332} cy={200} rx={6} ry={19} fill={p.good} />
      <Path d="M318 222h28l-4 28h-20z" fill={p.bad} />
    </G>
  );
}

function Phone({ p }: { p: ScenePalette }) {
  return (
    <G>
      <Rect x={176} y={96} width={72} height={130} rx={13} fill={p.phone} />
      <Rect x={181} y={104} width={62} height={114} rx={8} fill={p.paper} />
      {/* Artwork, not copy: this is the drawn invoice inside a 62px-wide
          phone at fontSize 7. Tamil would not fit, and "TAX INVOICE" is the
          statutory document title, which stays English on real invoices too. */}
      <SvgText x={188} y={118} fontSize={7} fontWeight="700" fill={p.primary}>
        TAX INVOICE
      </SvgText>
      <Path d="M188 128h46M188 138h36M188 148h42" stroke={p.inkSoft} strokeWidth={4} strokeLinecap="round" />
      <Rect x={188} y={155} width={20} height={9} rx={4.5} fill={p.cyan} opacity={0.25} />
      <SvgText x={191} y={162} fontSize={6} fontWeight="700" fill={p.info}>
        GST
      </SvgText>
      <Path d="M188 174h48" stroke={p.edge} strokeWidth={1.5} />
      <SvgText x={188} y={188} fontSize={10} fontWeight="800" fill={p.ink}>
        ₹4,720
      </SvgText>
      <Circle cx={228} cy={200} r={10} fill={p.good} />
      <Path d="M223 200l3.5 3.5 6.5-7" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </G>
  );
}

function Chart({ p }: { p: ScenePalette }) {
  const bars = [
    { x: 268, h: 14, c: p.info },
    { x: 282, h: 22, c: p.info },
    { x: 296, h: 18, c: p.good },
    { x: 310, h: 32, c: p.good },
  ];
  return (
    <G>
      <Rect x={258} y={110} width={82} height={66} rx={10} fill={p.paper} stroke={p.edge} strokeWidth={1.5} />
      {bars.map((b) => (
        <Rect key={b.x} x={b.x} y={166 - b.h} width={9} height={b.h} rx={2} fill={b.c} />
      ))}
      <Path d="M270 146L286 136L300 140L322 120" stroke={p.yellow} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={322} cy={120} r={3.5} fill={p.yellow} />
    </G>
  );
}

function Coin({ p }: { p: ScenePalette }) {
  return (
    <G>
      <Circle cx={272} cy={214} r={17} fill={p.yellow} />
      <Circle cx={272} cy={214} r={12} fill="none" stroke="#FFFFFF" strokeWidth={1.5} opacity={0.6} />
      <SvgText x={272} y={220} fontSize={16} fontWeight="800" fill="#FFFFFF" textAnchor="middle">
        ₹
      </SvgText>
    </G>
  );
}

/** Two sets of sparkles, twinkled out of step with each other. */
function Sparkles({ p, set }: { p: ScenePalette; set: 0 | 1 }) {
  const sets = [
    [
      { x: 262, y: 70, r: 6, c: p.yellow },
      { x: 348, y: 96, r: 5, c: p.red },
      { x: 20, y: 44, r: 6, c: p.yellow },
    ],
    [
      { x: 350, y: 16, r: 5, c: p.cyan },
      { x: 12, y: 112, r: 5, c: p.cyan },
      { x: 236, y: 244, r: 4, c: p.red },
    ],
  ];
  return (
    <G>
      {sets[set].map((d) => (
        <Path key={`${d.x}-${d.y}`} d={star(d.x, d.y, d.r)} fill={d.c} />
      ))}
    </G>
  );
}
