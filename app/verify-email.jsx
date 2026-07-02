import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { colors, spacing, fontSize, borderRadius, shadow } from '../constants/theme';

const OTP_LENGTH = 6;

export default function VerifyEmail() {
  const { email } = useLocalSearchParams();
  const { verifyOtp, resendVerification, signOut } = useAuth();
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  // Start countdown on mount
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function handleOtpChange(text, index) {
    // Allow only digits
    const cleaned = text.replace(/[^0-9]/g, '');
    if (!cleaned && text) return;

    const newOtp = [...otp];

    if (cleaned.length > 1) {
      // Handle paste — fill from current index
      const chars = cleaned.slice(0, OTP_LENGTH - index).split('');
      chars.forEach((c, i) => {
        if (index + i < OTP_LENGTH) newOtp[index + i] = c;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + chars.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = cleaned;
    setOtp(newOtp);
    setError('');

    if (cleaned && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(e, index) {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    const token = otp.join('');
    if (token.length < OTP_LENGTH) {
      setError('Please enter the complete 6-digit code.');
      return;
    }
    setError('');
    setVerifying(true);
    const { error: err } = await verifyOtp({ email, token });
    setVerifying(false);

    if (err) {
      setError('Invalid or expired code. Please check and try again.');
      // Clear OTP on wrong code
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } else {
      // Sign out the auto-created session from verifyOtp, then go to login
      await signOut();
      router.replace('/login');
    }
  }

  async function handleResend() {
    setResending(true);
    const { error: err } = await resendVerification(email);
    setResending(false);
    if (err) {
      Alert.alert('Error', err.message || 'Failed to resend code. Please wait and try again.');
    } else {
      setOtp(Array(OTP_LENGTH).fill(''));
      setError('');
      setResendCooldown(60);
      // Restart countdown
      inputRefs.current[0]?.focus();
      Alert.alert('Code Sent!', `A new verification code has been sent to ${email}.`);
    }
  }

  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
    : '';

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
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/register')}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>📧</Text>
          </View>

          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit verification code to{'\n'}
            <Text style={styles.emailText}>{maskedEmail}</Text>
          </Text>

          {/* OTP Input */}
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputRefs.current[index] = ref)}
                style={[
                  styles.otpBox,
                  digit && styles.otpBoxFilled,
                  error && styles.otpBoxError,
                ]}
                value={digit}
                onChangeText={(text) => handleOtpChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                autoFocus={index === 0}
                selectTextOnFocus
              />
            ))}
          </View>

          {/* Error */}
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Verify Button */}
          <Button
            title="Verify Email"
            onPress={handleVerify}
            loading={verifying}
            disabled={otp.join('').length < OTP_LENGTH}
            size="lg"
            style={styles.verifyBtn}
          />

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive the code? </Text>
            {resendCooldown > 0 ? (
              <Text style={styles.cooldownText}>Resend in {resendCooldown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={resending}>
                {resending
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={styles.resendLink}>Resend code</Text>
                }
              </TouchableOpacity>
            )}
          </View>

          {/* Tips */}
          <View style={styles.tips}>
            <Text style={styles.tipsTitle}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} /> Tips
            </Text>
            <Text style={styles.tipText}>• Check your spam or junk folder</Text>
            <Text style={styles.tipText}>• The code expires in 60 minutes</Text>
            <Text style={styles.tipText}>• Make sure the email address is correct</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  backBtn: {
    alignSelf: 'flex-start', marginBottom: spacing.md,
    padding: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.md,
  },
  iconBox: {
    width: 72, height: 72, borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconText: { fontSize: 36 },
  title: {
    fontSize: fontSize.xl, fontWeight: '800', color: colors.text,
    marginBottom: spacing.sm, textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl,
  },
  emailText: { color: colors.primary, fontWeight: '700' },
  otpRow: {
    flexDirection: 'row', gap: spacing.sm,
    marginBottom: spacing.lg, alignSelf: 'stretch', justifyContent: 'center',
  },
  otpBox: {
    width: 46, height: 54, borderRadius: borderRadius.md,
    borderWidth: 2, borderColor: colors.border,
    fontSize: fontSize.xl, fontWeight: '700', color: colors.text,
    backgroundColor: colors.background,
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  otpBoxError: {
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.errorLight, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    alignSelf: 'stretch', marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error, flex: 1 },
  verifyBtn: { alignSelf: 'stretch', marginBottom: spacing.md },
  resendRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: spacing.lg,
  },
  resendLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  resendLink: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  cooldownText: { fontSize: fontSize.sm, color: colors.textLight, fontWeight: '600' },
  tips: {
    alignSelf: 'stretch',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md, gap: spacing.xs,
  },
  tipsTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  tipText: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 },
});
