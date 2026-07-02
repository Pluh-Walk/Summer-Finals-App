import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../constants/theme';

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function Profile() {
  const { user, profile, signOut, upgradeToPremuim, changePassword, loading } = useAuth();
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [logoutConfirming, setLogoutConfirming] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Reset password state
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetErrors, setResetErrors] = useState({});
  const [resetting, setResetting] = useState(false);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Profile not found</Text>
        <Text style={styles.errorSubtitle}>
          Your profile data could not be loaded.{`\n`}This usually means the database setup is incomplete.
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          <Text style={styles.retryBtnText}>Logout &amp; Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase();
  const isPremium = profile.account_type === 'premium';

  function handleLogout() {
    setLogoutConfirming(true);
  }

  async function executeLogout() {
    setLoggingOut(true);
    await signOut();
    router.replace('/login');
  }

  async function handleUpgrade() {
    setUpgrading(true);
    const { error } = await upgradeToPremuim();
    setUpgrading(false);
    setUpgradeModalVisible(false);
    if (error) {
      Alert.alert('Error', 'Upgrade failed. Please try again.');
    } else {
      Alert.alert('🎉 Upgraded!', 'Your account has been upgraded to Premium. Enjoy unlimited bills and participants!');
    }
  }

  function openResetModal() {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setResetErrors({});
    setResetModalVisible(true);
  }

  async function handleResetPassword() {
    const errors = {};
    if (!oldPassword) errors.oldPassword = 'Current password is required.';
    if (!newPassword) errors.newPassword = 'New password is required.';
    else if (newPassword.length < 6) errors.newPassword = 'New password must be at least 6 characters.';
    if (!confirmPassword) errors.confirmPassword = 'Please confirm your new password.';
    else if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

    if (Object.keys(errors).length > 0) {
      setResetErrors(errors);
      return;
    }

    setResetting(true);
    const { error } = await changePassword({ oldPassword, newPassword });
    setResetting(false);

    if (error) {
      setResetErrors({ oldPassword: error.message });
    } else {
      setResetModalVisible(false);
      Alert.alert('Success', 'Your password has been updated successfully.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar & Name */}
      <View style={styles.heroCard}>
        <View style={[styles.avatar, isPremium && styles.avatarPremium]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.fullName}>{profile.first_name} {profile.last_name}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
        <View style={[styles.accountBadge, isPremium ? styles.premiumBadge : styles.standardBadge]}>
          <Text style={[styles.accountBadgeText, isPremium ? styles.premiumText : styles.standardText]}>
            {isPremium ? '⭐ Premium Account' : '🔹 Standard Account'}
          </Text>
        </View>
      </View>

      {/* Account Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account Information</Text>
        <InfoRow label="First Name" value={profile.first_name} />
        <InfoRow label="Last Name" value={profile.last_name} />
        <InfoRow label="Nickname" value={profile.nickname} />
        <InfoRow label="Email" value={profile.email || user.email} />
        <InfoRow label="Username" value={`@${profile.username}`} />
      </View>

      {/* Account Type */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account Type</Text>
        <View style={[styles.accountTypeBox, isPremium ? styles.premiumBox : styles.standardBox]}>
          <Text style={styles.accountTypeIcon}>{isPremium ? '⭐' : '🔹'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountTypeName}>{isPremium ? 'Premium' : 'Standard'}</Text>
            {isPremium ? (
              <Text style={styles.accountTypeDesc}>Unlimited bills and participants. Full access.</Text>
            ) : (
              <Text style={styles.accountTypeDesc}>5 bills/month · 3 persons/bill</Text>
            )}
          </View>
        </View>

        {!isPremium && (
          <View style={styles.upgradeSection}>
            <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
            <Text style={styles.upgradeDesc}>
              Get unlimited bill creation and no restrictions on participants.
            </Text>
            <Button
              title="⭐ Upgrade Now — ₱299/month"
              variant="premium"
              onPress={() => setUpgradeModalVisible(true)}
              style={styles.upgradeBtn}
            />
          </View>
        )}
      </View>

      {/* Security */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Security</Text>
        <TouchableOpacity style={styles.securityRow} onPress={openResetModal}>
          <View style={styles.securityRowLeft}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            <Text style={styles.securityRowText}>Reset Password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <View style={styles.card}>
        {logoutConfirming ? (
          <View>
            <Text style={styles.logoutConfirmText}>Are you sure you want to logout?</Text>
            <View style={styles.logoutConfirmRow}>
              <TouchableOpacity
                style={styles.logoutConfirmCancelBtn}
                onPress={() => setLogoutConfirming(false)}
                disabled={loggingOut}
              >
                <Text style={styles.logoutConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutConfirmYesBtn}
                onPress={executeLogout}
                disabled={loggingOut}
              >
                {loggingOut
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.logoutConfirmYesText}>Yes, Logout</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Reset Password Modal */}
      <Modal visible={resetModalVisible} transparent animationType="slide" onRequestClose={() => setResetModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => setResetModalVisible(false)} disabled={resetting}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              label="Current Password"
              value={oldPassword}
              onChangeText={(v) => { setOldPassword(v); setResetErrors((e) => ({ ...e, oldPassword: null })); }}
              placeholder="Enter current password"
              secureTextEntry
              error={resetErrors.oldPassword}
            />
            <Input
              label="New Password"
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setResetErrors((e) => ({ ...e, newPassword: null })); }}
              placeholder="Enter new password"
              secureTextEntry
              error={resetErrors.newPassword}
              style={styles.resetInput}
            />
            <Input
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setResetErrors((e) => ({ ...e, confirmPassword: null })); }}
              placeholder="Re-enter new password"
              secureTextEntry
              error={resetErrors.confirmPassword}
              style={styles.resetInput}
            />

            <Button
              title="Update Password"
              onPress={handleResetPassword}
              loading={resetting}
              style={styles.confirmBtn}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setResetModalVisible(false)}
              style={styles.cancelBtn}
            />
          </View>
        </View>
      </Modal>

      {/* Upgrade Confirmation Modal */}
      <Modal visible={upgradeModalVisible} transparent animationType="slide" onRequestClose={() => setUpgradeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.upgradeModalContent}>
              <Text style={styles.modalIcon}>⭐</Text>
              <Text style={styles.modalTitle}>Upgrade to Premium</Text>
              <Text style={styles.modalDesc}>
                Upgrade your account for{'\n'}
                <Text style={styles.modalPrice}>₱299 / month</Text>
              </Text>
              <View style={styles.modalFeatures}>
                <Text style={styles.modalFeature}>✅ Unlimited bills per month</Text>
                <Text style={styles.modalFeature}>✅ Unlimited participants per bill</Text>
                <Text style={styles.modalFeature}>✅ All Standard features included</Text>
              </View>
            </View>
            <Button
              title="Confirm Upgrade — ₱299"
              variant="premium"
              onPress={handleUpgrade}
              loading={upgrading}
              style={styles.confirmBtn}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setUpgradeModalVisible(false)}
              style={styles.cancelBtn}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: spacing.xl },
  errorIcon: { fontSize: 48, marginBottom: spacing.md },
  errorTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  errorSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  retryBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadow.md,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarPremium: { backgroundColor: colors.premiumLight, borderWidth: 2, borderColor: colors.premium },
  avatarText: { fontSize: 32, fontWeight: '700', color: colors.primary },
  fullName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  username: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm },
  accountBadge: { borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  premiumBadge: { backgroundColor: colors.premiumLight },
  standardBadge: { backgroundColor: colors.standardLight },
  accountBadgeText: { fontSize: fontSize.sm, fontWeight: '700' },
  premiumText: { color: colors.premium },
  standardText: { color: colors.standard },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  accountTypeBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: borderRadius.md, padding: spacing.md,
  },
  premiumBox: { backgroundColor: colors.premiumLight },
  standardBox: { backgroundColor: colors.standardLight },
  accountTypeIcon: { fontSize: 28 },
  accountTypeName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  accountTypeDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  upgradeSection: {
    borderTopWidth: 1, borderTopColor: colors.border,
    marginTop: spacing.md, paddingTop: spacing.md,
  },
  upgradeTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  upgradeDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  upgradeBtn: {},
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  logoutText: { fontSize: fontSize.md, fontWeight: '600', color: colors.error },
  securityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  securityRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  securityRowText: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  resetInput: { marginTop: spacing.sm },
  logoutConfirmText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  logoutConfirmRow: { flexDirection: 'row', gap: spacing.sm },
  logoutConfirmCancelBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  logoutConfirmCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
  logoutConfirmYesBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md,
    backgroundColor: colors.error, alignItems: 'center',
  },
  logoutConfirmYesText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalIcon: { fontSize: 48, marginBottom: spacing.sm },
  upgradeModalContent: { alignItems: 'center' },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  modalDesc: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  modalPrice: { fontSize: fontSize.xl, fontWeight: '800', color: colors.premium },
  modalFeatures: { alignSelf: 'stretch', marginBottom: spacing.lg, gap: spacing.xs },
  modalFeature: { fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },
  confirmBtn: { alignSelf: 'stretch', marginBottom: spacing.sm },
  cancelBtn: { alignSelf: 'stretch' },
});
