import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';

/**
 * The footer of a settings master's edit sheet, the same on every one: Save on the right, and on
 * a record that exists, a red Delete on the left, kept well apart from it so neither is hit for
 * the other. Delete only opens the confirm; it never removes anything itself.
 */
export function SheetActions({
  saveLabel,
  onSave,
  saving,
  saveDisabled,
  deleteLabel,
  onDelete,
}: {
  saveLabel: string;
  onSave: () => unknown;
  saving?: boolean;
  saveDisabled?: boolean;
  deleteLabel?: string;
  /** Left out for a new record. */
  onDelete?: () => void;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  // On a desktop both keep their own width: Delete at the far left, Save at the right.
  if (desktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: onDelete ? 'space-between' : 'flex-end', gap: t.spacing.xl }}>
        {onDelete && deleteLabel ? <Button title={deleteLabel} variant="danger" icon="delete-outline" onPress={onDelete} /> : null}
        <Button shortcut="S" title={saveLabel} onPress={() => void onSave()} loading={saving} disabled={saveDisabled || saving} />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xl }}>
      {onDelete && deleteLabel ? <Button title={deleteLabel} variant="danger" icon="delete-outline" onPress={onDelete} style={{ flex: 1 }} /> : null}
      <Button shortcut="S" title={saveLabel} onPress={() => void onSave()} loading={saving} disabled={saveDisabled || saving} style={{ flex: onDelete ? 2 : 1 }} fullWidth={!onDelete} />
    </View>
  );
}
