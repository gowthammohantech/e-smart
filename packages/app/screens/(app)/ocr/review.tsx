import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { TextField } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';
import { useOcrStore } from '../../../features/ocr/ocrStore';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { fromMajor, money } from '@esmart/core/lib/money';
import { useBaseCurrency } from '../../../store/selectors';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { FieldRow, FormSection, SplitPane } from '@esmart/ui/components/Layout';

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
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

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
  const rescan = () => router.replace('/(app)/ocr/capture');
  const create = () => {
    toast.show(tr('inventory:ocr.carriedFields'), 'success');
    router.replace(isExpense ? '/(app)/expenses/new?fromScan=1' : '/(app)/purchases/bills/new?fromScan=1');
  };

  if (desktop) {
    const fieldPairs: (typeof result.fields)[] = [];
    for (let i = 0; i < result.fields.length; i += 2) fieldPairs.push(result.fields.slice(i, i + 2));
    const headerCell = (label: string, style: object) => (
      <Text variant="micro" tone="muted" weight="700" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6, ...style }}>
        {label}
      </Text>
    );

    const main = (
      <View style={{ gap: t.spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            padding: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            borderRadius: t.radius.lg,
            backgroundColor: lowConfidence > 0 ? t.c.warnSoft : t.c.goodSoft,
          }}
        >
          <MaterialCommunityIcons name={lowConfidence > 0 ? 'alert-outline' : 'check-circle-outline'} size={20} color={lowConfidence > 0 ? t.c.warn : t.c.good} />
          <Text variant="small" style={{ flex: 1, lineHeight: 19 }}>
            {lowConfidence > 0
              ? `${lowConfidence} field${lowConfidence === 1 ? '' : 's'} need${lowConfidence === 1 ? 's' : ''} a quick check before saving.`
              : 'Everything was read confidently. Review and save.'}
          </Text>
        </View>

        <FormSection title={tr('inventory:ocr.extractedFields')}>
          {fieldPairs.map((pair) => (
            <FieldRow key={pair.map((f) => f.key).join('-')}>
              {pair.map((f) => (
                <View key={f.key} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.sm }}>
                    <Text variant="caption" tone="muted" weight="600" numberOfLines={1}>
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
              {/* Holds the column when the last row has one field, so it keeps its width. */}
              {pair.length === 1 ? <View /> : null}
            </FieldRow>
          ))}
        </FormSection>

        {result.lines.length > 0 ? (
          <FormSection title={tr('inventory:ocr.lineItems')}>
            <View style={{ borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.md, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 36, paddingHorizontal: t.spacing.md, backgroundColor: t.c.card2 }}>
                {headerCell('Item', { flex: 1 })}
                {headerCell('Qty', { width: 70, textAlign: 'right' })}
                {headerCell('Rate', { width: 120, textAlign: 'right' })}
                {headerCell('Amount', { width: 130, textAlign: 'right' })}
                {headerCell('Sure', { width: 64, textAlign: 'right' })}
              </View>
              {result.lines.map((l, i) => (
                <View
                  key={`${l.name}-${i}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 46, paddingHorizontal: t.spacing.md, borderTopWidth: 1, borderTopColor: t.c.line }}
                >
                  <Text variant="small" weight="600" numberOfLines={1} style={{ flex: 1 }}>
                    {l.name}
                  </Text>
                  <Text variant="small" style={{ width: 70, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {formatQty(l.quantity)}
                  </Text>
                  <Text variant="small" tone="muted" style={{ width: 120, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {formatMoney(fromMajor(l.unitPrice, baseCurrency))}
                  </Text>
                  <Text variant="small" weight="700" style={{ width: 130, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {formatMoney(fromMajor(l.quantity * l.unitPrice, baseCurrency))}
                  </Text>
                  <View style={{ width: 64, alignItems: 'flex-end' }}>
                    <Badge label={formatPercent(l.confidence * 100)} tone={confidenceTone(l.confidence)} size="sm" />
                  </View>
                </View>
              ))}
            </View>
          </FormSection>
        ) : null}
      </View>
    );

    const side = (
      <>
        <Card style={{ gap: t.spacing.xs }}>
          <Text variant="caption" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {tr('inventory:ocr.extractedTotal')}
          </Text>
          <Text variant="h2" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(total)}
          </Text>
        </Card>

        {result.imageUri ? (
          <Card padded={false} style={{ height: 240, overflow: 'hidden' }}>
            <Image source={{ uri: result.imageUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </Card>
        ) : (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <MaterialCommunityIcons name="file-document-outline" size={22} color={t.c.muted} />
            <Text variant="small" tone="muted" style={{ flex: 1, lineHeight: 19 }}>{tr('inventory:ocr.sampleUsed')}</Text>
          </Card>
        )}

        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="information-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('inventory:ocr.saveNote')}</Text>
        </Card>
      </>
    );

    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen
          options={{
            title: tr('nav:title.reviewExtraction'),
            // A desktop keeps the page actions together, top right, instead of a bar at the bottom.
            headerRight: () => (
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                <Button title={tr('inventory:ocr.rescan')} variant="ghost" icon="camera-retake-outline" onPress={rescan} />
                <Button title={isExpense ? 'Create expense' : 'Create bill'} icon="arrow-right" onPress={create} />
              </View>
            ),
          }}
        />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        >
          {/* A narrow browser window (icon-only sidebar) has no room for the side column. */}
          {breakpoint === 'tablet' ? (
            <View style={{ gap: t.spacing.lg }}>
              {main}
              {side}
            </View>
          ) : (
            <SplitPane main={main} side={side} sideWidth={340} />
          )}
        </ScrollView>
      </View>
    );
  }

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
              router.replace(isExpense ? '/(app)/expenses/new?fromScan=1' : '/(app)/purchases/bills/new?fromScan=1');
            }}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </View>
  );
}
