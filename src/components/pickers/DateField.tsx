import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { FieldShell } from '@/components/Field';
import { Text } from '@/components/Text';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { formatDate, parseDate, toISODate } from '@/lib/date';

export function DateField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  minimumDate,
  maximumDate,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => (value ? parseDate(value) : new Date()));

  const openPicker = () => {
    setDraft(value ? parseDate(value) : new Date());
    setOpen(true);
  };

  const picker = (
    <DateTimePicker
      value={draft}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      themeVariant={t.scheme}
      onChange={(_event, selected) => {
        if (Platform.OS === 'android') {
          setOpen(false);
          if (selected) onChange(toISODate(selected));
          return;
        }
        if (selected) setDraft(selected);
      }}
    />
  );

  return (
    <FieldShell label={label} required={required} hint={hint} error={error}>
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Date'}: ${value ? formatDate(value) : 'not set'}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : t.c.line,
          paddingHorizontal: t.spacing.md,
          height: 48,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <MaterialCommunityIcons name="calendar-outline" size={18} color={t.c.muted} />
        <Text style={{ flex: 1 }} tone={value ? 'default' : 'muted'}>
          {value ? formatDate(value) : 'Select date'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={t.c.muted} />
      </Pressable>

      {Platform.OS === 'android' && open ? picker : null}

      {Platform.OS !== 'android' ? (
        <Sheet
          visible={open}
          onClose={() => setOpen(false)}
          title={label ?? 'Select date'}
          scroll={false}
          footer={
            <Button
              title={tr('common:component.done')}
              onPress={() => {
                onChange(toISODate(draft));
                setOpen(false);
              }}
              fullWidth
            />
          }
        >
          <View style={{ paddingHorizontal: t.spacing.md }}>{picker}</View>
        </Sheet>
      ) : null}
    </FieldShell>
  );
}
