import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import {
  useBaseCurrency,
  useDocuments,
  useExpenses,
  useItems,
  useParties,
  usePayables,
  useReceivables,
  useStockLevels,
} from '@/store/selectors';
import { isLowStock } from '@/domain/stockLedger';
import { formatMoney } from '@/lib/format';
import { inRange, resolveRange } from '@/lib/date';
import { money, sum } from '@/lib/money';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** A high-impact action the user must explicitly confirm. */
  action?: { label: string; route: string; confirm: string };
};

const SUGGESTIONS = [
  'Who owes me the most?',
  'How did sales do this month?',
  'What is low on stock?',
  'What did I spend on last month?',
  'Explain my overdue amount',
];

export default function Assistant() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const baseCurrency = useBaseCurrency();
  const receivables = useReceivables();
  const payables = usePayables();
  const invoices = useDocuments('invoice');
  const expenses = useExpenses();
  const items = useItems({ activeOnly: true });
  const stock = useStockLevels();
  const parties = useParties();

  const [input, setInput] = useState('');
  const [pendingAction, setPendingAction] = useState<Message['action'] | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "I can look things up in your books — receivables, sales, stock and spend. I'll never change a record on my own; anything that writes to your books needs your confirmation.",
    },
  ]);

  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown';

  const answer = useMemo(
    () =>
      (question: string): Message => {
        const q = question.toLowerCase();
        const id = `m${Date.now()}`;

        if (q.includes('owe') || q.includes('receivable') || q.includes('overdue')) {
          const top = [...receivables.outstanding].sort((a, b) => b.outstanding.minor - a.outstanding.minor).slice(0, 3);
          const overdue = receivables.outstanding.filter((o) => o.daysOverdue > 0);
          return {
            id,
            role: 'assistant',
            text:
              `You're owed ${formatMoney(receivables.summary.total)} across ${receivables.outstanding.length} open invoices. ` +
              `${formatMoney(receivables.summary.overdue)} of that is overdue on ${overdue.length} invoice${overdue.length === 1 ? '' : 's'}.\n\n` +
              `Biggest balances:\n` +
              top.map((o) => `• ${nameOf(o.document.partyId)} — ${formatMoney(o.outstanding)}${o.daysOverdue > 0 ? ` (${o.daysOverdue}d late)` : ''}`).join('\n'),
            action: { label: 'Open receivables', route: '/(app)/receivables', confirm: '' },
          };
        }

        if (q.includes('sale') || q.includes('revenue') || q.includes('month')) {
          const month = resolveRange('thisMonth');
          const live = invoices.filter((d) => inRange(d.date, month) && !['draft', 'cancelled'].includes(d.status));
          const total = sum(live.map((d) => money(Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), baseCurrency)), baseCurrency);
          return {
            id,
            role: 'assistant',
            text: `This month you've invoiced ${formatMoney(total)} across ${live.length} invoices — an average of ${formatMoney(money(live.length ? Math.round(total.minor / live.length) : 0, baseCurrency))} per invoice.`,
            action: { label: 'Open sales report', route: '/(app)/reports/sales-summary', confirm: '' },
          };
        }

        if (q.includes('stock') || q.includes('inventory') || q.includes('reorder')) {
          const low = items.filter((i) => isLowStock(i, stock[i.id] ?? 0));
          return {
            id,
            role: 'assistant',
            text: low.length
              ? `${low.length} item${low.length === 1 ? ' is' : 's are'} at or below the reorder level:\n\n` +
                low.slice(0, 5).map((i) => `• ${i.name} — ${stock[i.id] ?? 0} ${i.unit} left`).join('\n')
              : 'Nothing is below its reorder level right now.',
            action: { label: 'Open low stock', route: '/(app)/inventory/low-stock', confirm: '' },
          };
        }

        if (q.includes('spend') || q.includes('expense') || q.includes('cost')) {
          const last = resolveRange('lastMonth');
          const rows = expenses.filter((e) => inRange(e.date, last));
          const total = sum(rows.map((e) => money(Math.round(e.amount.minor * (e.exchangeRate || 1)), baseCurrency)), baseCurrency);
          return {
            id,
            role: 'assistant',
            text: `Last month you spent ${formatMoney(total)} across ${rows.length} expenses. You also owe suppliers ${formatMoney(payables.summary.total)}.`,
            action: { label: 'Open expense report', route: '/(app)/reports/expense-summary', confirm: '' },
          };
        }

        if (q.includes('invoice') && (q.includes('create') || q.includes('new') || q.includes('raise'))) {
          return {
            id,
            role: 'assistant',
            text: "I can open a new invoice for you, but I won't create or finalise one on my own — you'll fill in the customer and items and finalise it yourself.",
            action: { label: 'Start a new invoice', route: '/(app)/sales/invoices/new', confirm: 'Open a new invoice draft?' },
          };
        }

        return {
          id,
          role: 'assistant',
          text: "I can help with receivables, sales figures, stock levels and spend. Try asking who owes you the most, how sales are doing this month, or what's low on stock.",
        };
      },
    [receivables, invoices, items, stock, expenses, payables, baseCurrency, parties],
  );

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: q }]);
    setTimeout(() => {
      setMessages((m) => [...m, answer(q)]);
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 420);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Assistant' }} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: t.spacing.xl }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <View key={m.id} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <View
              style={{
                maxWidth: '88%',
                backgroundColor: m.role === 'user' ? t.c.primary : t.c.card,
                borderWidth: m.role === 'user' ? 0 : t.scheme === 'dark' ? 1 : 0,
                borderColor: t.c.line,
                borderRadius: t.radius.lg,
                borderBottomRightRadius: m.role === 'user' ? 4 : t.radius.lg,
                borderBottomLeftRadius: m.role === 'user' ? t.radius.lg : 4,
                padding: t.spacing.md,
                gap: t.spacing.sm,
              }}
            >
              <Text
                variant="small"
                style={{ color: m.role === 'user' ? t.c.onPrimary : t.c.text, lineHeight: 21 }}
              >
                {m.text}
              </Text>
              {m.action ? (
                <Button
                  title={m.action.label}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    if (m.action?.confirm) setPendingAction(m.action);
                    else router.push(m.action!.route as never);
                  }}
                />
              ) : null}
            </View>
          </View>
        ))}

        {messages.length <= 1 ? (
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Try asking
            </Text>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => send(s)}
                accessibilityRole="button"
                accessibilityLabel={s}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.sm,
                  paddingVertical: t.spacing.md,
                  paddingHorizontal: t.spacing.lg,
                  borderRadius: t.radius.md,
                  backgroundColor: pressed ? t.c.card2 : t.c.card,
                  borderWidth: t.scheme === 'dark' ? 1 : 0,
                  borderColor: t.c.line,
                })}
              >
                <MaterialCommunityIcons name="lightning-bolt-outline" size={17} color={t.c.primary} />
                <Text variant="small" style={{ flex: 1 }}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md, marginTop: t.spacing.md }}>
          <MaterialCommunityIcons name="shield-lock-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
            The assistant reads only the business you're signed into, and never creates, finalises or deletes a record
            without you confirming it.
          </Text>
        </Card>
      </ScrollView>

      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your business"
          placeholderTextColor={t.c.muted}
          onSubmitEditing={() => send(input)}
          accessibilityLabel="Ask the assistant"
          style={{
            flex: 1,
            height: 46,
            borderRadius: t.radius.md,
            backgroundColor: t.c.card2,
            borderWidth: 1,
            borderColor: t.c.line,
            paddingHorizontal: t.spacing.md,
            color: t.c.text,
            fontSize: t.fontSize.body,
          }}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!input.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: input.trim() ? t.c.primary : t.c.card2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="send" size={20} color={input.trim() ? t.c.onPrimary : t.c.muted} />
        </Pressable>
      </View>

      <ConfirmDialog
        visible={!!pendingAction}
        title={pendingAction?.confirm ?? ''}
        message="The assistant only opens the screen — you decide what gets saved."
        confirmLabel="Open"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const route = pendingAction?.route;
          setPendingAction(null);
          if (route) router.push(route as never);
        }}
      />
    </KeyboardAvoidingView>
  );
}
