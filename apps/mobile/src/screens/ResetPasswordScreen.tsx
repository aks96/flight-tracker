import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Input, ScreenHeader, useToast } from '@/components/ui';
import { resetPassword } from '@/services/auth';
import { colors, spacing, type } from '@/theme';

interface ResetPasswordScreenProps {
  /** Token lifted from the watchmyfares://reset-password?token=... deep link. */
  token: string;
  onDone: () => void;
  onGoBack: () => void;
}

// Matches the API's Joi rule; checking here too avoids a pointless round trip.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Step two of password recovery, reached by opening the emailed deep link.
 * On success the backend revokes every existing session, so the user has to
 * sign in again with the new password.
 */
export default function ResetPasswordScreen({ token, onDone, onGoBack }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      toast.success('Password updated — sign in with your new password');
      onDone();
    } catch (error: any) {
      // An expired or already-used token is the common case, and the message
      // should send the user back to request a fresh one.
      toast.error(
        error.response?.data?.error || 'That reset link is no longer valid — request a new one'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Set a new password" onBack={onGoBack} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Choose a new password. You'll be signed out everywhere else.
        </Text>

        <Input
          label="New password"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Input
          label="Confirm new password"
          placeholder="Re-enter it"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
        />

        <Button
          label="Update password"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          fullWidth
          style={styles.submit}
        />

        <View style={styles.hintWrap}>
          <Text style={styles.hint}>Reset links expire one hour after they're sent.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: spacing.xs },
  intro: { ...type.body, color: colors.inkMuted, marginBottom: spacing.xs },
  submit: { marginTop: spacing.sm },
  hintWrap: { marginTop: spacing.md, alignItems: 'center' },
  hint: { ...type.small, color: colors.inkFaint },
});
