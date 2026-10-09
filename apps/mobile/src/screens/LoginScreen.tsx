import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth';
import { Button, Input, BlinkingCursor, useToast } from '@/components/ui';
import { colors, glow, radius, spacing, type } from '@/theme';

interface LoginScreenProps {
  onNavigate: (
    screen: 'login' | 'signup' | 'dashboard' | 'forgotPassword',
    trackerId?: string
  ) => void;
}

export default function LoginScreen({ onNavigate }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuthStore();
  const toast = useToast();

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error('Enter your email and password');
      return;
    }
    try {
      await login(email, password);
    } catch (err) {
      toast.error((err as any).response?.data?.error || 'Unable to login. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logoCircle}>
            <Ionicons name="airplane" size={26} color={colors.primary} />
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.title}>flight_tracker</Text>
            <BlinkingCursor size={22} />
          </View>
          <Text style={styles.subtitle}>// live fare monitoring & drop alerts</Text>
        </View>

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
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
            secureTextEntry
          />

          <Button label="Log In" onPress={handleLogin} loading={isLoading} size="lg" style={styles.submit} />

          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => onNavigate('forgotPassword')}
            disabled={isLoading}
          >
            <Text style={styles.forgotText}>Forgot your password?</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => onNavigate('signup')} disabled={isLoading}>
            <Text style={styles.linkText}>
              Don't have an account? <Text style={styles.linkTextStrong}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    ...type.display,
    color: colors.primary,
    marginBottom: spacing.xxs,
    ...glow(),
  },
  subtitle: {
    ...type.small,
    color: colors.inkMuted,
  },
  form: {
    marginBottom: spacing.xl,
  },
  submit: {
    marginTop: spacing.xs,
  },
  forgotButton: { alignSelf: 'center', paddingVertical: spacing.xs },
  forgotText: { ...type.small, color: colors.inkMuted },
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
