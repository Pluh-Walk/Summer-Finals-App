import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Link, Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import Input from '../components/Input';
import Button from '../components/Button';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

function validatePassword(pw) {
  if (pw.length < 8 || pw.length > 16) return 'Password must be 8–16 characters.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
  return null;
}

export default function Register() {
  const { user, signUp } = useAuth();
  const [form, setForm] = useState({
    lastName: '', firstName: '', nickname: '', email: '', username: '', password: '', confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  if (user) return <Redirect href="/(tabs)/home" />;

  function set(field) {
    return (val) => setForm((f) => ({ ...f, [field]: val }));
  }

  function validate() {
    const e = {};
    if (!form.lastName.trim()) e.lastName = 'Last name is required.';
    if (!form.firstName.trim()) e.firstName = 'First name is required.';
    if (!form.nickname.trim()) e.nickname = 'Nickname is required.';
    if (!form.email.trim()) {
      e.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'Please enter a valid email address.';
    }
    if (!form.username.trim()) e.username = 'Username is required.';
    const pwErr = validatePassword(form.password);
    if (!form.password) e.password = 'Password is required.';
    else if (pwErr) e.password = pwErr;
    if (!form.confirmPassword) {
      e.confirmPassword = 'Please confirm your password.';
    } else if (form.password !== form.confirmPassword) {
      e.confirmPassword = 'Passwords do not match.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleRegister() {
    if (!validate()) return;
    setServerError('');
    setLoading(true);
    const { error } = await signUp({
      lastName: form.lastName,
      firstName: form.firstName,
      nickname: form.nickname,
      email: form.email,
      username: form.username,
      password: form.password,
    });
    setLoading(false);
    if (error) {
      setServerError(error.message || 'Registration failed. Please try again.');
    } else {
      router.push({ pathname: '/verify-email', params: { email: form.email } });
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Ionicons name="wallet" size={32} color={colors.primary} />
          </View>
          <Text style={styles.appName}>BillSplitts</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Register</Text>

          {!!serverError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{serverError}</Text>
            </View>
          )}

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Input label="Last Name *" value={form.lastName} onChangeText={set('lastName')}
                placeholder="Dela Cruz" error={errors.lastName} autoCapitalize="words" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="First Name *" value={form.firstName} onChangeText={set('firstName')}
                placeholder="Juan" error={errors.firstName} autoCapitalize="words" />
            </View>
          </View>

          <Input label="Nickname *" value={form.nickname} onChangeText={set('nickname')}
            placeholder="jdc" error={errors.nickname} leftIcon="at-outline" />
          <Input label="Email Address *" value={form.email} onChangeText={set('email')}
            placeholder="juan@example.com" keyboardType="email-address" error={errors.email} leftIcon="mail-outline" />
          <Input label="Username *" value={form.username} onChangeText={set('username')}
            placeholder="juandc" error={errors.username} leftIcon="person-outline" />
          <Input label="Password *" value={form.password} onChangeText={set('password')}
            placeholder="Min 8 chars, upper, lower, number, special" secureTextEntry error={errors.password} leftIcon="lock-closed-outline" />
          <Input label="Confirm Password *" value={form.confirmPassword} onChangeText={set('confirmPassword')}
            placeholder="Re-enter password" secureTextEntry error={errors.confirmPassword} leftIcon="shield-checkmark-outline" />

          <Text style={styles.hint}>
            Password: 8–16 characters, must include uppercase, lowercase, number, and special character.
          </Text>

          <Button title="Create Account" icon="checkmark-circle-outline" iconPosition="right" onPress={handleRegister} loading={loading} style={styles.btn} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/login">
              <Text style={styles.link}>Sign In</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xl },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  logoBox: {
    width: 64, height: 64, borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  appName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary },
  tagline: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  errorBox: {
    backgroundColor: colors.errorLight, borderRadius: borderRadius.sm,
    padding: spacing.md, marginBottom: spacing.md,
  },
  errorBoxText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '500' },
  row: { flexDirection: 'row' },
  hint: { fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
  btn: { marginTop: spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.textSecondary, fontSize: fontSize.sm },
  link: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
});
