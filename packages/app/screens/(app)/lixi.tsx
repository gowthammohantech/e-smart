import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Text } from '@esmart/ui/components/Text';
import { WEB_INPUT_RESET, webFocusHalo } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { LIXI, LixiMark, LixiOrb } from '@esmart/ui/components/LixiOrb';
import { answer, greet, lixiSuggestions, LixiAction, LixiContext, LixiReply } from '../../features/lixi/brain';
import { askRemote, confirmRemote, remoteLixiAvailable, type PendingLixiAction } from '../../features/lixi/remote';
import { detailRouteFor } from '../../features/documents/DocumentEditor';
import { describeError } from '../../remote/errors';
import {
  useBaseCurrency,
  useComplianceSummary,
  useCurrentUser,
  useDocuments,
  useExpenses,
  useItems,
  useParties,
  usePayables,
  usePayments,
  usePlan,
  useReceivables,
  useStockLevels,
} from '../../store/selectors';
import { summarizeTax } from '@esmart/core/domain/reports';
import { isLowStock } from '@esmart/core/domain/stockLedger';
import { resolveRange } from '@esmart/core/lib/date';

type Message = { id: string; from: 'me' | 'lixi'; reply: LixiReply };

/** Long enough to read as thought, short enough not to feel slow. */
const THINK_MS = 650;

type LixiChatProps = {
  /** Set when the chat sits in the web desktop's side panel instead of being a screen. */
  onClose?: () => void;
  /** The question to answer first, when it isn't coming from the route. */
  initialAsk?: string;
};

