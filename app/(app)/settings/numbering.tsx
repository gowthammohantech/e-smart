import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { PickerField, SwitchField, TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { NumberingSeries } from '@/types';
import { SERIES_LABELS, formatNumber } from '@/domain/numbering';
import { useAppStore } from '@/store/appStore';
import { useBranches, useNumberingSeries } from '@/store/selectors';
import { today } from '@/lib/date';

const RESET_LABELS: Record<NumberingSeries['resetPolicy'], string> = {
  never: 'Never reset',
  yearly: 'Reset each financial year',
  monthly: 'Reset each month',
};

export default function NumberingSettings() {
  const t = useTheme();
  const toast = useToast();

  const series = useNumberingSeries();
  const branches = useBranches();
  const saveNumberingSeries = useAppStore((s) => s.saveNumberingSeries);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

  const [editing, setEditing] = useState<NumberingSeries | null>(null);
  const [prefix, setPrefix] = useState('');
  const [nextNumber, setNextNumber] = useState('');
  const [padding, setPadding] = useState('4');
  const [includeFy, setIncludeFy] = useState(true);
  const [includeBranch, setIncludeBranch] = useState(false);
  const [resetPolicy, setResetPolicy] = useState<NumberingSeries['resetPolicy']>('yearly');
  const [resetOpen, setResetOpen] = useState(false);

  const branchCode = branches.find((b) => b.id === activeBranchId)?.code;

  const open = (s: NumberingSeries) => {
    setEditing(s);
    setPrefix(s.prefix);
    setNextNumber(String(s.nextNumber));
    setPadding(String(s.padding));
    setIncludeFy(s.includeFiscalYear);
    setIncludeBranch(s.includeBranchCode);
    setResetPolicy(s.resetPolicy);
  };

  const draft: NumberingSeries | null = editing
    ? {
        ...editing,
        prefix: prefix || editing.prefix,
        nextNumber: Number(nextNumber) || 1,
        padding: Number(padding) || 4,
        includeFiscalYear: includeFy,
        includeBranchCode: includeBranch,
        resetPolicy,
      }
    : null;

  const save = () => {
    if (!draft) return;
    saveNumberingSeries(draft);
    toast.show(`${SERIES_LABELS[draft.kind]} numbering updated`, 'success');
    setEditing(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Document numbering' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Each document type has its own series. A number is assigned only when a document is finalised, and a finalised
            number is never reused — drafts stay unnumbered so you can delete them freely.
          </Text>
        </Card>

        <Card padded={false}>
          {series.map((s, i) => (
            <ListRow
              key={s.id}
              title={SERIES_LABELS[s.kind]}
              subtitle={formatNumber(s, { date: today(), branchCode })}
              meta={RESET_LABELS[s.resetPolicy]}
              icon="numeric"
              divider={i < series.length - 1}
              right={<Badge label={`Next ${s.nextNumber}`} tone="neutral" size="sm" />}
              onPress={() => open(s)}
              chevron
            />
          ))}
        </Card>
      </ScrollView>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? SERIES_LABELS[editing.kind] : ''}
        footer={<Button title="Save" onPress={save} fullWidth />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <Card style={{ alignItems: 'center', gap: 6, paddingVertical: t.spacing.xl }}>
            <Text variant="caption" tone="muted">
              Next number will be
            </Text>
            <Text variant="h3" weight="700" style={{ color: t.c.primary, fontVariant: ['tabular-nums'] }}>
              {draft ? formatNumber(draft, { date: today(), branchCode }) : ''}
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <TextField
              label="Prefix"
              value={prefix}
              onChangeText={(v) => setPrefix(v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
              autoCapitalize="characters"
              containerStyle={{ flex: 1 }}
            />
            <TextField
              label="Next number"
              value={nextNumber}
              onChangeText={(v) => setNextNumber(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              containerStyle={{ flex: 1 }}
            />
          </View>

          <TextField
            label="Digits"
            value={padding}
            onChangeText={(v) => setPadding(v.replace(/[^0-9]/g, '').slice(0, 1))}
            keyboardType="number-pad"
            hint="0001 uses four digits."
          />

          <SwitchField label="Include financial year" description="Adds 26-27 to the number." value={includeFy} onValueChange={setIncludeFy} />
          <SwitchField
            label="Include branch code"
            description="Useful when several locations issue documents."
            value={includeBranch}
            onValueChange={setIncludeBranch}
            disabled={branches.length < 2}
          />
          <PickerField label="Reset policy" value={RESET_LABELS[resetPolicy]} onPress={() => setResetOpen(true)} icon="restart" />
        </View>
      </Sheet>

      <SelectSheet
        visible={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset policy"
        options={(Object.keys(RESET_LABELS) as NumberingSeries['resetPolicy'][]).map((k) => ({ value: k, label: RESET_LABELS[k] }))}
        value={resetPolicy}
        onSelect={(v) => setResetPolicy(v as NumberingSeries['resetPolicy'])}
        searchable={false}
      />
    </View>
  );
}
