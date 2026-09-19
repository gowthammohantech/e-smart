import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { LIXI, LixiMark, LixiOrb } from '@/features/lixi/LixiOrb';
import { answer, greet, LIXI_SUGGESTIONS, LixiAction, LixiContext, LixiReply } from '@/features/lixi/brain';
import { detailRouteFor } from '@/features/documents/DocumentEditor';
import {
  useBaseCurrency,
  useComplianceSummary,
  useCurrentUser,
  useDocuments,
  useParties,
  usePayments,
  useReceivables,
} from '@/store/selectors';
import { summarizeTax } from '@/domain/reports';
import { resolveRange } from '@/lib/date';

type Message = { id: string; from: 'me' | 'lixi'; reply: LixiReply };

/** Long enough to read as thought, short enough not to feel slow. */
const THINK_MS = 650;

export default function LixiChat() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const currency = useBaseCurrency();
  const documents = useDocuments();
  const payments = usePayments();
  const parties = useParties();
  const receivables = useReceivables();
  const compliance = useComplianceSummary();
  const user = useCurrentUser();

  const ctx: LixiContext = useMemo(
    () => ({
      currency,
      documents,
      payments,
      parties,
      outstanding: receivables.outstanding,
      compliance,
      monthTax: summarizeTax(documents, currency, { range: resolveRange('thisMonth') }).outwardTotal,
      userName: user?.name,
    }),
    [currency, documents, payments, parties, receivables.outstanding, compliance, user?.name],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
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
    timer.current = setTimeout(() => {
      const reply = answer(text, ctx);
      setMessages((m) => [...m, { id: `${Date.now()}-lixi`, from: 'lixi', reply }]);
      setThinking(false);
      AccessibilityInfo.announceForAccessibility(reply.text);
    }, THINK_MS);
  };

  const act = (a: LixiAction) => {
    if (a.type === 'ask') return send(a.label.replace(/^About /, ''));
    router.push((a.type === 'document' ? detailRouteFor(a.kind, a.id) : a.route) as never);
  };

  const intro = useMemo(() => greet(ctx), [ctx]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
          accessibilityLabel="Close Lixi"
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
            {thinking ? 'Reading your books…' : 'Answers from your books, on this device'}
          </Text>
        </View>
        {messages.length ? (
          <Pressable
            onPress={() => setMessages([])}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
          >
            <MaterialCommunityIcons name="broom" size={22} color={t.c.muted} />
          </Pressable>
        ) : null}
      </View>

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
            <Text variant="h3" center>
              What can I dig up?
            </Text>
            <Text tone="muted" center style={{ maxWidth: 300 }}>
              {intro.text}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
              {LIXI_SUGGESTIONS.map((s) => (
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
          placeholder="Ask Lixi about sales, dues, GST…"
          placeholderTextColor={t.c.muted}
          returnKeyType="send"
          submitBehavior="submit"
          multiline
          accessibilityLabel="Message Lixi"
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
          }}
        />
        <Pressable
          onPress={() => send(draft)}
          disabled={!draft.trim() || thinking}
          accessibilityRole="button"
          accessibilityLabel="Send"
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

function MyBubble({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '82%',
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
  const toneColor = { good: t.c.good, warn: t.c.warn, bad: t.c.bad } as const;
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start', maxWidth: '92%' }}>
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
      accessibilityLabel="Lixi is thinking"
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