export default function LixiChat({ onClose, initialAsk }: LixiChatProps = {}) {
  const t = useTheme();
  const { t: tr, i18n } = useTranslation(['lixi']);
  const router = useRouter();
  const remote = remoteLixiAvailable();
  // Set when Lixi was opened by holding a tab: the question to answer first.
  const { ask: routeAsk } = useLocalSearchParams<{ ask?: string }>();
  const ask = initialAsk ?? routeAsk;
  const insets = useSafeAreaInsets();

  const currency = useBaseCurrency();
  const documents = useDocuments();
  const payments = usePayments();
  const expenses = useExpenses();
  const parties = useParties();
  const receivables = useReceivables();
  const payables = usePayables();
  const items = useItems({ activeOnly: true });
  const stock = useStockLevels();
  const compliance = useComplianceSummary();
  const user = useCurrentUser();
  const plan = usePlan();

  const ctx: LixiContext = useMemo(
    () => ({
      currency,
      documents,
      payments,
      expenses,
      parties,
      receivables,
      payables,
      lowStock: items
        .filter((i) => isLowStock(i, stock[i.id] ?? 0))
        .map((i) => ({ name: i.name, onHand: stock[i.id] ?? 0, unit: i.unit })),
      compliance: {
        failed: compliance.eInvoice.failed,
        generated: compliance.eInvoice.generated,
        pending: compliance.eInvoice.pending,
        ewbActive: compliance.eway.active,
        ewbExpiringSoon: compliance.expiringSoon,
        ewbExpired: compliance.eway.expired,
        ewbMissing: compliance.ewayOutstanding,
      },
      monthTax: summarizeTax(documents, currency, { range: resolveRange('thisMonth') }).outwardTotal,
      userName: user?.name,
      plan,
    }),
    [currency, documents, payments, expenses, parties, receivables, payables, items, stock, compliance, user?.name, plan],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  /** Only a browser shows the composer focused; the phone keeps its look. */
  const [composerFocused, setComposerFocused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [pending, setPending] = useState<Extract<LixiAction, { type: 'route' }> | null>(null);
  // A write the server's Lixi prepared; nothing happens until it is confirmed.
  const [action, setAction] = useState<PendingLixiAction | null>(null);
  const scroll = useRef<ScrollView>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setDraft('');
    setMessages((m) => [...m, { id: `${Date.now()}-me`, from: 'me', reply: { text } }]);
    setThinking(true);
    if (remote) {
      const turns = [...messages, { from: 'me' as const, reply: { text } }].map((m) => ({
        role: m.from === 'me' ? ('user' as const) : ('assistant' as const),
        text: m.reply.text,
      }));
      askRemote(turns, i18n.language)
        // Offline or the model is down: the local brain answers instead.
        .then((res) => {
          say(res?.reply ?? answer(text, ctx));
          if (res?.pendingAction) setAction(res.pendingAction);
        })
        .catch((err) => say({ text: describeError(err, tr) }));
      return;
    }
    timer.current = setTimeout(() => say(answer(text, ctx)), THINK_MS);
  };

  const say = (reply: LixiReply) => {
    setMessages((m) => [...m, { id: `${Date.now()}-lixi`, from: 'lixi', reply }]);
    setThinking(false);
    AccessibilityInfo.announceForAccessibility(reply.text);
  };

  const confirmAction = (a: PendingLixiAction) => {
    setAction(null);
    setThinking(true);
    confirmRemote(a)
      .then((res) =>
        say(res.ok ? res.reply : { text: res.expired ? tr('lixi:ui.actionExpired') : tr('lixi:ui.actionFailed', { reason: res.reason }) }),
      )
      .catch((err) => say({ text: describeError(err, tr) }));
  };

  const act = (a: LixiAction) => {
    if (a.type === 'ask') return send(a.question ?? a.label);
    // Opening a form that could write to the books is confirmed first.
    if (a.type === 'route' && a.confirm) return setPending(a);
    router.push((a.type === 'document' ? detailRouteFor(a.kind, a.id) : a.route) as never);
  };

  const intro = useMemo(() => greet(ctx), [ctx]);

  const asked = useRef(false);
  useEffect(() => {
    if (!ask || asked.current) return;
    asked.current = true;
    send(ask);
    // Only ever the first question; `send` is fresh every render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {onClose ? (
        // The desktop panel's header: Lixi and what it is, a sound toggle, close.
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: t.c.line,
          }}
        >
          <LixiOrb size={38} thinking={thinking} />
          <View style={{ flex: 1 }}>
            <Text variant="title" weight="700">
              Lixi
            </Text>
            <Text variant="caption" style={{ color: thinking ? LIXI.blue : t.c.muted }}>
              {thinking ? tr('lixi:ui.reading') : 'AI assistant · preview'}
            </Text>
          </View>
          {messages.length ? (
            <Pressable
              onPress={() => setMessages([])}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tr('lixi:ui.newChat')}
              style={{ padding: 6 }}
            >
              <MaterialCommunityIcons name="broom" size={20} color={t.c.muted} />
            </Pressable>
          ) : null}
          {/* Only the switch for now; it doesn't change anything yet. */}
          <Pressable
            onPress={() => setSoundOn((on) => !on)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={soundOn ? 'Mute Lixi' : 'Unmute Lixi'}
            accessibilityState={{ selected: soundOn }}
            style={{ padding: 6 }}
          >
            <Feather name={soundOn ? 'volume-2' : 'volume-x'} size={20} color={t.c.muted} />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr('lixi:ui.closeLixi')}
            style={{ padding: 6 }}
          >
            <Feather name="x" size={22} color={t.c.muted} />
          </Pressable>
        </View>
      ) : (
        <>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + t.spacing.sm,
          paddingHorizontal: t.spacing.lg,
          paddingBottom: t.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          borderBottomWidth: 0.5,
          borderBottomColor: t.c.line,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={tr('lixi:ui.closeLixi')}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <MaterialCommunityIcons name="chevron-down" size={24} color={t.c.text} />
        </Pressable>
        <LixiOrb size={38} thinking={thinking} />
        <View style={{ flex: 1 }}>
          <Text variant="title" weight="700">
            Lixi
          </Text>
          <Text variant="caption" style={{ color: thinking ? LIXI.blue : t.c.muted }}>
            {thinking ? tr('lixi:ui.reading') : tr(remote ? 'lixi:ui.subtitleRemote' : 'lixi:ui.subtitleLocal')}
          </Text>
        </View>
        {messages.length ? (
          <Pressable
            onPress={() => setMessages([])}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('lixi:ui.newChat')}
          >
            <MaterialCommunityIcons name="broom" size={22} color={t.c.muted} />
          </Pressable>
        ) : null}
      </View>

        </>
      )}

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.xxl }}>
            <LixiOrb size={96} />
            <Text variant="h3" center>{tr('lixi:ui.prompt')}</Text>
            <Text tone="muted" center style={{ maxWidth: 300 }}>
              {intro.text}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
              {lixiSuggestions(plan).map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} />
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) => (m.from === 'me' ? <MyBubble key={m.id} text={m.reply.text} /> : <LixiBubble key={m.id} reply={m.reply} onAction={act} />))
        )}
        {thinking ? <TypingDots /> : null}
      </ScrollView>

      {/* Composer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
          paddingBottom: insets.bottom + t.spacing.sm,
          borderTopWidth: 0.5,
          borderTopColor: t.c.line,
          backgroundColor: t.c.bg,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => send(draft)}
          placeholder={tr('lixi:ui.inputPlaceholder')}
          placeholderTextColor={t.c.muted}
          returnKeyType="send"
          submitBehavior="submit"
          multiline
          accessibilityLabel={tr('lixi:ui.messageLixi')}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            paddingHorizontal: t.spacing.lg,
            paddingTop: 12,
            paddingBottom: 12,
            borderRadius: 22,
            backgroundColor: t.c.card,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
            color: t.c.text,
            fontSize: t.fontSize.body,
            ...webFocusHalo(t, composerFocused),
            ...WEB_INPUT_RESET,
          }}
        />
        <Pressable
          onPress={() => send(draft)}
          disabled={!draft.trim() || thinking}
          accessibilityRole="button"
          accessibilityLabel={tr('lixi:ui.send')}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: draft.trim() && !thinking ? LIXI.blue : t.c.mutedSoft,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <MaterialCommunityIcons name="arrow-up" size={22} color={draft.trim() && !thinking ? '#fff' : t.c.muted} />
        </Pressable>
      </View>

      <ConfirmDialog
        visible={!!pending}
        title={pending?.confirm ?? ''}
        message={tr('lixi:ui.openOnlyNote')}
        confirmLabel={tr('lixi:ui.open')}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const route = pending?.route;
          setPending(null);
          if (route) router.push(route as never);
        }}
      />
      <ConfirmDialog
        visible={!!action}
        title={action?.summary ?? ''}
        message={tr('lixi:ui.confirmNote')}
        confirmLabel={tr('lixi:ui.confirm')}
        icon="check-circle-outline"
        onCancel={() => setAction(null)}
        onConfirm={() => action && confirmAction(action)}
      />
    </KeyboardAvoidingView>
  );
}

function Chip({ label, icon, onPress }: { label: string; icon?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: t.spacing.md,
        paddingVertical: 8,
        borderRadius: t.radius.pill,
        backgroundColor: t.c.chip,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={16} color={t.c.primary} />
      ) : null}
      <Text variant="small" tone="primary" weight="600">
        {label}
      </Text>
    </Pressable>
  );
}

/** Chat bubbles share the row on a phone; on a desktop they stop at a readable line length. */
const BUBBLE_MAX_WIDTH = 640;

function MyBubble({ text }: { text: string }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: desktop ? BUBBLE_MAX_WIDTH : '82%',
        paddingHorizontal: t.spacing.lg,
        paddingVertical: 10,
        borderRadius: t.radius.xl,
        borderBottomRightRadius: 6,
        backgroundColor: t.c.primary,
      }}
    >
      <Text tone="onPrimary">{text}</Text>
    </View>
  );
}

