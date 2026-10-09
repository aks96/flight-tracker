import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth';
import { Button, Card, ScreenHeader, useConfirm, useToast } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

interface SettingsScreenProps {
  onNavigate: (screen: 'dashboard') => void;
  onGoBack: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </Card>
  );
}

// App Store and Play review both require a reachable privacy policy, and a
// support contact. These rows previously rendered with no onPress at all, so
// every one of them was decorative.
const LEGAL_URLS = {
  privacy: 'https://watchmyfares.com/privacy',
  terms: 'https://watchmyfares.com/terms',
  support: 'mailto:support@watchmyfares.com?subject=watchMyFares%20support',
};

function LinkRow({
  icon,
  label,
  url,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  url: string;
}) {
  const toast = useToast();

  const open = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      toast.error('Could not open that link');
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={open}>
      <Card style={styles.linkRow}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={styles.linkText}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} style={styles.linkChevron} />
      </Card>
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ onNavigate, onGoBack }: SettingsScreenProps) {
  const { user, logout, deleteAccount } = useAuthStore();
  const confirm = useConfirm();
  const toast = useToast();

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log Out',
      message: 'Are you sure you want to log out?',
      confirmLabel: 'Log Out',
      destructive: true,
    });
    if (ok) {
      await logout();
      onNavigate('dashboard');
    }
  };

  // Apple requires an in-app way to delete an account for any app that offers
  // signup; without this the build is rejected at review.
  const handleDeleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete Account',
      message:
        'This permanently deletes your account, every tracker, and your alert history. This cannot be undone.',
      confirmLabel: 'Delete Everything',
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteAccount();
      onNavigate('dashboard');
    } catch {
      toast.error('Could not delete your account — try again');
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" onBack={onGoBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.email || '?')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <Row label="Email" value={user?.email || '—'} />
        <Row label="User ID" value={user?.id || '—'} />

        <Text style={styles.sectionTitle}>App Info</Text>
        <Row label="Version" value="1.0.0" />
        <Row label="Build" value="1" />

        <Text style={styles.sectionTitle}>Support</Text>
        <LinkRow icon="document-text-outline" label="Privacy Policy" url={LEGAL_URLS.privacy} />
        <LinkRow icon="reader-outline" label="Terms of Service" url={LEGAL_URLS.terms} />
        <LinkRow
          icon="chatbubble-ellipses-outline"
          label="Contact Support"
          url={LEGAL_URLS.support}
        />

        <Button
          label="Log Out"
          variant="danger"
          onPress={handleLogout}
          icon={<Ionicons name="log-out-outline" size={18} color={colors.danger} />}
          style={styles.logoutButton}
        />

        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <Text style={styles.dangerNote}>
          Deleting your account removes every tracker and alert permanently.
        </Text>
        <Button
          label="Delete Account"
          variant="danger"
          onPress={handleDeleteAccount}
          icon={<Ionicons name="trash-outline" size={18} color={colors.danger} />}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarText: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '700',
  },
  profileEmail: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  dangerNote: {
    ...type.caption,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    ...type.small,
    color: colors.inkMuted,
  },
  rowValue: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
  },
  linkText: {
    ...type.bodyStrong,
    color: colors.ink,
    flex: 1,
  },
  linkChevron: {
    marginLeft: 'auto',
  },
  logoutButton: {
    marginTop: spacing.lg,
  },
});
