import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';

/**
 * Explicit confirmation for irreversible actions, as required by the PRD UX
 * principles and by the AI-assistant guardrails in the FRD.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
  icon,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** A returned promise keeps the confirm busy until it settles. */
  onConfirm: () => unknown;
  onCancel: () => void;
  icon?: IconName;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  // One confirm per showing: a second tap can land before the dialog closes
  // (it fades out, and the caller's re-render comes later still).
  const fired = useRef(false);
  useEffect(() => {
    if (visible) fired.current = false;
  }, [visible]);
  const confirm = () => {
    if (fired.current) return;
    fired.current = true;
    const ran = onConfirm();
    if (ran && typeof (ran as Promise<unknown>).then === 'function') {
      const done = () => void (fired.current = false);
      return (ran as Promise<unknown>).then(done, done);
    }
    // A caller that keeps the dialog open (to show an error, say) can be confirmed again shortly.
    setTimeout(() => void (fired.current = false), 800);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: t.c.overlay,
          alignItems: 'center',
          justifyContent: 'center',
          padding: t.spacing.xl,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              width: '100%',
              maxWidth: 380,
              backgroundColor: t.c.paper,
              borderRadius: t.radius.xl,
              borderWidth: t.scheme === 'dark' ? 1 : 0,
              borderColor: t.c.line,
              padding: t.spacing.xl,
              gap: t.spacing.md,
            },
            t.shadow.sheet,
          ]}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: destructive ? t.c.badSoft : t.c.chip,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={icon ?? (destructive ? 'alert-outline' : 'help-circle-outline')}
              size={22}
              color={destructive ? t.c.bad : t.c.primary}
            />
          </View>

          <Text variant="title">{title}</Text>
          {message ? (
            <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
              {message}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: t.spacing.md, marginTop: t.spacing.sm }}>
            <Button title={cancelLabel ?? tr('common:component.cancel')} variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
            <Button
              title={confirmLabel ?? tr('common:component.confirm')}
              variant={destructive ? 'danger' : 'primary'}
              onPress={confirm}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