function LixiBubble({ reply, onAction }: { reply: LixiReply; onAction: (a: LixiAction) => void }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const toneColor = { good: t.c.good, warn: t.c.warn, bad: t.c.bad } as const;
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start', maxWidth: desktop ? BUBBLE_MAX_WIDTH : '92%' }}>
      <View style={{ marginTop: 2 }}>
        <LixiMark size={26} />
      </View>
      <View style={{ flexShrink: 1, gap: t.spacing.sm }}>
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingVertical: 10,
            borderRadius: t.radius.xl,
            borderTopLeftRadius: 6,
            backgroundColor: t.c.card,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
            gap: t.spacing.md,
          }}
        >
          <Text>{reply.text}</Text>
          {reply.stats?.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {reply.stats.map((s) => (
                <View
                  key={s.label}
                  style={{
                    flexGrow: 1,
                    minWidth: '45%',
                    padding: t.spacing.sm,
                    borderRadius: t.radius.md,
                    backgroundColor: t.c.card2,
                  }}
                >
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text variant="mono" weight="700" style={{ fontSize: t.fontSize.body, color: s.tone ? toneColor[s.tone] : t.c.text }}>
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {reply.actions?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {reply.actions.map((a) => (
              <Chip
                key={a.label}
                label={a.label}
                icon={a.type === 'route' ? a.icon : a.type === 'document' ? 'file-document-outline' : 'chat-question-outline'}
                onPress={() => onAction(a)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TypingDots() {
  const t = useTheme();
  const { t: tr } = useTranslation(['lixi']);
  const [phase] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  return (
    <View
      accessibilityLabel={tr('lixi:ui.thinking')}
      style={{
        alignSelf: 'flex-start',
        marginLeft: 34,
        flexDirection: 'row',
        gap: 5,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: 14,
        borderRadius: t.radius.xl,
        borderTopLeftRadius: 6,
        backgroundColor: t.c.card,
      }}
    >
      {[0, 1, 2].map((i) => {
        const start = i * 0.2;
        const translateY = phase.interpolate({
          inputRange: [0, start, start + 0.2, start + 0.4, 1],
          outputRange: [0, 0, -5, 0, 0],
        });
        return (
          <Animated.View
            key={i}
            style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: [LIXI.blue, LIXI.red, LIXI.yellow][i], transform: [{ translateY }] }}
          />
        );
      })}
    </View>
  );
}
