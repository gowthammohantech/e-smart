import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Field';
import { Illustration } from '@/components/Illustration';
import { useToast } from '@/components/Toast';
import { mockExtract, useOcrStore } from '@/features/ocr/ocrStore';

const STEPS = [
  { icon: 'camera-outline' as const, label: 'Capture', body: 'Photograph the bill or pick one from your gallery.' },
  { icon: 'image-filter-center-focus' as const, label: 'Preprocess', body: 'Crop, deskew and clean up the image.' },
  { icon: 'text-recognition' as const, label: 'Extract', body: 'Read the vendor, date, totals, tax and line items.' },
  { icon: 'clipboard-check-outline' as const, label: 'Review', body: 'You confirm every field before anything is saved.' },
];

export default function OcrCapture() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();

  const setResult = useOcrStore((s) => s.setResult);
  const [kind, setKind] = useState<'expense' | 'purchaseBill'>('expense');
  const [busy, setBusy] = useState(false);

  const run = async (uri?: string) => {
    setBusy(true);
    // Simulate the round-trip to the extraction service.
    setTimeout(() => {
      setResult(mockExtract(uri, kind));
      setBusy(false);
      router.push('/(app)/ocr/review');
    }, 1200);
  };

  const pick = async (fromCamera: boolean) => {
    try {
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (result.canceled) return;
      run(result.assets[0]?.uri);
    } catch {
      // Camera is unavailable in the simulator and on web — still demo the flow.
      toast.show(tr('inventory:ocr.cameraUnavailable'), 'info');
      run(undefined);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.scanABill') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
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
          <Button title={tr('inventory:ocr.useSample')} variant="secondary" icon="file-find-outline" onPress={() => run(undefined)} style={{ flex: 1 }} loading={busy} />
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
