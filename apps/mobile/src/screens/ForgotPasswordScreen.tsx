import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, ScreenHeader, useToast } from '@/components/ui';
import { requestPasswordReset } from '@/services/auth';
import { colors, radius, spacing, type } from '@/theme';

interface ForgotPasswordScreenProps {
  onGoBack: () => void;
}

/**
 * Step one of password recovery. Without this screen the backend's
 * /auth/forgot-password endpoint was unreachable, so a user who forgot their
 * password was permanently locked out of their account.
 */
export default function ForgotPasswordScreen({ onGoBack }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast.error('Enter the email address on your account');
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      // The API answers identically whether or not the address exists, so the
      // UI must not imply anything either — saying "no such account" here
      // would hand back the account-enumeration oracle the API avoids.
      setSent(true);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not send the reset link');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Check your email" onBack={onGoBack} />
        <View style={styles.doneWrap}>
          <Ionicons name="mail-outline" size={40} color={colors.primary} />
          <Text style={styles.doneTitle}>Reset link sent</Text>
          <Text style={styles.doneBody}>
            If {email.trim()} has an account, a reset link is on its way. It expires in one hour.
          </Text>
          <Text style={styles.doneHint}>
            Open the link on this device and it will bring you straight back here.
          </Text>
          <Button label="Back to login" onPress={onGoBack} fullWidth style={styles.doneButton} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Reset password" onBack={onGoBack} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Enter your email address and we'll send you a link to set a new password.
        </Text>

        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Button
          label="Send reset link"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          fullWidth
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: spacing.xs },
  intro: { ...type.body, color: colors.inkMuted, marginBottom: spacing.xs },
  submit: { marginTop: spacing.sm },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  doneTitle: { ...type.h1, color: colors.ink },
  doneBody: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  doneHint: {
    ...type.small,
    color: colors.inkFaint,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  doneButton: { marginTop: spacing.md },
});
