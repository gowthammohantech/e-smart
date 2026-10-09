import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Segmented } from '@esmart/ui/components/Field';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useToast } from '@esmart/ui/components/Toast';
import { mockExtract, useOcrStore } from '../../../features/ocr/ocrStore';
import { recognizeText } from '../../../features/ocr/recognize';
import { parseReceiptText } from '@esmart/core/domain/parseReceipt';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { FormSection, SplitPane } from '@esmart/ui/components/Layout';

const STEPS = [
  { icon: 'camera-outline' as const, label: 'Capture', body: 'Photograph the bill or pick one from your gallery.' },
  { icon: 'cellphone-lock' as const, label: 'Read', body: 'Text is read on your phone — the image is never uploaded.' },
  { icon: 'text-recognition' as const, label: 'Extract', body: 'Read the vendor, date, totals, tax and line items.' },
  { icon: 'clipboard-check-outline' as const, label: 'Review', body: 'You confirm every field before anything is saved.' },
];

export default function OcrCapture() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

  const setResult = useOcrStore((s) => s.setResult);
  const [kind, setKind] = useState<'expense' | 'purchaseBill'>('expense');
  const [busy, setBusy] = useState(false);

  /** The built-in sample bill, only when the person asks for it. */
  const runSample = (uri?: string) => {
    setResult(mockExtract(uri, kind));
    router.push('/(app)/ocr/review');
  };

  const run = async (uri: string) => {
    setBusy(true);
    try {
      // Read on the device with ML Kit; nothing is uploaded.
      const text = await recognizeText(uri);
      if (text === null) {
        // Say so, rather than passing the sample bill off as this photo.
        toast.show(tr('inventory:ocr.ocrUnavailable'), 'error');
        return;
      }
      if (!text.trim()) {
        toast.show(tr('inventory:ocr.noTextFound'), 'error');
        return;
      }
      setResult(parseReceiptText(text, kind, uri));
      router.push('/(app)/ocr/review');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (fromCamera: boolean) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.show(tr(fromCamera ? 'inventory:ocr.cameraDenied' : 'inventory:ocr.galleryDenied'), 'error');
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets[0]?.uri) return;
      await run(result.assets[0].uri);
    } catch {
      // No camera in the simulator or on web.
      toast.show(tr('inventory:ocr.cameraUnavailable'), 'info');
    }
  };

  if (desktop) {
    const scan = (
      <Card style={{ gap: t.spacing.lg }}>
        <View style={{ width: 360 }}>
          <Segmented
            options={[
              { value: 'expense', label: 'Expense receipt' },
              { value: 'purchaseBill', label: 'Supplier bill' },
            ]}
            value={kind}
            onChange={(v) => setKind(v as 'expense' | 'purchaseBill')}
            size="sm"
          />
        </View>

        <Pressable
          onPress={() => pick(true)}
          accessibilityRole="button"
          accessibilityLabel={tr('inventory:ocr.takePhoto')}
          disabled={busy}
          style={(state) => {
            const { hovered, focused } = state as WebPressState;
            return [
              {
                alignItems: 'center',
                gap: t.spacing.sm,
                paddingVertical: t.spacing.xxl,
                paddingHorizontal: t.spacing.lg,
                borderRadius: t.radius.lg,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: hovered ? t.c.primary : t.c.line,
                backgroundColor: hovered ? t.c.chip : t.c.card2,
              },
              focusRing(t, focused),
            ];
          }}
        >
          <Illustration name="scanning" size="full" />
          <Text variant="title" weight="600">
            {busy ? 'Reading the bill…' : 'Take a photo'}
          </Text>
          <Text variant="small" tone="muted" center style={{ maxWidth: 360, lineHeight: 20 }}>
            {busy ? 'Extracting vendor, date, totals and line items.' : 'Lay the bill flat with good light for the best result.'}
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.spacing.md }}>
          <Button title={tr('inventory:ocr.fromGallery')} variant="ghost" icon="image-outline" onPress={() => pick(false)} disabled={busy} />
          <Button title={tr('inventory:ocr.useSample')} variant="secondary" icon="file-find-outline" onPress={() => runSample()} loading={busy} />
        </View>

        {/* Reading a bill needs the phone app; say so before the person tries it here. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm, padding: t.spacing.md, borderRadius: t.radius.md, backgroundColor: t.c.chip }}>
          <MaterialCommunityIcons name="information-outline" size={18} color={t.c.primary} />
          <Text variant="small" tone="muted" style={{ flex: 1, lineHeight: 20 }}>
            {tr('inventory:ocr.ocrUnavailable')}
          </Text>
        </View>
      </Card>
    );

    const steps = (
      <FormSection title={tr('inventory:ocr.howItWorks')}>
        <View style={{ gap: t.spacing.lg }}>
          {STEPS.map((s, i) => (
            <View key={s.label} style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name={s.icon} size={17} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="600">
                  {i + 1}. {s.label}
                </Text>
                <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                  {s.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, paddingTop: t.spacing.md, borderTopWidth: 1, borderTopColor: t.c.line }}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={t.c.good} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('inventory:ocr.howItWorksBody')}</Text>
        </View>
      </FormSection>
    );

    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.scanABill') }} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {/* A narrow browser window (icon-only sidebar) has no room for the side column. */}
          {breakpoint === 'tablet' ? (
            <View style={{ gap: t.spacing.lg }}>
              {scan}
              {steps}
            </View>
          ) : (
            <SplitPane main={scan} side={steps} sideWidth={360} />
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.scanABill') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Segmented
          options={[
            { value: 'expense', label: 'Expense receipt' },
            { value: 'purchaseBill', label: 'Supplier bill' },
          ]}
          value={kind}
          onChange={(v) => setKind(v as 'expense' | 'purchaseBill')}
        />

        <Pressable onPress={() => pick(true)} accessibilityRole="button" accessibilityLabel={tr('inventory:ocr.takePhoto')} disabled={busy}>
          <Card
            variant="flat"
            style={{
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.xxxl * 1.2,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: t.c.line,
            }}
          >
            <Illustration name="scanning" size="hero" />
            <Text variant="title" weight="600">
              {busy ? 'Reading the bill…' : 'Take a photo'}
            </Text>
            <Text variant="caption" tone="muted" center style={{ maxWidth: 260, lineHeight: 18 }}>
              {busy ? 'Extracting vendor, date, totals and line items.' : 'Lay the bill flat with good light for the best result.'}
            </Text>
          </Card>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('inventory:ocr.fromGallery')} variant="ghost" icon="image-outline" onPress={() => pick(false)} style={{ flex: 1 }} disabled={busy} />
          <Button title={tr('inventory:ocr.useSample')} variant="secondary" icon="file-find-outline" onPress={() => runSample()} style={{ flex: 1 }} loading={busy} />
        </View>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.sm }}>{tr('inventory:ocr.howItWorks')}</Text>
        <Card padded={false}>
          {STEPS.map((s, i) => (
            <View
              key={s.label}
              style={{
                flexDirection: 'row',
                gap: t.spacing.md,
                padding: t.spacing.lg,
                borderBottomWidth: i < STEPS.length - 1 ? 0.5 : 0,
                borderBottomColor: t.c.line,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name={s.icon} size={17} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="600">
                  {i + 1}. {s.label}
                </Text>
                <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                  {s.body}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="shield-check-outline" size={19} color={t.c.good} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('inventory:ocr.howItWorksBody')}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}
