import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing, type } from '@/theme';
import Button from './Button';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Replaces Alert.alert(title, message, [Cancel, Confirm]) — on
// react-native-web, Alert.alert is a no-op that never invokes either
// button's onPress, so every destructive-action confirmation (delete
// tracker, logout) silently did nothing when tested in a browser. This
// renders a real cross-platform modal and resolves a promise instead.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const handle = (result: boolean) => {
    setOptions(null);
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal visible={!!options} transparent animationType="fade" onRequestClose={() => handle(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            {options ? (
              <>
                <Text style={styles.title}>{options.title}</Text>
                <Text style={styles.message}>{options.message}</Text>
                <View style={styles.actions}>
                  <Button
                    label={options.cancelLabel || 'Cancel'}
                    variant="secondary"
                    onPress={() => handle(false)}
                    fullWidth
                    style={styles.actionButton}
                  />
                  <Button
                    label={options.confirmLabel || 'Confirm'}
                    variant={options.destructive ? 'danger' : 'primary'}
                    onPress={() => handle(true)}
                    fullWidth
                    style={styles.actionButton}
                  />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    ...shadow.lg,
  },
  title: {
    ...type.h2,
    color: colors.ink,
    marginBottom: spacing.xxs,
    textTransform: 'uppercase',
  },
  message: {
    ...type.body,
    color: colors.inkMuted,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
