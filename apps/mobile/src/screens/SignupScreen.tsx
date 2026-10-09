import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth';
import { Button, Input, ScreenHeader, useToast } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

interface SignupScreenProps {
  onNavigate: (screen: 'login' | 'signup' | 'dashboard') => void;
}

export default function SignupScreen({ onNavigate }: SignupScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { signup, isLoading, clearError } = useAuthStore();
  const toast = useToast();

  const handleSignup = async () => {
    clearError();

    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      await signup(email, password);
      toast.success('Account created — welcome aboard!');
    } catch (err) {
      toast.error((err as any).response?.data?.error || 'Unable to create account');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Create Account" onBack={() => onNavigate('login')} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.iconCircle}>
          <Ionicons name="person-add" size={26} color={colors.primary} />
        </View>
        <Text style={styles.subtitle}>Join Flight Tracker to start saving on flights</Text>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            editable={!isLoading}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Password"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
            secureTextEntry
          />
          <Input
            label="Confirm Password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isLoading}
            secureTextEntry
          />

          <Button label="Create Account" onPress={handleSignup} loading={isLoading} size="lg" style={styles.submit} />

          <TouchableOpacity style={styles.linkButton} onPress={() => onNavigate('login')} disabled={isLoading}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkTextStrong}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    ...type.body,
    color: colors.inkMuted,
    marginBottom: spacing.xl,
  },
  form: {},
  submit: {
    marginTop: spacing.xs,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  linkText: {
    ...type.body,
    color: colors.inkMuted,
  },
  linkTextStrong: {
    color: colors.primary,
    fontWeight: '700',
  },
});
