import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { TextField } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { useOcrStore, type OcrField } from '../../../features/ocr/ocrStore';
import { isoOrUndefined } from '../../../features/ocr/matchParty';
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

/** Below this a field shows amber or red, and counts as needing a check: the banner and the badges agree. */
const SURE = 0.9;
const MONEY_KEYS = new Set(['amount', 'tax']);

/** A date the form can take, or nothing typed; anything else would be dropped on the way. */
const dateProblem = (f: OcrField) => f.key === 'date' && !!f.value.trim() && !isoOrUndefined(f.value.trim());

/**
 * One extracted field: its name, how sure the reading is, the value to correct,
 * and "Looks right" to confirm a value that needs no change.
 */
function ReviewField({ f }: { f: OcrField }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['purchases']);
  const updateField = useOcrStore((s) => s.updateField);
  const confirmField = useOcrStore((s) => s.confirmField);
  const money = MONEY_KEYS.has(f.key);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
          {f.label}
        </Text>
        <Badge
          label={f.confidence >= 1 ? tr('purchases:ocr.confirmed') : tr('purchases:ocr.percentSure', { percent: Math.round(f.confidence * 100) })}
          tone={f.confidence >= 1 ? 'info' : confidenceTone(f.confidence)}
          size="sm"
        />
      </View>
      <TextField
        value={f.value}
        // Amounts take digits and a point: "₹1,234" would otherwise read as nothing.
        onChangeText={(v) => updateField(f.key, money ? v.replace(/[^0-9.]/g, '') : v)}
        keyboardType={money ? 'decimal-pad' : 'default'}
        accessibilityLabel={f.label}
        placeholder={f.key === 'date' ? 'YYYY-MM-DD' : undefined}
        error={dateProblem(f) ? tr('purchases:ocr.dateFormat') : undefined}
      />
      {f.confidence < SURE && f.value.trim() && !dateProblem(f) ? (
        <Pressable
          onPress={() => confirmField(f.key)}
          accessibilityRole="button"
          accessibilityLabel={tr('purchases:ocr.looksRightA11y', { field: f.label })}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}
        >
          <Icon name="check" size={16} color={t.c.primary} />
          <Text variant="small" tone="primary" weight="600">
            {tr('purchases:ocr.looksRight')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function OcrReview() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav', 'purchases', 'common']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

  const baseCurrency = useBaseCurrency();
  const result = useOcrStore((s) => s.result);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [zoom, setZoom] = useState(false);

  // Every field shown amber or red, not only the red ones, so the banner never says "all confident" over an amber badge.
  const lowConfidence = useMemo(
    () => (result ? result.fields.filter((f) => f.confidence < SURE).length : 0),
    [result],
  );
  const badDate = !!result?.fields.some(dateProblem);

  if (!result) {
    return (
      <View style={{ flex: 1 }}>
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
  const go = () => {
    setConfirmCreate(false);
    toast.show(tr('inventory:ocr.carriedFields'), 'success', { icon: 'text-box-check-outline' });
    router.replace(isExpense ? '/(app)/expenses/new?fromScan=1' : '/(app)/purchases/bills/new?fromScan=1');
  };
  // Fields still to check are confirmed once more before they are carried over.
  const create = () => {
    if (badDate) return;
    if (lowConfidence > 0) setConfirmCreate(true);
    else go();
  };
  const createLabel = isExpense ? tr('purchases:ocr.createExpense') : tr('purchases:ocr.createBill');
  const dialogs = (
    <>
      <ConfirmDialog
        visible={confirmCreate}
        title={tr('purchases:ocr.uncheckedTitle', { count: lowConfidence })}
        message={tr('purchases:ocr.uncheckedBody')}
        confirmLabel={createLabel}
        cancelLabel={tr('purchases:ocr.keepChecking')}
        onConfirm={go}
        onCancel={() => setConfirmCreate(false)}
      />
      {result.imageUri ? (
        <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)} statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <Pressable
              onPress={() => setZoom(false)}
              accessibilityRole="button"
              accessibilityLabel={tr('common:component.close')}
              hitSlop={10}
              style={{ alignSelf: 'flex-end', margin: t.spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" size={22} color="#fff" />
            </Pressable>
            <Image source={{ uri: result.imageUri }} style={{ flex: 1 }} contentFit="contain" />
          </View>
        </Modal>
      ) : null}
    </>
  );

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
          <Icon name={lowConfidence > 0 ? 'alert-outline' : 'check-circle-outline'} size={20} color={lowConfidence > 0 ? t.c.warn : t.c.good} />
          <Text variant="small" style={{ flex: 1, lineHeight: 19 }}>
            {lowConfidence > 0 ? tr('purchases:ocr.needsCheck', { count: lowConfidence }) : tr('purchases:ocr.allConfident')}
          </Text>
        </View>

        <FormSection title={tr('inventory:ocr.extractedFields')}>
          {fieldPairs.map((pair) => (
            <FieldRow key={pair.map((f) => f.key).join('-')}>
              {pair.map((f) => (
                <ReviewField key={f.key} f={f} />
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
                {headerCell(tr('purchases:ocr.colItem'), { flex: 1 })}
                {headerCell(tr('purchases:ocr.colQty'), { width: 70, textAlign: 'right' })}
                {headerCell(tr('purchases:ocr.colRate'), { width: 120, textAlign: 'right' })}
                {headerCell(tr('purchases:form.amount'), { width: 130, textAlign: 'right' })}
                {headerCell(tr('purchases:ocr.colSure'), { width: 64, textAlign: 'right' })}
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
          <Pressable onPress={() => setZoom(true)} accessibilityRole="imagebutton" accessibilityLabel={tr('purchases:ocr.viewPhoto')}>
            <Card padded={false} style={{ height: 240, overflow: 'hidden' }}>
              <Image source={{ uri: result.imageUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
            </Card>
          </Pressable>
        ) : null}

        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Icon name="information-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('inventory:ocr.saveNote')}</Text>
        </Card>
      </>
    );

    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={{
            title: tr('nav:title.reviewExtraction'),
            // A desktop keeps the page actions together, top right, instead of a bar at the bottom.
            headerRight: () => (
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                <Button title={tr('inventory:ocr.rescan')} variant="ghost" icon="camera-retake-outline" onPress={rescan} />
                <Button title={createLabel} icon="arrow-right" onPress={create} disabled={badDate} />
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
        {dialogs}
      </View>
    );
  }

  return (
    // The footer sits under the form rather than over it, so the keyboard pushes both up together.
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.reviewExtraction') }} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        {result.imageUri ? (
          // The whole bill shows, and a tap opens it full screen to read the small print.
          <Pressable onPress={() => setZoom(true)} accessibilityRole="imagebutton" accessibilityLabel={tr('purchases:ocr.viewPhoto')}>
            <Card padded={false} style={{ height: 200, overflow: 'hidden' }}>
              <Image source={{ uri: result.imageUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
              <View style={{ position: 'absolute', right: t.spacing.sm, bottom: t.spacing.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="magnify" size={18} color="#fff" />
              </View>
            </Card>
          </Pressable>
        ) : null}

        <Card
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            backgroundColor: lowConfidence > 0 ? t.c.warnSoft : t.c.goodSoft,
            borderWidth: 0,
          }}
        >
          <Icon
            name={lowConfidence > 0 ? 'alert-outline' : 'check-circle-outline'}
            size={21}
            color={lowConfidence > 0 ? t.c.warn : t.c.good}
          />
          <Text variant="small" style={{ flex: 1, lineHeight: 19 }}>
            {lowConfidence > 0 ? tr('purchases:ocr.needsCheck', { count: lowConfidence }) : tr('purchases:ocr.allConfident')}
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('inventory:ocr.extractedFields')}</Text>

        {result.fields.map((f) => (
          <ReviewField key={f.key} f={f} />
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
          <Icon name="information-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('inventory:ocr.saveNote')}</Text>
        </Card>
      </ScrollView>

      <View
        style={{
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
          <Button title={createLabel} onPress={create} disabled={badDate} style={{ flex: 2 }} />
        </View>
      </View>
      {dialogs}
    </KeyboardAvoidingView>
  );
}
