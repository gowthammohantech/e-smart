import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ApiError } from '@esmart/api-client';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { NATIVE_DRIVER } from '@esmart/ui/theme/motion';
import { Text } from '@esmart/ui/components/Text';
import { WEB_INPUT_RESET, webFocusHalo } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { LIXI, LixiMark, LixiOrb } from '@esmart/ui/components/LixiOrb';
import { SkeletonGroup, SkeletonText } from '@esmart/ui/components/Skeleton';
import { greetWith, lixiSuggestions, LixiAction, LixiReply } from '../../features/lixi/brain';
import { askRemote, confirmRemote, remoteLixiAvailable, type PendingLixiAction } from '../../features/lixi/remote';
import { detailRouteFor } from '../../features/documents/DocumentEditor';
import { describeError } from '../../remote/errors';
import { useComplianceSummary, useCurrentUser, useDashboardScope, usePlan } from '../../store/selectors';
import { useHomeHub } from '../../remote/queries';
import { hasModule } from '@esmart/core/domain/plan';
import { useGoBack } from '../../navigation/useGoBack';

/** `pending`: a write this reply prepared, still to confirm; it can be reopened after a Cancel. */
type Message = { id: string; from: 'me' | 'lixi'; reply: LixiReply; pending?: PendingLixiAction };

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
  const goBack = useGoBack();
  const remote = remoteLixiAvailable();
  // Set when Lixi was opened by holding a tab: the question to answer first.
  const { ask: routeAsk } = useLocalSearchParams<{ ask?: string }>();
  const ask = initialAsk ?? routeAsk;
  const insets = useSafeAreaInsets();

  const compliance = useComplianceSummary();
  const user = useCurrentUser();
  const plan = usePlan();
  // The greeting's heads-up comes from the same server figures as the Home tab.
  const hubQuery = useHomeHub(useDashboardScope());
  const hub = hubQuery.data;
  // Until both answer, the heads-up would read "everything's tidy": a placeholder instead.
  const introReady = (!!hub || hubQuery.isError) && compliance.loaded;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  /** Only a browser shows the composer focused; the phone keeps its look. */
  const [composerFocused, setComposerFocused] = useState(false);
  const [thinking, setThinking] = useState(false);
  // A write the server's Lixi prepared; nothing happens until it is confirmed.
  const [action, setAction] = useState<PendingLixiAction | null>(null);
  const scroll = useRef<ScrollView>(null);
  // Each chat has its own number: an answer that arrives after "New chat" belongs to the old one and is dropped.
  const chat = useRef(0);
  // Follows new messages only while the person is at the bottom; reading back up isn't yanked down.
  const atBottom = useRef(true);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
  };
  // With the keyboard up, the composer sits on it, not above the home-indicator inset.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const newChat = () => {
    if (thinking) return;
    chat.current += 1;
    setMessages([]);
    setAction(null);
  };

  /** Another go at a question, unless asking again can't help (the month's allowance is used, or asking too fast). */
  const retryFor = (err: unknown, question: string): LixiAction[] | undefined =>
    err instanceof ApiError && (err.status === 429 || err.status === 403) ? undefined : [{ type: 'ask', label: tr('lixi:ui.tryAgain'), question }];

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setDraft('');
    setMessages((m) => [...m, { id: `${Date.now()}-me`, from: 'me', reply: { text } }]);
    // A question of their own brings the view down to the answer.
    atBottom.current = true;
    if (!remote) {
      // No company open yet: nothing to answer from, and it isn't the connection.
      say({ text: tr('lixi:ui.noCompany') });
      return;
    }
    setThinking(true);
    const asking = chat.current;
    const turns = [...messages, { from: 'me' as const, reply: { text } }].map((m) => ({
      role: m.from === 'me' ? ('user' as const) : ('assistant' as const),
      text: m.reply.text,
    }));
    askRemote(turns, i18n.language)
      .then((res) => {
        if (asking !== chat.current) return;
        // Offline or the model is down: say so, and offer to ask again.
        say(res?.reply ?? { text: tr('lixi:ui.unavailable'), actions: [{ type: 'ask', label: tr('lixi:ui.tryAgain'), question: text }] }, res?.pendingAction);
        if (res?.pendingAction) setAction(res.pendingAction);
      })
      .catch((err) => {
        if (asking !== chat.current) return;
        say({ text: describeError(err, tr), actions: retryFor(err, text) });
      });
  };

  const say = (reply: LixiReply, pendingAction?: PendingLixiAction) => {
    setMessages((m) => [...m, { id: `${Date.now()}-lixi`, from: 'lixi', reply, ...(pendingAction ? { pending: pendingAction } : {}) }]);
    setThinking(false);
    AccessibilityInfo.announceForAccessibility(reply.text);
  };

  const confirmAction = (a: PendingLixiAction) => {
    setAction(null);
    // Confirmed once: its bubble no longer offers it.
    setMessages((m) => m.map((x) => (x.pending?.token === a.token ? { ...x, pending: undefined } : x)));
    setThinking(true);
    const asking = chat.current;
    confirmRemote(a)
      .then((res) => {
        if (asking !== chat.current) return;
        if (res.ok) return say(res.reply);
        const text = res.expired
          ? tr('lixi:ui.actionExpired')
          : res.offline
            ? tr('lixi:ui.unavailable')
            : res.reason
              ? tr('lixi:ui.actionFailed', { reason: res.reason })
              : tr('lixi:ui.actionFailedGeneric');
        say({ text });
      })
      .catch((err) => {
        if (asking !== chat.current) return;
        say({ text: describeError(err, tr) });
      });
  };

  const act = (a: LixiAction) => {
    if (a.type === 'ask') return send(a.question ?? a.label);
    router.push((a.type === 'document' ? detailRouteFor(a.kind, a.id) : a.route) as never);
  };

  const intro = useMemo(
    () =>
      greetWith({
        userName: user?.name,
        overdue: hub?.receivable.overdueCount ?? 0,
        gst: compliance.eInvoice.failed + compliance.expiringSoon,
        lowStock: hasModule(plan ?? 'pro', 'inventory') ? (hub?.lowStockCount ?? 0) : 0,
      }),
    [user?.name, hub, compliance, plan],
  );

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
      style={{ flex: 1 }}
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
              {thinking ? tr('lixi:ui.reading') : tr('lixi:ui.subtitleRemote')}
            </Text>
          </View>
          {/* Not while an answer is on its way: it would land in the new chat, or ask to confirm something no longer shown. */}
          {messages.length ? (
            <Pressable
              onPress={newChat}
              disabled={thinking}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tr('lixi:ui.newChat')}
              accessibilityState={{ disabled: thinking }}
              style={{ padding: 6, opacity: thinking ? 0.4 : 1 }}
            >
              <Icon name="broom" size={20} color={t.c.muted} />
            </Pressable>
          ) : null}
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
          onPress={() => goBack('/(app)/(tabs)')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={tr('lixi:ui.closeLixi')}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevron-down" size={24} color={t.c.text} />
        </Pressable>
        <LixiOrb size={38} thinking={thinking} />
        <View style={{ flex: 1 }}>
          <Text variant="title" weight="700">
            Lixi
          </Text>
          <Text variant="caption" style={{ color: thinking ? LIXI.blue : t.c.muted }}>
            {thinking ? tr('lixi:ui.reading') : tr('lixi:ui.subtitleRemote')}
          </Text>
        </View>
        {messages.length ? (
          <Pressable
            onPress={newChat}
            disabled={thinking}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('lixi:ui.newChat')}
            accessibilityState={{ disabled: thinking }}
            style={{ opacity: thinking ? 0.4 : 1 }}
          >
            <Icon name="broom" size={22} color={t.c.muted} />
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
        onScroll={onScroll}
        scrollEventThrottle={64}
        onContentSizeChange={() => {
          if (atBottom.current) scroll.current?.scrollToEnd({ animated: true });
        }}
      >
        {messages.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.xxl }}>
            <LixiOrb size={96} thinking={thinking} face />
            <Text variant="h3" center>{tr('lixi:ui.prompt')}</Text>
            {introReady ? (
              <Text tone="muted" center style={{ maxWidth: 300 }}>
                {intro.text}
              </Text>
            ) : (
              <SkeletonGroup style={{ width: 260, maxWidth: '100%', alignItems: 'center' }}>
                <View style={{ width: '100%' }}>
                  <SkeletonText lines={2} lastWidth="70%" />
                </View>
              </SkeletonGroup>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
              {lixiSuggestions(plan).map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} />
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) =>
            m.from === 'me' ? (
              <MyBubble key={m.id} text={m.reply.text} />
            ) : (
              <LixiBubble
                key={m.id}
                reply={m.reply}
                onAction={act}
                // A prepared write that was cancelled can be looked at again.
                onReview={m.pending && !thinking && !action ? () => setAction(m.pending!) : undefined}
              />
            ),
          )
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
          paddingBottom: (keyboardUp ? 0 : insets.bottom) + t.spacing.sm,
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
            minHeight: 38,
            maxHeight: 120,
            paddingHorizontal: t.spacing.lg,
            paddingTop: 9,
            paddingBottom: 9,
            borderRadius: 19,
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
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: draft.trim() && !thinking ? LIXI.blue : t.c.mutedSoft,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <Icon name="arrow-up" size={20} color={draft.trim() && !thinking ? '#fff' : t.c.muted} />
        </Pressable>
      </View>

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
        <Icon name={icon as IconName} size={16} color={t.c.primary} />
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

function LixiBubble({ reply, onAction, onReview }: { reply: LixiReply; onAction: (a: LixiAction) => void; onReview?: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['lixi']);
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
        {reply.actions?.length || onReview ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {onReview ? <Chip label={tr('lixi:ui.review')} icon="check-circle-outline" onPress={onReview} /> : null}
            {(reply.actions ?? []).map((a) => (
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
      Animated.timing(phase, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }),
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
