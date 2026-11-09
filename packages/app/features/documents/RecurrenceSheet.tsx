import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Button } from '@esmart/ui/components/Button';
import { Segmented, SwitchField } from '@esmart/ui/components/Field';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { useToast } from '@esmart/ui/components/Toast';
import { formatDate } from '@esmart/core/lib/date';
import type { BusinessDocument, RecurrenceFrequency } from '@esmart/core/types';
import { api } from '../../remote/api';
import { applyEntity } from '../../remote/apply';
import { describeError } from '../../remote/errors';

const FREQUENCIES: RecurrenceFrequency[] = ['none', 'weekly', 'monthly', 'quarterly', 'yearly'];

/**
 * Repeats an issued invoice: the server issues a copy on each date of the series (numbered, e-invoiced
 * and, when asked, emailed like any other) from the scheduler, so this is a server call rather than an
 * offline edit.
 */
export function RecurrenceSheet({ doc, visible, onClose }: { doc: BusinessDocument; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const toast = useToast();
  const { t: tr } = useTranslation(['sales', 'common']);
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(doc.recurrence ?? 'none');
  const [endDate, setEndDate] = useState<string | undefined>(doc.recurrenceEndDate);
  const [autoSend, setAutoSend] = useState(!!doc.recurrenceAutoSend);
  const [saving, setSaving] = useState(false);
  // Seeded again each time it opens: the document may have been refetched (or its series changed
  // elsewhere) since this was mounted, and the sheet should show what is on it now.
  const [openFor, setOpenFor] = useState(visible);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setRecurrence(doc.recurrence ?? 'none');
      setEndDate(doc.recurrenceEndDate);
      setAutoSend(!!doc.recurrenceAutoSend);
    }
  }

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await api.PUT('/companies/{companyId}/documents/{id}/recurrence', {
        params: { path: { companyId: doc.companyId, id: doc.id } },
        body: { recurrence, ...(recurrence !== 'none' && endDate && { endDate }), autoSend: recurrence !== 'none' && autoSend },
      });
      if (error || !data) throw error ?? new Error('No answer from the server');
      applyEntity('document', data);
      toast.show(
        recurrence === 'none' ? tr('sales:recurring.stopped') : tr('sales:recurring.saved', { date: data.nextRecurrenceDate ? formatDate(data.nextRecurrenceDate) : '—' }),
        'success',
        { icon: 'repeat', detail: doc.number },
      );
      onClose();
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={tr('sales:recurring.title')} subtitle={doc.number}>
      <View style={{ gap: t.spacing.lg, paddingBottom: t.spacing.lg }}>
        <Text variant="small" tone="muted">
          {tr('sales:recurring.hint')}
        </Text>
        <Segmented options={FREQUENCIES.map((f) => ({ value: f, label: tr(`sales:recurring.frequency.${f}`) }))} value={recurrence} onChange={(v) => setRecurrence(v as RecurrenceFrequency)} />
        {recurrence !== 'none' ? (
          <>
            <DateField label={tr('sales:recurring.endDate')} value={endDate ?? ''} onChange={setEndDate} minimumDate={new Date(`${doc.date}T00:00:00`)} />
            <SwitchField label={tr('sales:recurring.autoSend')} description={tr('sales:recurring.autoSendHint')} value={autoSend} onValueChange={setAutoSend} />
          </>
        ) : null}
        {doc.nextRecurrenceDate && doc.recurrence !== 'none' ? (
          <Text variant="caption" tone="muted">
            {tr('sales:recurring.next', { date: formatDate(doc.nextRecurrenceDate) })}
          </Text>
        ) : null}
        {/* A desktop dialog's button sits at the right at its own width. */}
        <Button title={tr('sales:recurring.save')} onPress={() => void save()} loading={saving} disabled={saving} fullWidth={!desktop} style={desktop ? { alignSelf: 'flex-end' } : undefined} />
      </View>
    </Sheet>
  );
}
