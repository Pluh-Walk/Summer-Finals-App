import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Input from '../components/Input';
import Button from '../components/Button';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

const OTP_LENGTH = 6;

// Step 1 — Enter email
function StepEmail({ onNext }) {
  const { sendPasswordResetOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: err } = await sendPasswordResetOtp(email.trim());
    setLoading(false);
    if (err) {
      setError(err.message || 'Could not send code. Please check the email address.');
    } else {
      onNext(email.trim());
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>Forgot Password?</Text>
      <Text style={styles.message}>
        Enter your registered email address and we'll send you a 6-digit verification code.
      </Text>
      <Input
        label="Email Address"
        value={email}
        onChangeText={(v) => { setEmail(v); setError(''); }}
        placeholder="juan@example.com"
        keyboardType="email-address"
        error={error}
      />
      <Button title="Send Code" onPress={handleSend} loading={loading} style={styles.btn} />
      <Button title="Back to Login" onPress={() => router.back()} variant="ghost" style={styles.backBtn} />
    </View>
  );
}

// Step 2 — Enter 6-digit OTP
function StepOtp({ email, onNext, onBack }) {
  const { verifyPasswordResetOtp } = useAuth();
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const { sendPasswordResetOtp } = useAuth();
  const inputRefs = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; }), 1000);
    return () => clearInterval(t);
  }, []);

  function handleOtpChange(text, index) {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (!cleaned && text) return;
    const newOtp = [...otp];
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, OTP_LENGTH - index).split('');
      chars.forEach((c, i) => { if (index + i < OTP_LENGTH) newOtp[index + i] = c; });
      setOtp(newOtp);
      inputRefs.current[Math.min(index + chars.length, OTP_LENGTH - 1)]?.focus();
      return;
    }
    newOtp[index] = cleaned;
    setOtp(newOtp);
    setError('');
    if (cleaned && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
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
    if (token.length < OTP_LENGTH) { setError('Please enter the complete 6-digit code.'); return; }
    setError('');
    setVerifying(true);
    const { error: err } = await verifyPasswordResetOtp({ email, token });
    setVerifying(false);
    if (err) {
      setError('Invalid or expired code. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } else {
      onNext();
    }
  }

  async function handleResend() {
    setResending(true);
    const { error: err } = await sendPasswordResetOtp(email);
    setResending(false);
    if (err) {
      Alert.alert('Error', err.message || 'Failed to resend code.');
    } else {
      setOtp(Array(OTP_LENGTH).fill(''));
      setError('');
      setCooldown(60);
      inputRefs.current[0]?.focus();
    }
  }

  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(b.length) + c);

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>📩</Text>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.message}>
        We sent a 6-digit code to{'\n'}
        <Text style={styles.emailText}>{maskedEmail}</Text>
      </Text>

      <View style={styles.otpRow}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(r) => (inputRefs.current[index] = r)}
            style={[styles.otpBox, digit && styles.otpBoxFilled, error && styles.otpBoxError]}
            value={digit}
            onChangeText={(t) => handleOtpChange(t, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            keyboardType="number-pad"
            maxLength={1}
            textAlign="center"
            autoFocus={index === 0}
          />
        ))}
      </View>

      {!!error && <Text style={styles.otpError}>{error}</Text>}

      <Button title="Verify Code" onPress={handleVerify} loading={verifying} style={styles.btn} />

      <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || resending} style={styles.resendBtn}>
        <Text style={[styles.resendText, (cooldown > 0 || resending) && styles.resendDisabled]}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
        </Text>
      </TouchableOpacity>

      <Button title="Back" onPress={onBack} variant="ghost" style={styles.backBtn} />
    </View>
  );
}

// Step 3 — Set new password
function StepNewPassword({ onDone }) {
  const { setNewPasswordAfterOtp } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const errs = {};
    if (!newPassword) errs.newPassword = 'New password is required.';
    else if (newPassword.length < 6) errs.newPassword = 'Password must be at least 6 characters.';
    if (!confirmPassword) errs.confirmPassword = 'Please confirm your password.';
    else if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    const { error: err } = await setNewPasswordAfterOtp(newPassword);
    setLoading(false);
    if (err) {
      setErrors({ newPassword: err.message || 'Failed to update password.' });
    } else {
      onDone();
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>🔑</Text>
      <Text style={styles.title}>Set New Password</Text>
      <Text style={styles.message}>
        Choose a strong password for your account.
      </Text>
      <Input
        label="New Password"
        value={newPassword}
        onChangeText={(v) => { setNewPassword(v); setErrors((e) => ({ ...e, newPassword: null })); }}
        placeholder="At least 6 characters"
        secureTextEntry
        error={errors.newPassword}
      />
      <Input
        label="Confirm Password"
        value={confirmPassword}
        onChangeText={(v) => { setConfirmPassword(v); setErrors((e) => ({ ...e, confirmPassword: null })); }}
        placeholder="Re-enter your password"
        secureTextEntry
        error={errors.confirmPassword}
        style={styles.inputSpaced}
      />
      <Button title="Update Password" onPress={handleSave} loading={loading} style={styles.btn} />
    </View>
  );
}

export default function ForgotPassword() {
  const [step, setStep] = useState(1); // 1 = email, 2 = otp, 3 = new password
  const [email, setEmail] = useState('');

  if (step === 1) return (
    <Wrapper>
      <StepEmail onNext={(e) => { setEmail(e); setStep(2); }} />
    </Wrapper>
  );

  if (step === 2) return (
    <Wrapper>
      <StepOtp email={email} onNext={() => setStep(3)} onBack={() => setStep(1)} />
    </Wrapper>
  );

  return (
    <Wrapper>
      <StepNewPassword onDone={() => router.replace('/login')} />
    </Wrapper>
  );
}

function Wrapper({ children }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  message: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg, alignSelf: 'stretch' },
  emailText: { color: colors.primary, fontWeight: '600' },
  btn: { alignSelf: 'stretch', marginTop: spacing.md },
  backBtn: { alignSelf: 'stretch', marginTop: spacing.sm },
  inputSpaced: { marginTop: spacing.sm },
  otpRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  otpBox: {
    width: 44, height: 52, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: fontSize.xl, fontWeight: '700', color: colors.text,
    backgroundColor: colors.background, textAlign: 'center',
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  otpBoxError: { borderColor: colors.error },
  otpError: { fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.sm, textAlign: 'center' },
  resendBtn: { marginTop: spacing.md },
  resendText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  resendDisabled: { color: colors.textSecondary },
});
