import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { useOcrStore } from '@/features/ocr/ocrStore';
import { formatMoney, formatPercent, formatQty } from '@/lib/format';
import { fromMajor, money } from '@/lib/money';
import { useBaseCurrency } from '@/store/selectors';

function confidenceTone(c: number): 'success' | 'warning' | 'danger' {
  if (c >= 0.9) return 'success';
  if (c >= 0.75) return 'warning';
  return 'danger';
}

export default function OcrReview() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const baseCurrency = useBaseCurrency();
  const result = useOcrStore((s) => s.result);
  const updateField = useOcrStore((s) => s.updateField);

  const lowConfidence = useMemo(
    () => (result ? result.fields.filter((f) => f.confidence < 0.75).length : 0),
    [result],
  );

  if (!result) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.review') }} />
        <EmptyState
          illustration="no-scan-result"
              icon="text-recognition"
          title={tr('inventory:ocr.nothingScanned')}
          message={tr('inventory:ocr.nothingScannedBody')}
          actionLabel={tr('inventory:ocr.scanBill')}
          onAction={() => router.replace('/(app)/ocr/capture')}
        />
      </View>
    );
  }

  const amountField = result.fields.find((f) => f.key === 'amount');
  const total = amountField ? fromMajor(amountField.value || '0', baseCurrency) : money(0, baseCurrency);
  const isExpense = result.kind === 'expense';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.reviewExtraction') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        {result.imageUri ? (
          <Card padded={false} style={{ height: 180 }}>
            <Image source={{ uri: result.imageUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </Card>
        ) : (
          <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <MaterialCommunityIcons name="file-document-outline" size={22} color={t.c.muted} />
            <Text variant="small" tone="muted" style={{ flex: 1 }}>{tr('inventory:ocr.sampleUsed')}</Text>
          </Card>
        )}

        <Card
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            backgroundColor: lowConfidence > 0 ? t.c.warnSoft : t.c.goodSoft,
            borderWidth: 0,
          }}
        >
          <MaterialCommunityIcons
            name={lowConfidence > 0 ? 'alert-outline' : 'check-circle-outline'}
            size={21}
            color={lowConfidence > 0 ? t.c.warn : t.c.good}
          />
          <Text variant="small" style={{ flex: 1, lineHeight: 19 }}>
            {lowConfidence > 0
              ? `${lowConfidence} field${lowConfidence === 1 ? '' : 's'} need${lowConfidence === 1 ? 's' : ''} a quick check before saving.`
              : 'Everything was read confidently. Review and save.'}
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('inventory:ocr.extractedFields')}</Text>

        {result.fields.map((f) => (
          <View key={f.key} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="caption" tone="muted" weight="600">
                {f.label}
              </Text>
              <Badge
                label={f.confidence >= 1 ? 'Confirmed' : `${Math.round(f.confidence * 100)}% sure`}
                tone={f.confidence >= 1 ? 'info' : confidenceTone(f.confidence)}
                size="sm"
              />
            </View>
            <TextField value={f.value} onChangeText={(v) => updateField(f.key, v)} />
          </View>
        ))}

        {result.lines.length > 0 ? (
          <>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('inventory:ocr.lineItems')}</Text>
            <Card padded={false}>
              {result.lines.map((l, i) => (
                <View
                  key={`${l.name}-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < result.lines.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                  }}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatQty(l.quantity)} × {formatMoney(fromMajor(l.unitPrice, baseCurrency))}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="small" weight="700">
                      {formatMoney(fromMajor(l.quantity * l.unitPrice, baseCurrency))}
                    </Text>
                    <Badge label={formatPercent(l.confidence * 100)} tone={confidenceTone(l.confidence)} size="sm" />
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="information-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('inventory:ocr.saveNote')}</Text>
        </Card>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
          gap: t.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">{tr('inventory:ocr.extractedTotal')}</Text>
          <Text variant="title" weight="700">
            {formatMoney(total)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('inventory:ocr.rescan')} variant="ghost" onPress={() => router.replace('/(app)/ocr/capture')} style={{ flex: 1 }} />
          <Button
            title={isExpense ? 'Create expense' : 'Create bill'}
            onPress={() => {
              toast.show(tr('inventory:ocr.carriedFields'), 'success');
              router.replace(isExpense ? '/(app)/expenses/new' : '/(app)/purchases/bills/new');
            }}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </View>
  );
}
