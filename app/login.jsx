import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { Link, Redirect, router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Input from '../components/Input';
import Button from '../components/Button';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

export default function Login() {
  const { user, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  if (user) return <Redirect href="/(tabs)/home" />;

  function validate() {
    const e = {};
    if (!username.trim()) e.username = 'Username is required.';
    if (!password) e.password = 'Password is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    setAuthError('');
    setLoading(true);
    const { error } = await signIn({ username, password });
    setLoading(false);
    if (error) {
      setAuthError('Incorrect username or password.');
    } else {
      router.replace('/(tabs)/home');
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
            <Text style={styles.logoIcon}>💸</Text>
          </View>
          <Text style={styles.appName}>BillSplitts</Text>
          <Text style={styles.tagline}>Split bills, keep friendships</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          {!!authError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{authError}</Text>
            </View>
          )}

          <Input
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your username"
            error={errors.username}
            autoCapitalize="none"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            error={errors.password}
          />

          <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.forgotLink}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <Button title="Sign In" onPress={handleLogin} loading={loading} style={styles.btn} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/register">
              <Text style={styles.link}>Register</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  logoBox: {
    width: 72, height: 72, borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoIcon: { fontSize: 36 },
  appName: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 },
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
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  errorBox: {
    backgroundColor: colors.errorLight, borderRadius: borderRadius.sm,
    padding: spacing.md, marginBottom: spacing.md,
  },
  errorBoxText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '500' },
  forgotLink: { alignSelf: 'flex-end', marginTop: -spacing.xs, marginBottom: spacing.lg },
  forgotText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '500' },
  btn: { marginTop: spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.textSecondary, fontSize: fontSize.sm },
  link: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
});
